'use strict';

const fc = require('fast-check');
const { nameSchema, tourMetaSchema, stripHtml, isUuid } = require('./validation');
const { toDecimal, gpsFromExifTags } = require('./extractGps');

describe('validation (properties)', () => {
  it('a name that passes contains no angle brackets and is 1-200 chars', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (raw) => {
        const result = nameSchema.safeParse(raw);
        const stripped = stripHtml(raw);
        expect(result.success).toBe(stripped.length >= 1 && stripped.length <= 200);
        if (result.success) {
          expect(result.data).toBe(stripped);
          expect(result.data).not.toMatch(/[<>]/);
        }
      }),
    );
  });

  it('stripHtml is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        expect(stripHtml(stripHtml(raw))).toBe(stripHtml(raw));
      }),
    );
  });

  it('a valid tour meta DTO round-trips unchanged', () => {
    const dto = fc.record(
      {
        name: fc
          .string({ minLength: 1, maxLength: 200 })
          .filter((text) => stripHtml(text) === text && text.length > 0),
        description: fc.string({ maxLength: 2000 }).filter((text) => stripHtml(text) === text),
        createdAt: fc
          .date({ min: new Date('1990-01-01'), max: new Date('2100-01-01'), noInvalidDate: true })
          .map((date) => date.toISOString()),
      },
      { requiredKeys: [] },
    );
    fc.assert(
      fc.property(dto, (value) => {
        const result = tourMetaSchema.safeParse(value);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(value);
      }),
    );
  });

  it('isUuid accepts every UUID and rejects any other string shape', () => {
    fc.assert(
      fc.property(fc.uuid(), (id) => {
        expect(isUuid(id)).toBe(true);
      }),
    );
    fc.assert(
      fc.property(fc.string(), (text) => {
        fc.pre(!/^[0-9a-f-]{36}$/i.test(text));
        expect(isUuid(text)).toBe(false);
      }),
    );
  });
});

describe('EXIF GPS (properties)', () => {
  const degreesMinutesSeconds = fc.tuple(
    fc.double({ min: 0, max: 180, noNaN: true }),
    fc.double({ min: 0, max: 59.999, noNaN: true }),
    fc.double({ min: 0, max: 59.999, noNaN: true }),
  );

  it('coordinates are in range or absent, never NaN', () => {
    fc.assert(
      fc.property(
        fc.oneof(degreesMinutesSeconds, fc.double(), fc.constant(undefined)),
        fc.constantFrom('N', 'S', undefined),
        fc.oneof(degreesMinutesSeconds, fc.double(), fc.constant(undefined)),
        fc.constantFrom('E', 'W', undefined),
        (latitude, latitudeHemisphere, longitude, longitudeHemisphere) => {
          const gps = gpsFromExifTags({
            GPSInfo: {
              GPSLatitude: latitude,
              GPSLatitudeRef: latitudeHemisphere,
              GPSLongitude: longitude,
              GPSLongitudeRef: longitudeHemisphere,
            },
          });
          if (gps === null) return;
          expect(Number.isFinite(gps.lat) && Number.isFinite(gps.lon)).toBe(true);
          expect(Math.abs(gps.lat)).toBeLessThanOrEqual(90);
          expect(Math.abs(gps.lon)).toBeLessThanOrEqual(180);
        },
      ),
    );
  });

  it('the hemisphere sets the sign, the magnitude comes from the value', () => {
    fc.assert(
      fc.property(
        degreesMinutesSeconds,
        fc.constantFrom('N', 'S', 'E', 'W'),
        (value, hemisphere) => {
          const decimal = toDecimal(value, hemisphere);
          const magnitude = value[0] + value[1] / 60 + value[2] / 3600;
          expect(Math.abs(decimal)).toBeCloseTo(magnitude, 9);
          if (hemisphere === 'S' || hemisphere === 'W') expect(decimal).toBeLessThanOrEqual(0);
          else expect(decimal).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});

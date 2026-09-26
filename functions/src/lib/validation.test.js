'use strict';

const {
  tourMetaSchema,
  tourMetaError,
  isUuid,
  invalidIdParams,
  isImageContentType,
  languageSchema,
  SUPPORTED_LANGUAGE_CODES,
} = require('./validation');

const UUID = '11111111-1111-4111-8111-111111111111';

describe('validation helpers', () => {
  describe('tourMetaSchema', () => {
    it('keeps markup in name and description as typed, trimmed (#574)', () => {
      const result = tourMetaSchema.safeParse({
        name: ' <b>Alps</b> ',
        description: '\t<script>x</script>\n',
      });
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('<b>Alps</b>');
      expect(result.data.description).toBe('<script>x</script>');
    });

    it('limits the trimmed name to 200 characters', () => {
      expect(tourMetaSchema.safeParse({ name: 'a'.repeat(201) }).success).toBe(false);
      expect(tourMetaSchema.safeParse({ name: ` ${'a'.repeat(200)} ` }).success).toBe(true);
    });

    it('limits the trimmed description to 2000 characters', () => {
      expect(tourMetaSchema.safeParse({ description: 'a'.repeat(2001) }).success).toBe(false);
      expect(tourMetaSchema.safeParse({ description: ` ${'a'.repeat(2000)} ` }).success).toBe(true);
    });

    it('rejects a name that is empty after trimming', () => {
      expect(tourMetaSchema.safeParse({ name: '   ' }).success).toBe(false);
    });

    it('allows omitting both fields', () => {
      expect(tourMetaSchema.safeParse({}).success).toBe(true);
    });

    it('accepts a valid ISO datetime createdAt', () => {
      const result = tourMetaSchema.safeParse({ createdAt: '2026-05-01T10:00:00.000Z' });
      expect(result.success).toBe(true);
      expect(result.data.createdAt).toBe('2026-05-01T10:00:00.000Z');
    });

    it('rejects a createdAt that is not a full ISO datetime', () => {
      expect(tourMetaSchema.safeParse({ createdAt: '2026-05-01' }).success).toBe(false);
      expect(tourMetaSchema.safeParse({ createdAt: 'not-a-date' }).success).toBe(false);
    });
  });

  describe('isUuid', () => {
    it('accepts a valid UUID and rejects junk', () => {
      expect(isUuid(UUID)).toBe(true);
      expect(isUuid('t1')).toBe(false);
      expect(isUuid('../../etc')).toBe(false);
      expect(isUuid(undefined)).toBe(false);
    });

    it('rejects a non-string that would coerce to a matching pattern', () => {
      // [UUID].toString() === UUID, so only the type check tells them apart.
      expect(isUuid([UUID])).toBe(false);
    });
  });

  describe('invalidIdParams', () => {
    it('returns no names when every param is a UUID', () => {
      expect(invalidIdParams({ tourId: UUID, imageId: UUID })).toEqual([]);
    });

    it('names each param that is not a UUID, in order', () => {
      expect(invalidIdParams({ tourId: 'bad', imageId: UUID, otherId: '' })).toEqual([
        'tourId',
        'otherId',
      ]);
    });
  });

  describe('tourMetaError', () => {
    const keyFor = (input) => tourMetaError(tourMetaSchema.safeParse(input).error).jsonBody.error;

    it('names the field that failed', () => {
      expect(keyFor({ name: '' })).toBe('errors.tourName');
      expect(keyFor({ description: 'd'.repeat(2001) })).toBe('errors.tourDescription');
      expect(keyFor({ createdAt: 'not-a-date' })).toBe('errors.tourDate');
    });

    it('falls back to a generic key when the body has no field path', () => {
      expect(keyFor('not-an-object')).toBe('errors.tourInvalid');
    });

    it('answers 400 and leaks no Zod wording', () => {
      const response = tourMetaError(tourMetaSchema.safeParse({ name: '' }).error);

      expect(response.status).toBe(400);
      expect(response.jsonBody.error).not.toMatch(/expected|characters|Too small/i);
    });

    it('reports a name trimmed down to nothing as a name problem', () => {
      expect(keyFor({ name: ' \n ' })).toBe('errors.tourName');
    });
  });

  describe('isImageContentType', () => {
    it('accepts jpeg/png and rejects others', () => {
      expect(isImageContentType('image/jpeg')).toBe(true);
      expect(isImageContentType('image/png')).toBe(true);
      expect(isImageContentType('text/plain')).toBe(false);
      expect(isImageContentType('image/gif')).toBe(false);
    });
  });

  describe('languageSchema', () => {
    it('accepts every supported language code', () => {
      for (const code of SUPPORTED_LANGUAGE_CODES) {
        expect(languageSchema.safeParse(code).success).toBe(true);
      }
    });

    it('rejects an unsupported code', () => {
      expect(languageSchema.safeParse('xx').success).toBe(false);
      expect(languageSchema.safeParse('EN').success).toBe(false);
    });
  });
});

'use strict';

const {
  stripHtml,
  tourMetaSchema,
  tourMetaError,
  isUuid,
  uuidParamError,
  isImageContentType,
  languageSchema,
  SUPPORTED_LANGUAGE_CODES,
} = require('./validation');

const UUID = '11111111-1111-4111-8111-111111111111';

describe('validation helpers', () => {
  describe('stripHtml', () => {
    it('removes angle brackets and trims', () => {
      expect(stripHtml('  <b>hi</b> there <script>x</script>  ')).toBe(
        'bhi/b there scriptx/script',
      );
    });

    it('defeats the nested-tag bypass that CodeQL flags', () => {
      expect(stripHtml('<<script>script>')).not.toContain('<');
      expect(stripHtml('<<script>script>')).not.toContain('>');
    });
  });

  describe('tourMetaSchema', () => {
    it('strips angle brackets from name and description', () => {
      const r = tourMetaSchema.safeParse({ name: '<b>Alps</b>', description: '<i>nice</i>' });
      expect(r.success).toBe(true);
      expect(r.data.name).toBe('bAlps/b');
      expect(r.data.description).toBe('inice/i');
    });

    it('rejects an over-long name (after stripping)', () => {
      const r = tourMetaSchema.safeParse({ name: 'a'.repeat(201) });
      expect(r.success).toBe(false);
    });

    it('rejects a name that is empty after stripping', () => {
      const r = tourMetaSchema.safeParse({ name: '<>' });
      expect(r.success).toBe(false);
    });

    it('allows omitting both fields', () => {
      expect(tourMetaSchema.safeParse({}).success).toBe(true);
    });

    it('accepts a valid ISO datetime createdAt', () => {
      const r = tourMetaSchema.safeParse({ createdAt: '2026-05-01T10:00:00.000Z' });
      expect(r.success).toBe(true);
      expect(r.data.createdAt).toBe('2026-05-01T10:00:00.000Z');
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
      // A single-element array stringifies to just its element — [UUID].toString()
      // === UUID — so the regex alone can't tell them apart; the typeof check must.
      expect(isUuid([UUID])).toBe(false);
    });
  });

  describe('uuidParamError', () => {
    it('returns null when all params are valid UUIDs', () => {
      expect(uuidParamError({ tourId: UUID })).toBeNull();
    });

    it('returns a 400 response naming the bad param', () => {
      const res = uuidParamError({ tourId: 'bad' });
      expect(res.status).toBe(400);
      expect(res.jsonBody.error).toContain('tourId');
    });
  });

  // The client renders these verbatim, so they must be i18n keys and never
  // Zod's own English, schema-shaped wording (#359).
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
      const res = tourMetaError(tourMetaSchema.safeParse({ name: '' }).error);

      expect(res.status).toBe(400);
      expect(res.jsonBody.error).not.toMatch(/expected|characters|Too small/i);
    });

    // stripHtml turns "<<>>" into "", so the user typed four characters and is
    // told the name is required — the message has to explain the rule itself.
    it('reports a name stripped down to nothing as a name problem', () => {
      expect(keyFor({ name: '<<>>' })).toBe('errors.tourName');
    });

    // Both `?.` steps guard against a shape that's not a real ZodError — an
    // empty issues array, or an issue with no path — rather than throwing.
    it('falls back to the generic key without throwing when issues is empty', () => {
      expect(tourMetaError({ issues: [] }).jsonBody.error).toBe('errors.tourInvalid');
    });

    it('falls back to the generic key without throwing when an issue has no path', () => {
      expect(tourMetaError({ issues: [{ message: 'bad' }] }).jsonBody.error).toBe(
        'errors.tourInvalid',
      );
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

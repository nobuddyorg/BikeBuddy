'use strict';

const {
  stripHtml,
  tourMetaSchema,
  isUuid,
  uuidParamError,
  isImageContentType,
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
  });

  describe('isUuid', () => {
    it('accepts a valid UUID and rejects junk', () => {
      expect(isUuid(UUID)).toBe(true);
      expect(isUuid('t1')).toBe(false);
      expect(isUuid('../../etc')).toBe(false);
      expect(isUuid(undefined)).toBe(false);
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

  describe('isImageContentType', () => {
    it('accepts jpeg/png and rejects others', () => {
      expect(isImageContentType('image/jpeg')).toBe(true);
      expect(isImageContentType('image/png')).toBe(true);
      expect(isImageContentType('text/plain')).toBe(false);
      expect(isImageContentType('image/gif')).toBe(false);
    });
  });
});

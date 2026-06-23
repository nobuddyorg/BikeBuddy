'use strict';

const {
  stripHtml,
  tourMetaSchema,
  isUuid,
  requireUuids,
  isImageContentType,
} = require('./validation');

const UUID = '11111111-1111-4111-8111-111111111111';

describe('validation helpers', () => {
  describe('stripHtml', () => {
    it('removes tags and trims', () => {
      expect(stripHtml('  <b>hi</b> there <script>x</script>  ')).toBe('hi there x');
    });
  });

  describe('tourMetaSchema', () => {
    it('strips HTML from name and description', () => {
      const r = tourMetaSchema.safeParse({ name: '<b>Alps</b>', description: '<i>nice</i>' });
      expect(r.success).toBe(true);
      expect(r.data.name).toBe('Alps');
      expect(r.data.description).toBe('nice');
    });

    it('rejects an over-long name (after stripping)', () => {
      const r = tourMetaSchema.safeParse({ name: 'a'.repeat(201) });
      expect(r.success).toBe(false);
    });

    it('rejects a name that is empty after stripping', () => {
      const r = tourMetaSchema.safeParse({ name: '<br/>' });
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

  describe('requireUuids', () => {
    it('returns true for valid UUIDs and leaves res untouched', () => {
      const ctx = { res: null };
      expect(requireUuids(ctx, { tourId: UUID })).toBe(true);
      expect(ctx.res).toBeNull();
    });

    it('sets a 400 naming the bad param', () => {
      const ctx = { res: null };
      expect(requireUuids(ctx, { tourId: 'bad' })).toBe(false);
      expect(ctx.res.status).toBe(400);
      expect(ctx.res.body.error).toContain('tourId');
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

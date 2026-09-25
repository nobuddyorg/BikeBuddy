import { describe, it, expect } from 'vitest';
import { parseAppUrl, buildAppUrl } from '../src/lib/url.js';

describe('parseAppUrl', () => {
  it('reads a tour id from the hash', () => {
    expect(parseAppUrl('', '#/tour/abc-123')).toMatchObject({ tourId: 'abc-123' });
  });

  it('decodes an encoded tour id', () => {
    expect(parseAppUrl('', '#/tour/a%20b')).toMatchObject({ tourId: 'a b' });
  });

  it('returns an empty tourId for an unrelated or empty hash', () => {
    expect(parseAppUrl('', '')).toMatchObject({ tourId: '' });
    expect(parseAppUrl('', '#something-else')).toMatchObject({ tourId: '' });
    expect(parseAppUrl('', '#/tour/abc/photos')).toMatchObject({ tourId: '' });
    expect(parseAppUrl('', '#x#/tour/abc')).toMatchObject({ tourId: '' });
  });

  it('reads sort, q and inView from the query string', () => {
    expect(parseAppUrl('?sort=name-asc&q=alps&inView=1', '')).toEqual({
      tourId: '',
      sort: 'name-asc',
      search: 'alps',
      inView: true,
    });
  });

  it('treats a missing or non-"1" inView as false', () => {
    expect(parseAppUrl('', '').inView).toBe(false);
    expect(parseAppUrl('?inView=true', '').inView).toBe(false);
  });

  it('combines query params and hash together', () => {
    expect(parseAppUrl('?sort=date-asc', '#/tour/xyz')).toEqual({
      tourId: 'xyz',
      sort: 'date-asc',
      search: '',
      inView: false,
    });
  });
});

describe('buildAppUrl', () => {
  const path = '/index.html';

  it('produces a bare path when everything is default/empty', () => {
    expect(buildAppUrl({ tourId: '', sort: 'date-desc', search: '', inView: false }, path)).toBe(
      path,
    );
  });

  it('omits sort when it is the default', () => {
    const url = buildAppUrl({ tourId: '', sort: 'date-desc', search: 'x', inView: false }, path);
    expect(url).not.toContain('sort=');
  });

  it('includes a non-default sort, q and inView as query params', () => {
    const url = buildAppUrl({ tourId: '', sort: 'name-asc', search: 'alps', inView: true }, path);
    expect(url).toBe(`${path}?sort=name-asc&q=alps&inView=1`);
  });

  it('appends the tour hash after any query string', () => {
    const url = buildAppUrl({ tourId: 'abc', sort: 'date-desc', search: '', inView: false }, path);
    expect(url).toBe(`${path}#/tour/abc`);
  });

  it('encodes a tour id that needs it', () => {
    const url = buildAppUrl({ tourId: 'a b', sort: 'date-desc', search: '', inView: false }, path);
    expect(url).toBe(`${path}#/tour/a%20b`);
  });

  it('round-trips through parseAppUrl', () => {
    const original = { tourId: 'tour-1', sort: 'length-desc', search: 'coast run', inView: true };
    const url = buildAppUrl(original, path);
    const [rest, hash] = url.split('#');
    const [, query] = rest.split('?');
    expect(parseAppUrl(query ? `?${query}` : '', hash ? `#${hash}` : '')).toEqual(original);
  });
});

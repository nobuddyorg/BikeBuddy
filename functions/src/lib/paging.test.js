'use strict';

const { MAX_PAGE_SIZE, pageRequest, pageBody } = require('./paging');

const tokenFor = (text) => Buffer.from(text, 'utf8').toString('base64url');
const requestFor = (parameters) => pageRequest(new URLSearchParams(parameters));

describe('pageRequest', () => {
  it('asks for everything without a limit', () => {
    expect(requestFor({})).toEqual({ kind: 'all' });
  });

  it('asks for the first page with a limit alone', () => {
    expect(requestFor({ limit: '25' })).toEqual({ kind: 'page', limit: 25, offset: 0 });
  });

  it('reads the offset back from the token it issued', () => {
    expect(requestFor({ limit: '1', continuationToken: tokenFor('40') })).toEqual({
      kind: 'page',
      limit: 1,
      offset: 40,
    });
  });

  it(`accepts a limit up to ${MAX_PAGE_SIZE} and an offset up to seven digits`, () => {
    expect(MAX_PAGE_SIZE).toBe(100);
    expect(requestFor({ limit: '100', continuationToken: tokenFor('9999999') })).toEqual({
      kind: 'page',
      limit: 100,
      offset: 9999999,
    });
  });

  it.each([
    ['a zero limit', { limit: '0' }],
    ['a limit over the maximum', { limit: '101' }],
    ['a four-digit limit', { limit: '1000' }],
    ['a negative limit', { limit: '-1' }],
    ['a fractional limit', { limit: '1.5' }],
    ['a padded limit', { limit: ' 5' }],
    ['a trailing character', { limit: '5x' }],
    ['a leading zero', { limit: '05' }],
    ['an empty limit', { limit: '' }],
    ['a token without a limit', { continuationToken: tokenFor('2') }],
    ['a token that is not base64url', { limit: '5', continuationToken: 'Mg==' }],
    ['an empty token', { limit: '5', continuationToken: '' }],
    ['an over-long token', { limit: '5', continuationToken: 'a'.repeat(17) }],
    ['a token for offset zero', { limit: '5', continuationToken: tokenFor('0') }],
    ['a token for an eight-digit offset', { limit: '5', continuationToken: tokenFor('10000000') }],
    ['a token for a negative offset', { limit: '5', continuationToken: tokenFor('-2') }],
    ['a token for a word', { limit: '5', continuationToken: tokenFor('ten') }],
    ['a token around a number', { limit: '5', continuationToken: tokenFor('x2y') }],
    ['a Cosmos-style token', { limit: '5', continuationToken: tokenFor('-RID:~ab#RT:1') }],
  ])('refuses %s', (_label, parameters) => {
    expect(requestFor(parameters)).toEqual({ kind: 'invalid' });
  });
});

describe('pageBody', () => {
  const page = { limit: 2, offset: 4 };

  it('carries the items and the token for the page after this one', () => {
    expect(pageBody({ items: [1, 2], page, more: true })).toEqual({
      items: [1, 2],
      continuationToken: tokenFor('6'),
    });
  });

  it('leaves the token out on the last page', () => {
    expect(pageBody({ items: [3], page, more: false })).toEqual({ items: [3] });
  });

  it('round-trips its token through pageRequest', () => {
    const { continuationToken } = pageBody({ items: [], page, more: true });
    expect(requestFor({ limit: '2', continuationToken })).toEqual({
      kind: 'page',
      limit: 2,
      offset: 6,
    });
  });
});

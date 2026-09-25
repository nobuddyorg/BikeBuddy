'use strict';

const { currentTime, newId } = require('./system');

describe('system', () => {
  it('reads the current time', () => {
    const before = Date.now();
    const time = currentTime();
    expect(time).toBeInstanceOf(Date);
    expect(time.getTime()).toBeGreaterThanOrEqual(before);
    expect(time.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('generates a fresh v4 UUID each time', () => {
    const first = newId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newId()).not.toBe(first);
  });
});

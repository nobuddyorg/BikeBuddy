import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { apiErrorParams } from '../src/lib/apiErrors.js';
import { translate } from '../src/lib/i18n.js';

const en = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));

const inEnglish = (key) =>
  translate({ messages: en, fallbackMessages: en, key, params: apiErrorParams(key), locale: 'en' });

describe('apiErrorParams', () => {
  it('fills the limits the API error keys name', () => {
    expect(inEnglish('errors.fileSize')).toBe('File exceeds the 10 MB limit.');
    expect(inEnglish('errors.tourImageLimit')).toBe(
      'This tour already has the maximum of 20 photos.',
    );
  });

  it('has nothing to fill for a key without placeholders', () => {
    expect(apiErrorParams('errors.tourNotFound')).toEqual({});
  });
});

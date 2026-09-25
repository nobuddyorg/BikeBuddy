import { describe, it, expect } from 'vitest';
import { buildUploadQuery, parseErrorMessage, readUploadResponse } from '../src/lib/upload.js';

describe('parseErrorMessage', () => {
  it('reads the error field from a JSON body', () => {
    expect(parseErrorMessage('{"error":"Tour not found"}', 'fallback')).toBe('Tour not found');
  });

  it('falls back when the body is not JSON', () => {
    expect(parseErrorMessage('<html>502</html>', 'fallback')).toBe('fallback');
  });

  it('falls back when the JSON has no error field', () => {
    expect(parseErrorMessage('{"ok":true}', 'fallback')).toBe('fallback');
  });
});

describe('readUploadResponse', () => {
  it('returns the parsed body of a 201', () => {
    expect(readUploadResponse({ status: 201, responseText: '{"id":"img-1"}' })).toEqual({
      ok: true,
      body: { id: 'img-1' },
    });
  });

  it('reports the server message of any other status', () => {
    expect(readUploadResponse({ status: 400, responseText: '{"error":"Too big"}' })).toEqual({
      ok: false,
      message: 'Too big',
    });
  });

  it('falls back to a generic message when a failure body has no reason', () => {
    expect(readUploadResponse({ status: 500, responseText: '' })).toEqual({
      ok: false,
      message: 'errors.uploadFailed',
    });
  });

  // The upload itself succeeded: a retry would duplicate it.
  it('reports an unreadable 201 body as its own failure', () => {
    expect(readUploadResponse({ status: 201, responseText: '<html>proxy</html>' })).toEqual({
      ok: false,
      message: 'errors.uploadUnreadable',
    });
  });
});

describe('buildUploadQuery', () => {
  it('sends the trimmed name and description', () => {
    expect(buildUploadQuery({ name: ' Alps ', description: ' a & b ' })).toBe(
      'name=Alps&description=a+%26+b',
    );
  });

  it('leaves blank fields out so the backend applies its defaults', () => {
    expect(buildUploadQuery({ name: '   ', description: '' })).toBe('');
    expect(buildUploadQuery({ name: '', description: 'Coast' })).toBe('description=Coast');
  });
});

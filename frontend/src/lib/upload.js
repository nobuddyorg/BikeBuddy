// @ts-check

// Falls back when the body isn't JSON.
export function parseErrorMessage(text, fallback) {
  try {
    return JSON.parse(text).error || fallback;
  } catch {
    return fallback;
  }
}

// The upload endpoints answer 201 with the created resource; anything else is
// a failure whose body may carry the reason.
export function readUploadResponse({ status, responseText }) {
  if (status !== 201) {
    return { ok: false, message: parseErrorMessage(responseText, 'Upload failed.') };
  }
  try {
    return { ok: true, body: JSON.parse(responseText) };
  } catch {
    // The upload itself succeeded — retrying would create a duplicate.
    return { ok: false, message: 'Upload finished but the response could not be read.' };
  }
}

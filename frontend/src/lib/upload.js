// @ts-check

export function parseErrorMessage(text, fallback) {
  try {
    return JSON.parse(text).error || fallback;
  } catch {
    return fallback;
  }
}

// The upload endpoints answer 201 with the created resource.
export function readUploadResponse({ status, responseText }) {
  if (status !== 201) {
    return { ok: false, message: parseErrorMessage(responseText, 'errors.uploadFailed') };
  }
  try {
    return { ok: true, body: JSON.parse(responseText) };
  } catch {
    // The upload itself succeeded — retrying would create a duplicate.
    return { ok: false, message: 'errors.uploadUnreadable' };
  }
}

// Blank fields are left out, so the backend applies its own defaults.
export function buildUploadQuery({ name, description }) {
  const params = new URLSearchParams();
  if (name.trim()) params.set('name', name.trim());
  if (description.trim()) params.set('description', description.trim());
  return params.toString();
}

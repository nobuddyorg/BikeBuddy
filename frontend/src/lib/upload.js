'use strict';

// Multipart upload with progress reporting, and the error-body helper it shares
// with the other API callers in app.js.

// Extract a friendly message from a JSON `{ error }` body, falling back if not JSON.
export function parseErrorMessage(text, fallback) {
  try {
    return JSON.parse(text).error || fallback;
  } catch {
    return fallback;
  }
}

// POST a single file as multipart with progress reporting. Resolves with the
// parsed JSON body on 201, rejects with an Error carrying a friendly message.
//
// XhrCtor is injectable so the settle-on-every-outcome contract below can be
// unit-tested without a browser.
export function xhrUpload(url, file, token, onProgress, XhrCtor = globalThis.XMLHttpRequest) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    const xhr = new XhrCtor();
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
    };

    // Every terminal outcome must settle the promise. A throw inside an XHR
    // handler escapes to the global error handler instead of rejecting — the
    // executor has already returned — so the promise would never settle: the
    // tile spins forever with no retry, and the slot it holds in
    // runWithConcurrency's pool stays consumed for the rest of the session.
    // That is why JSON.parse is guarded and why abort/timeout are wired (#356).
    xhr.onload = () => {
      if (xhr.status !== 201) {
        return reject(new Error(parseErrorMessage(xhr.responseText, 'Upload failed.')));
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        // The upload itself succeeded, so this is deliberately not phrased as a
        // failure — retrying would create a duplicate.
        reject(new Error('Upload finished but the response could not be read.'));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.onabort = () => reject(new Error('Upload was cancelled.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out.'));
    xhr.send(fd);
  });
}

'use strict';

// Falls back when the body isn't JSON.
export function parseErrorMessage(text, fallback) {
  try {
    return JSON.parse(text).error || fallback;
  } catch {
    return fallback;
  }
}

// XhrCtor is injectable so the settle-on-every-outcome contract below can be
// tested without a browser.
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

    // Every terminal outcome must settle this promise. A throw inside an XHR
    // handler escapes to the global error handler rather than rejecting — the
    // executor has already returned — leaving the tile spinning with no retry
    // and its slot in runWithConcurrency's pool consumed for good (#356).
    xhr.onload = () => {
      if (xhr.status !== 201) {
        return reject(new Error(parseErrorMessage(xhr.responseText, 'Upload failed.')));
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        // The upload itself succeeded — retrying would create a duplicate.
        reject(new Error('Upload finished but the response could not be read.'));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.onabort = () => reject(new Error('Upload was cancelled.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out.'));
    xhr.send(fd);
  });
}

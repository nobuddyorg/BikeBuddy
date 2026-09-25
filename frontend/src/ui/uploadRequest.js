import { readUploadResponse } from '../lib/upload.js';

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
    // and its slot in runWithConcurrency's pool consumed for good.
    xhr.onload = () => {
      const result = readUploadResponse(xhr);
      if (result.ok) resolve(result.body);
      else reject(new Error(result.message));
    };
    xhr.onerror = () => reject(new Error('errors.uploadNetwork'));
    xhr.onabort = () => reject(new Error('errors.uploadCancelled'));
    xhr.ontimeout = () => reject(new Error('errors.uploadTimeout'));
    xhr.send(fd);
  });
}

import { readUploadResponse } from '../lib/upload.js';

// RequestConstructor is injectable so the settle-on-every-outcome contract
// below can be tested without a browser.
export function xhrUpload({
  url,
  file,
  token,
  onProgress,
  RequestConstructor = globalThis.XMLHttpRequest,
}) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    const request = new RequestConstructor();
    request.open('POST', url);
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };

    // Every terminal outcome must settle this promise. A throw inside an XHR
    // handler escapes to the global error handler rather than rejecting — the
    // executor has already returned — leaving the tile spinning with no retry
    // and its slot in runWithConcurrency's pool consumed for good.
    request.onload = () => {
      const result = readUploadResponse(request);
      if (result.ok) resolve(result.body);
      else reject(new Error(result.message));
    };
    request.onerror = () => reject(new Error('errors.uploadNetwork'));
    request.onabort = () => reject(new Error('errors.uploadCancelled'));
    request.ontimeout = () => reject(new Error('errors.uploadTimeout'));
    request.send(formData);
  });
}

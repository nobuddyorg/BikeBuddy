import { readUploadResponse } from '../lib/upload.js';

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

    // A throw in an XHR handler escapes the promise, so every outcome must settle it here.
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

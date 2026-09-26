// Lets a module request a re-render without importing the renderer, which imports it.
const bus = new EventTarget();

export const TOURS_CHANGED = 'tours-changed';
export const PHOTO_LOCATIONS_CHANGED = 'photo-locations-changed';
export const GALLERY_CHANGED = 'gallery-changed';
// The API refused the token and no silent renewal helps: the user has to sign in again.
export const SESSION_EXPIRED = 'session-expired';

export function announce(eventName) {
  bus.dispatchEvent(new Event(eventName));
}

export function whenAnnounced(eventName, listener) {
  bus.addEventListener(eventName, () => listener());
}

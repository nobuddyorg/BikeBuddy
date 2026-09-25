// @ts-check
'use strict';

/**
 * Every error body the API sends: an i18n key the frontend translates (frontend/src/locales/),
 * never prose. A parity test holds each key to all seven locales.
 */
const ERROR_KEYS = Object.freeze({
  unauthorized: 'errors.unauthorized',
  invalidId: 'errors.invalidId',
  tourNotFound: 'errors.tourNotFound',
  imageNotFound: 'errors.imageNotFound',
  invalidUpload: 'errors.invalidUpload',
  noFile: 'errors.noFile',
  fileSize: 'errors.fileSize',
  imageType: 'errors.imageType',
  tourImageLimit: 'errors.tourImageLimit',
  gpxInvalid: 'errors.gpxInvalid',
  gpxNoTrack: 'errors.gpxNoTrack',
  tourName: 'errors.tourName',
  tourDescription: 'errors.tourDescription',
  tourDate: 'errors.tourDate',
  tourInvalid: 'errors.tourInvalid',
  profileInvalid: 'errors.profileInvalid',
  busy: 'errors.busy',
  accountDeleted: 'errors.accountDeleted',
  unexpected: 'errors.unexpected',
});

const error = (status, message) => ({ status, jsonBody: { error: message } });
const unauthorized = () => error(401, ERROR_KEYS.unauthorized);

module.exports = { ERROR_KEYS, error, unauthorized };

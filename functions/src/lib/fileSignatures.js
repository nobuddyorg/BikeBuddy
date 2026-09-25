// @ts-check
'use strict';

const UTF8_BYTE_ORDER_MARK = Buffer.from([0xef, 0xbb, 0xbf]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const XML_DECLARATION = Buffer.from('<?xml');
const GPX_ROOT = Buffer.from('<gpx');
const MINIMUM_IMAGE_BYTES = 4;

/** @param {Buffer} buffer @param {Buffer} signature */
const startsWith = (buffer, signature) => buffer.subarray(0, signature.length).equals(signature);

/** @param {Buffer} buffer */
function isJpegOrPng(buffer) {
  if (buffer.length < MINIMUM_IMAGE_BYTES) return false;
  return startsWith(buffer, JPEG_SIGNATURE) || startsWith(buffer, PNG_SIGNATURE);
}

/** "<?xml" or "<gpx", optionally behind a UTF-8 byte order mark. @param {Buffer} buffer */
function looksLikeXml(buffer) {
  const text = startsWith(buffer, UTF8_BYTE_ORDER_MARK)
    ? buffer.subarray(UTF8_BYTE_ORDER_MARK.length)
    : buffer;
  return startsWith(text, XML_DECLARATION) || startsWith(text, GPX_ROOT);
}

module.exports = { isJpegOrPng, looksLikeXml };

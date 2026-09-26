'use strict';

// JPEGs built in memory; the geotagged one sits at 48°8'N 11°34'E.

const sharp = require('sharp');

function uint16LittleEndian(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}
function uint32LittleEndian(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}
function uint16BigEndian(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes;
}
const rational = (whole) => Buffer.concat([uint32LittleEndian(whole), uint32LittleEndian(1)]);

// Raw TIFF bytes with a GPS IFD: sharp's withExif() only writes flat IFD0 string tags.
function gpsExif() {
  const header = Buffer.concat([Buffer.from('II'), uint16LittleEndian(42), uint32LittleEndian(8)]);
  const gpsIfdOffset = 8 + 2 + 12 + 4;
  const ifd0 = Buffer.concat([
    uint16LittleEndian(1),
    uint16LittleEndian(0x8825),
    uint16LittleEndian(4),
    uint32LittleEndian(1),
    uint32LittleEndian(gpsIfdOffset),
    uint32LittleEndian(0),
  ]);

  const latitudeDataOffset = gpsIfdOffset + 2 + 4 * 12 + 4;
  const longitudeDataOffset = latitudeDataOffset + 24;
  const asciiEntry = (tag, letter) =>
    Buffer.concat([
      uint16LittleEndian(tag),
      uint16LittleEndian(2),
      uint32LittleEndian(2),
      Buffer.from([letter.charCodeAt(0), 0x00, 0x00, 0x00]),
    ]);
  const rationalEntry = (tag, offset) =>
    Buffer.concat([
      uint16LittleEndian(tag),
      uint16LittleEndian(5),
      uint32LittleEndian(3),
      uint32LittleEndian(offset),
    ]);
  const gpsIfd = Buffer.concat([
    uint16LittleEndian(4),
    asciiEntry(0x0001, 'N'),
    rationalEntry(0x0002, latitudeDataOffset),
    asciiEntry(0x0003, 'E'),
    rationalEntry(0x0004, longitudeDataOffset),
    uint32LittleEndian(0),
  ]);

  const latitudeData = Buffer.concat([48, 8, 0].map(rational));
  const longitudeData = Buffer.concat([11, 34, 0].map(rational));
  return Buffer.concat([header, ifd0, gpsIfd, latitudeData, longitudeData]);
}

const plainJpeg = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .jpeg()
    .toBuffer();

async function jpegWithExifPayload(exif) {
  const jpeg = await plainJpeg();
  const app1Payload = Buffer.concat([Buffer.from('Exif\0\0'), exif]);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    uint16BigEndian(app1Payload.length + 2),
    app1Payload,
  ]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

const geotaggedJpeg = () => jpegWithExifPayload(gpsExif());

module.exports = { gpsExif, plainJpeg, jpegWithExifPayload, geotaggedJpeg };

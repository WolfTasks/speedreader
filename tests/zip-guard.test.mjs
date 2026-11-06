// tests/zip-guard.test.mjs — popup/zip-guard.js (zip-bomb pre-check for .docx uploads)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from './helpers/load-script.mjs';
import { buildZip, toArrayBuffer } from './helpers/zip-builder.mjs';

const { getZipUncompressedSize } = loadScript('popup/zip-guard.js', {});
const size = (u8) => getZipUncompressedSize(toArrayBuffer(u8));

test('sums declared uncompressed sizes of all entries', () => {
  const zip = buildZip([
    { name: '[Content_Types].xml', data: 'a'.repeat(1000) },
    { name: 'word/document.xml', data: 'b'.repeat(5000) },
  ]);
  assert.equal(size(zip), 6000);
});

test('detects a highly compressible bomb by its declared size', () => {
  const zip = buildZip([{ name: 'word/document.xml', data: new Uint8Array(60 * 1024 * 1024) }]);
  assert.ok(zip.length < 200 * 1024, `bomb should be tiny on disk (${zip.length})`);
  assert.equal(size(zip), 60 * 1024 * 1024);
});

test('handles an archive comment after the EOCD record', () => {
  const zip = buildZip([{ name: 'a.xml', data: 'hello' }], { comment: 'x'.repeat(300) });
  assert.equal(size(zip), 5);
});

test('empty archive → 0', () => {
  assert.equal(size(buildZip([])), 0);
});

test('non-ZIP data is rejected', () => {
  assert.throws(() => size(new TextEncoder().encode('PK... not really a zip file at all')), /Ungültige \.docx-Datei/);
  assert.throws(() => size(new Uint8Array(5)), /Ungültige \.docx-Datei/);
});

test('truncated central directory is rejected', () => {
  const zip = buildZip([{ name: 'a.xml', data: 'hello' }, { name: 'b.xml', data: 'world' }]);
  const view = new DataView(zip.buffer, zip.byteOffset);
  const eocd = zip.length - 22;
  view.setUint16(eocd + 10, 50, true); // claim 50 entries
  assert.throws(() => size(zip), /Ungültige \.docx-Datei/);
});

test('central directory offset beyond EOCD is rejected', () => {
  const zip = buildZip([{ name: 'a.xml', data: 'hello' }]);
  new DataView(zip.buffer, zip.byteOffset).setUint32(zip.length - 22 + 16, zip.length, true);
  assert.throws(() => size(zip), /Ungültige \.docx-Datei/);
});

test('ZIP64 archives are rejected (locator record)', () => {
  const zip = buildZip([{ name: 'a.xml', data: 'hello' }], { zip64Locator: true });
  assert.throws(() => size(zip), /ZIP64/);
});

test('ZIP64 archives are rejected (0xFFFFFFFF size marker)', () => {
  const zip = buildZip([{ name: 'a.xml', data: 'hello', declaredSize: 0xffffffff }]);
  assert.throws(() => size(zip), /ZIP64/);
});

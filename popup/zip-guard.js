// popup/zip-guard.js — classic script, loaded before popup.js
// Pure helper: reads the declared uncompressed size of a ZIP archive (.docx) from its
// central directory, without decompressing anything. Used to reject zip bombs before
// handing the buffer to mammoth/JSZip, which inflate everything into memory.
//
// Limitation: sizes are what the archive *declares*. A crafted archive can under-declare;
// this guard stops honest-but-huge files and naive bombs, not every malicious archive.

const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CD_SIG = 0x02014b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP_EOCD_MIN = 22;
const ZIP_CD_HEADER = 46;
const ZIP_MAX_COMMENT = 0xffff;

/**
 * Return the summed uncompressed size (bytes) of all entries in a ZIP archive.
 * Throws Error with a user-facing German message for invalid or ZIP64 archives.
 */
function getZipUncompressedSize(arrayBuffer) {
  const invalid = () => new Error('Ungültige .docx-Datei (kein gültiges ZIP-Archiv)');
  const zip64 = () => new Error('ZIP64-Archive werden nicht unterstützt');

  const len = arrayBuffer.byteLength;
  if (len < ZIP_EOCD_MIN) throw invalid();
  const view = new DataView(arrayBuffer);

  // End of central directory record: scan backwards (it may be followed by a comment).
  let eocd = -1;
  const stop = Math.max(0, len - ZIP_EOCD_MIN - ZIP_MAX_COMMENT);
  for (let p = len - ZIP_EOCD_MIN; p >= stop; p--) {
    if (view.getUint32(p, true) === ZIP_EOCD_SIG) { eocd = p; break; }
  }
  if (eocd < 0) throw invalid();

  if (eocd >= 20 && view.getUint32(eocd - 20, true) === ZIP64_LOCATOR_SIG) throw zip64();

  const entries = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw zip64();
  if (cdOffset + cdSize > eocd) throw invalid();

  let total = 0;
  let p = cdOffset;
  for (let i = 0; i < entries; i++) {
    if (p + ZIP_CD_HEADER > eocd || view.getUint32(p, true) !== ZIP_CD_SIG) throw invalid();
    const compressed = view.getUint32(p + 20, true);
    const uncompressed = view.getUint32(p + 24, true);
    if (compressed === 0xffffffff || uncompressed === 0xffffffff) throw zip64();
    total += uncompressed;
    p += ZIP_CD_HEADER
      + view.getUint16(p + 28, true)   // file name length
      + view.getUint16(p + 30, true)   // extra field length
      + view.getUint16(p + 32, true);  // file comment length
  }
  return total;
}

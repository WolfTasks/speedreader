// reader/reader-core.js
// Pure logic: no DOM, no chrome.* calls.

/**
 * Tokenize plain text into an array of { word, pauseMultiplier } objects.
 * pauseMultiplier is multiplied against the base WPM interval for this token.
 */
export function tokenize(text) {
  const raw = text.trim().split(/\s+/);
  const tokens = [];
  for (const rawWord of raw) {
    if (!rawWord) continue;
    // Strip leading/trailing non-word characters for display
    const word = rawWord.replace(/^[^\w\u00C0-\u024F]+|[^\w\u00C0-\u024F]+$/g, '') || rawWord;
    // Sentence endings take priority over long-word multiplier
    if (/[.!?]['"]?$/.test(rawWord)) {
      tokens.push({ word, pauseMultiplier: 2 });
    } else if (word.length > 10) {
      tokens.push({ word, pauseMultiplier: 1.4 });
    } else {
      tokens.push({ word, pauseMultiplier: 1 });
    }
  }
  return tokens;
}

/**
 * Return the 0-based index of the ORP (Optimal Recognition Point) letter.
 * Formula: floor(length * 0.3) - 1, minimum 0.
 */
export function getOrpIndex(word) {
  return Math.max(0, Math.floor(word.length * 0.3) - 1);
}

/**
 * Split a word into { before, orp, after } parts for rendering.
 * before = text left of ORP, orp = the highlighted letter, after = rest.
 */
export function splitAtOrp(word) {
  const idx = getOrpIndex(word);
  return {
    before: word.slice(0, idx),
    orp:    word[idx] ?? '',
    after:  word.slice(idx + 1),
  };
}

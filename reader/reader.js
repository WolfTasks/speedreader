// reader/reader.js — RSVP entry point
import { tokenize, splitAtOrp } from './reader-core.js';

// DOM refs
const elBefore    = document.getElementById('word-before');
const elOrp       = document.getElementById('word-orp');
const elAfter     = document.getElementById('word-after');
const elIndex     = document.getElementById('word-index');
const elTotal     = document.getElementById('word-total');
const elPlayPause = document.getElementById('btn-playpause');
const elRestart   = document.getElementById('btn-restart');
const elWpmSlider = document.getElementById('wpm-slider');
const elWpmDisplay= document.getElementById('wpm-display');
const elDone      = document.getElementById('done-banner');
const elError     = document.getElementById('error-banner');
const elControls  = document.getElementById('controls');
const elDoneRestart = document.getElementById('btn-done-restart');

// State
let tokens = [];
let currentIndex = 0;
let wpm = 250;
let playing = false;
let timeoutId = null;

function renderWord(index) {
  const { word } = tokens[index];
  const { before, orp, after } = splitAtOrp(word);
  elBefore.textContent = before;
  elOrp.textContent    = orp;
  elAfter.textContent  = after;
  elIndex.textContent  = index + 1;
}

function scheduleNext() {
  if (!playing) return;
  const { pauseMultiplier } = tokens[currentIndex];
  const delay = (60000 / wpm) * pauseMultiplier;
  timeoutId = setTimeout(() => {
    currentIndex++;
    if (currentIndex >= tokens.length) {
      playing = false;
      elPlayPause.textContent = '▶';
      elDone.hidden = false;
      return;
    }
    renderWord(currentIndex);
    scheduleNext();
  }, delay);
}

function play() {
  if (currentIndex >= tokens.length) return;
  playing = true;
  elPlayPause.textContent = '⏸';
  elDone.hidden = true;
  renderWord(currentIndex);
  scheduleNext();
}

function pause() {
  playing = false;
  elPlayPause.textContent = '▶';
  clearTimeout(timeoutId);
}

function restart() {
  pause();
  currentIndex = 0;
  elDone.hidden = true;
  if (tokens.length > 0) renderWord(0);
}

function initReader(text) {
  tokens = tokenize(text);

  if (tokens.length === 0) {
    elError.hidden = false;
    elControls.style.visibility = 'hidden';
    return;
  }

  elTotal.textContent = tokens.length;

  // Short texts: show all words joined, no loop, disable keyboard shortcut
  if (tokens.length < 5) {
    elBefore.textContent = '';
    elOrp.textContent    = tokens.map(t => t.word).join(' ');
    elAfter.textContent  = '';
    elIndex.textContent  = tokens.length;
    elControls.style.visibility = 'hidden';
    document.removeEventListener('keydown', onKeydown);
    return;
  }

  renderWord(0);
}

// Controls
elPlayPause.addEventListener('click', () => playing ? pause() : play());
elRestart.addEventListener('click', restart);
elDoneRestart.addEventListener('click', () => { restart(); play(); });

function onKeydown(e) {
  if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
    e.preventDefault();
    playing ? pause() : play();
  }
}
document.addEventListener('keydown', onKeydown);

elWpmSlider.addEventListener('input', () => {
  wpm = parseInt(elWpmSlider.value, 10);
  elWpmDisplay.textContent = wpm;
  // Change takes effect on next word (current setTimeout fires at old interval)
});

// Bootstrap: request text from background service worker
chrome.runtime.sendMessage({ type: 'READER_READY' }, (response) => {
  if (chrome.runtime.lastError || !response?.text) {
    elError.hidden = false;
    elControls.style.visibility = 'hidden';
    return;
  }
  initReader(response.text);
});

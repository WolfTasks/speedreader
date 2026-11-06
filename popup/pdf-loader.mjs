// popup/pdf-loader.mjs
// pdf.js ≥ 4 ships only as an ES module and no longer defines a global `pdfjsLib`.
// This shim (loaded via <script type="module">; MV3 forbids inline scripts) imports it,
// points the worker at the extension-internal module worker and exposes the API
// to the classic popup.js as `globalThis.pdfjsLib`.
import * as pdfjsLib from '../vendor/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.mjs');
globalThis.pdfjsLib = pdfjsLib;

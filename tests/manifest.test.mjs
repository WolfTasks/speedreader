// tests/manifest.test.mjs — sanity checks that the packaged extension is loadable
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(ROOT + 'manifest.json', 'utf8'));

test('manifest is MV3 with a dotted numeric version', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+(\.\d+){0,3}$/);
});

test('every file referenced by the manifest exists', () => {
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    'content.js', // injected on demand by popup.js (no manifest content_scripts)
  ];
  for (const file of files) {
    assert.ok(existsSync(ROOT + file), `missing: ${file}`);
  }
});

test('extension pages reference only existing local scripts and styles', () => {
  for (const page of ['popup/popup.html', 'reader/reader.html']) {
    const html = readFileSync(ROOT + page, 'utf8');
    const dir = page.slice(0, page.lastIndexOf('/') + 1);
    const refs = [...html.matchAll(/(?:src|href)="([^"#:]+\.(?:m?js|css))"/g)].map((m) => m[1]);
    assert.ok(refs.length > 0, `${page} references no scripts`);
    for (const ref of refs) {
      const target = new URL(ref, 'file:///' + dir).pathname.slice(1);
      assert.ok(existsSync(ROOT + target), `${page} → missing ${ref}`);
    }
  }
});

test('popup loads pdf.js via module shim whose import and worker exist', () => {
  const html = readFileSync(ROOT + 'popup/popup.html', 'utf8');
  assert.match(html, /<script type="module" src="pdf-loader\.mjs"><\/script>/);
  const shim = readFileSync(ROOT + 'popup/pdf-loader.mjs', 'utf8');
  const imports = [...shim.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  const workers = [...shim.matchAll(/getURL\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(imports.length > 0 && workers.length > 0, 'shim must import pdf.js and set workerSrc');
  for (const ref of imports) {
    assert.ok(existsSync(ROOT + new URL(ref, 'file:///popup/').pathname.slice(1)), `missing import ${ref}`);
  }
  for (const ref of workers) assert.ok(existsSync(ROOT + ref), `missing worker ${ref}`);
});

test('popup calls pdf.js with eval disabled', () => {
  const popup = readFileSync(ROOT + 'popup/popup.js', 'utf8');
  assert.match(popup, /getDocument\(\{[^}]*isEvalSupported:\s*false/);
});

test('permissions stay minimal: activeTab + on-demand scripting, no host access', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'contextMenus', 'scripting', 'storage']);
  assert.equal(manifest.host_permissions, undefined, 'no host permissions (security audit M2)');
  assert.equal(manifest.optional_host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined, 'content.js must be injected on demand, not on every page');
});

test('popup injects exactly the content script file that exists', () => {
  const popup = readFileSync(ROOT + 'popup/popup.js', 'utf8');
  const m = popup.match(/const CONTENT_SCRIPT = '([^']+)'/);
  assert.ok(m, 'popup.js declares CONTENT_SCRIPT');
  assert.ok(existsSync(ROOT + m[1]), `missing: ${m[1]}`);
});

test('keyboard command for reading the selection is declared', () => {
  const cmd = manifest.commands?.['read-selection'];
  assert.ok(cmd?.description, 'command needs a description (shown in browser shortcut settings)');
  assert.match(cmd.suggested_key?.default ?? '', /^(Alt|Ctrl)\+Shift\+[A-Z]$/);
});

test('declares minimum browser versions that guarantee storage.session and dual background keys', () => {
  assert.ok(Number(manifest.minimum_chrome_version) >= 121, 'Chrome < 121 rejects background.scripts in MV3');
  const gecko = manifest.browser_specific_settings?.gecko;
  assert.ok(gecko?.id, 'Firefox needs an explicit add-on id for MV3');
  assert.ok(parseFloat(gecko.strict_min_version) >= 121, 'Firefox < 121 cannot handle service_worker next to scripts');
});

test('background runs as service worker (Chrome) and event page (Firefox) from the same file', () => {
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.deepEqual([...manifest.background.scripts], ['background.js']);
});

test('declares Firefox built-in data consent: collects no data (AMO requirement for new add-ons)', () => {
  // Firefox 140+ / Android 142+ show this in the install prompt; older versions ignore the key
  // (addons-linter: warning only, because strict_min_version is 121).
  const dcp = manifest.browser_specific_settings?.gecko?.data_collection_permissions;
  assert.deepEqual(dcp, { required: ['none'] }, 'SpeedReader transmits nothing — keep required: ["none"] and no optional');
});

test('ships a LICENSE file in the repo root (packaged into the release ZIP)', () => {
  assert.ok(existsSync(ROOT + 'LICENSE'), 'missing: LICENSE');
  assert.match(readFileSync(ROOT + 'LICENSE', 'utf8'), /^MIT License/);
});

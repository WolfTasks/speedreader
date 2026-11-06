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
    ...manifest.content_scripts.flatMap((cs) => cs.js ?? []),
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

test('permissions stay minimal', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['contextMenus', 'storage']);
});

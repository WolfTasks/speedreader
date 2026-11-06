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
    const refs = [...html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css))"/g)].map((m) => m[1]);
    assert.ok(refs.length > 0, `${page} references no scripts`);
    for (const ref of refs) {
      const target = new URL(ref, 'file:///' + dir).pathname.slice(1);
      assert.ok(existsSync(ROOT + target), `${page} → missing ${ref}`);
    }
  }
});

test('permissions stay minimal', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['contextMenus', 'storage']);
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

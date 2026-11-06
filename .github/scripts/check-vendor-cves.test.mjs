// .github/scripts/check-vendor-cves.test.mjs — run with: node --test ".github/scripts/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildSarif,
  classifySeverity,
  fixedVersions,
  groupPackages,
  main,
  normalizedSha256,
  renderMarkdown,
  verifyInventory,
} from './check-vendor-cves.mjs';

const LIB = 'console.log("lib v1.2.3");\n';

function makeRepo({ content = LIB, sha256, versionMarker = 'v1.2.3' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vendor-cve-'));
  mkdirSync(join(root, 'vendor'));
  writeFileSync(join(root, 'vendor/lib.min.js'), content);
  const entry = {
    file: 'vendor/lib.min.js',
    ecosystem: 'npm',
    package: 'lib',
    version: '1.2.3',
    sha256: sha256 ?? normalizedSha256(Buffer.from(LIB)),
    versionMarker,
  };
  writeFileSync(join(root, 'vendor/VENDOR.json'), JSON.stringify({ files: [entry] }));
  return { root, entry, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function fakeOsv(vulnsById = {}, idsPerQuery = [Object.keys(vulnsById)]) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    const json = url.endsWith('/querybatch')
      ? { results: idsPerQuery.map((ids) => (ids.length ? { vulns: ids.map((id) => ({ id })) } : {})) }
      : vulnsById[decodeURIComponent(url.split('/').pop())];
    return { ok: Boolean(json), status: json ? 200 : 404, json: async () => json };
  };
  return { fetchImpl, calls };
}

const advisory = (id, severity, fixed = '2.0.0') => ({
  id,
  aliases: [`CVE-2099-${id.length}`],
  summary: `${id} summary | with pipe`,
  database_specific: severity ? { severity } : {},
  affected: [{ package: { name: 'lib' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed }] }] }],
});

const quiet = { log: () => {} };

test('normalizedSha256 ignores CRLF vs LF', () => {
  assert.equal(normalizedSha256(Buffer.from('a\r\nb\r\n')), normalizedSha256(Buffer.from('a\nb\n')));
});

test('classifySeverity maps GitHub severities and flags missing ones as UNKNOWN', () => {
  assert.equal(classifySeverity({ database_specific: { severity: 'HIGH' } }), 'HIGH');
  assert.equal(classifySeverity({ database_specific: { severity: 'MODERATE' } }), 'MEDIUM');
  assert.equal(classifySeverity({ database_specific: { severity: 'critical' } }), 'CRITICAL');
  assert.equal(classifySeverity({ severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/...' }] }), 'UNKNOWN');
  assert.equal(classifySeverity({}), 'UNKNOWN');
});

test('fixedVersions collects fixed events for the package only', () => {
  const v = {
    affected: [
      { package: { name: 'lib' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '1.5.0' }] }] },
      { package: { name: 'other' }, ranges: [{ events: [{ fixed: '9.9.9' }] }] },
    ],
  };
  assert.deepEqual(fixedVersions(v, 'lib'), ['1.5.0']);
});

test('groupPackages merges files that share a package version', () => {
  const groups = groupPackages([
    { ecosystem: 'npm', package: 'pdfjs-dist', version: '3', file: 'a.js' },
    { ecosystem: 'npm', package: 'pdfjs-dist', version: '3', file: 'b.js' },
    { ecosystem: 'npm', package: 'mammoth', version: '1', file: 'c.js' },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].files, ['a.js', 'b.js']);
});

test('verifyInventory accepts matching file and flags changed hash or missing marker', () => {
  const ok = makeRepo();
  try {
    assert.deepEqual(verifyInventory(ok.root, [ok.entry]), []);
    assert.match(verifyInventory(ok.root, [{ ...ok.entry, sha256: 'deadbeef' }])[0], /Inventar veraltet/);
    assert.match(verifyInventory(ok.root, [{ ...ok.entry, versionMarker: 'v9.9.9' }])[0], /Versionsmarker/);
    assert.match(verifyInventory(ok.root, [{ ...ok.entry, file: 'vendor/nope.js' }])[0], /existiert nicht/);
  } finally {
    ok.cleanup();
  }
});

test('main: no advisories → exit 0, one batch query with npm ecosystem', async () => {
  const repo = makeRepo();
  try {
    const { fetchImpl, calls } = fakeOsv({}, [[]]);
    assert.equal(await main(['--root', repo.root], { fetchImpl, ...quiet }), 0);
    assert.deepEqual(calls[0].body.queries, [{ package: { ecosystem: 'npm', name: 'lib' }, version: '1.2.3' }]);
  } finally {
    repo.cleanup();
  }
});

test('main: HIGH advisory → exit 1 and SARIF with error result on the vendor file', async () => {
  const repo = makeRepo();
  const sarifPath = join(repo.root, 'out.sarif');
  try {
    const { fetchImpl } = fakeOsv({ 'GHSA-high': advisory('GHSA-high', 'HIGH') });
    assert.equal(await main(['--root', repo.root, '--sarif', sarifPath], { fetchImpl, ...quiet }), 1);
    const sarif = JSON.parse(readFileSync(sarifPath, 'utf8'));
    const [result] = sarif.runs[0].results;
    assert.equal(result.ruleId, 'GHSA-high');
    assert.equal(result.level, 'error');
    assert.equal(result.locations[0].physicalLocation.artifactLocation.uri, 'vendor/lib.min.js');
    assert.equal(sarif.runs[0].tool.driver.rules[0].properties['security-severity'], '8.0');
  } finally {
    repo.cleanup();
  }
});

test('main: only MEDIUM/LOW advisories → exit 0 (reported, not gating)', async () => {
  const repo = makeRepo();
  try {
    const { fetchImpl } = fakeOsv({ 'GHSA-mod': advisory('GHSA-mod', 'MODERATE'), 'GHSA-low': advisory('GHSA-low', 'LOW') });
    assert.equal(await main(['--root', repo.root], { fetchImpl, ...quiet }), 0);
  } finally {
    repo.cleanup();
  }
});

test('main: advisory without severity is gated as HIGH', async () => {
  const repo = makeRepo();
  try {
    const { fetchImpl } = fakeOsv({ 'GHSA-x': advisory('GHSA-x', undefined) });
    assert.equal(await main(['--root', repo.root], { fetchImpl, ...quiet }), 1);
  } finally {
    repo.cleanup();
  }
});

test('main: stale inventory → exit 2 even without advisories', async () => {
  const repo = makeRepo({ content: 'console.log("lib v1.2.4");\n' });
  try {
    const out = [];
    const { fetchImpl } = fakeOsv({}, [[]]);
    assert.equal(await main(['--root', repo.root], { fetchImpl, log: (m) => out.push(m) }), 2);
    assert.match(out.join('\n'), /Inventar veraltet/);
  } finally {
    repo.cleanup();
  }
});

test('main: OSV failure → exit 2', async () => {
  const repo = makeRepo();
  try {
    const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
    assert.equal(await main(['--root', repo.root], { fetchImpl, ...quiet }), 2);
  } finally {
    repo.cleanup();
  }
});

test('renderMarkdown escapes pipes and marks UNKNOWN severity', () => {
  const md = renderMarkdown(
    [{ package: 'lib', version: '1.2.3', files: ['vendor/lib.min.js'] }],
    [{ id: 'GHSA-x', aliases: ['CVE-1'], summary: 'a | b', severity: 'UNKNOWN', fixed: [], package: 'lib', version: '1.2.3', files: [], url: 'u' }],
  );
  assert.match(md, /UNKNOWN \(→ HIGH\)/);
  assert.match(md, /a \\\| b/);
});

test('buildSarif emits one rule per advisory even when it hits several files', () => {
  const f = { id: 'GHSA-a', aliases: [], summary: 's', severity: 'CRITICAL', fixed: ['2'], package: 'p', version: '1', files: ['x.js', 'y.js'], url: 'u' };
  const sarif = buildSarif([f]);
  assert.equal(sarif.runs[0].tool.driver.rules.length, 1);
  assert.equal(sarif.runs[0].results.length, 2);
});

test('real vendor/VENDOR.json matches the files in the repo', () => {
  const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const inventory = JSON.parse(readFileSync(join(root, 'vendor/VENDOR.json'), 'utf8'));
  assert.deepEqual(verifyInventory(root, inventory.files), []);
});

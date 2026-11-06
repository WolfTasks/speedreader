#!/usr/bin/env node
// .github/scripts/check-vendor-cves.mjs
//
// Checks the vendored libraries listed in vendor/VENDOR.json against the OSV database.
// Node built-ins only (no npm — see CLAUDE.md).
//
//   node .github/scripts/check-vendor-cves.mjs [--root <dir>] [--sarif <file>]
//
// Exit codes: 0 = no HIGH/CRITICAL findings
//             1 = at least one HIGH/CRITICAL (or unknown-severity) advisory
//             2 = inventory stale/invalid or OSV unreachable

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OSV_API = 'https://api.osv.dev/v1';
const GATING = new Set(['CRITICAL', 'HIGH', 'UNKNOWN']);
const SECURITY_SEVERITY = { CRITICAL: '9.5', HIGH: '8.0', UNKNOWN: '8.0', MEDIUM: '5.5', LOW: '2.0' };
const SARIF_LEVEL = { CRITICAL: 'error', HIGH: 'error', UNKNOWN: 'error', MEDIUM: 'warning', LOW: 'note' };

export class InventoryError extends Error {}

/** sha256 over content with CRLF → LF, so Windows checkouts (autocrlf) hash like the git blob. */
export function normalizedSha256(buffer) {
  const text = buffer.toString('latin1').replace(/\r\n/g, '\n');
  return createHash('sha256').update(Buffer.from(text, 'latin1')).digest('hex');
}

export function loadInventory(root) {
  const path = resolve(root, 'vendor/VENDOR.json');
  if (!existsSync(path)) throw new InventoryError('vendor/VENDOR.json fehlt');
  const inventory = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(inventory.files) || inventory.files.length === 0) {
    throw new InventoryError('vendor/VENDOR.json enthält keine "files"');
  }
  return inventory.files;
}

/** Verifies every inventory entry against the file on disk. Returns a list of problems. */
export function verifyInventory(root, entries) {
  const problems = [];
  for (const e of entries) {
    for (const key of ['file', 'ecosystem', 'package', 'version', 'sha256']) {
      if (!e[key]) problems.push(`${e.file ?? '?'}: Feld "${key}" fehlt`);
    }
    const path = resolve(root, e.file ?? '');
    if (!e.file || !existsSync(path)) {
      problems.push(`${e.file}: Datei existiert nicht`);
      continue;
    }
    const content = readFileSync(path);
    const actual = normalizedSha256(content);
    if (actual !== e.sha256) {
      problems.push(`${e.file}: sha256 ${actual} ≠ Inventar ${e.sha256} — Datei geändert, Inventar veraltet`);
    }
    if (e.versionMarker && !content.toString('latin1').includes(e.versionMarker)) {
      problems.push(`${e.file}: Versionsmarker ${JSON.stringify(e.versionMarker)} nicht gefunden — Inventar veraltet`);
    }
  }
  return problems;
}

/** Severity of an OSV record: GitHub's database_specific.severity, else UNKNOWN (treated as HIGH). */
export function classifySeverity(vuln) {
  const raw = String(vuln?.database_specific?.severity ?? '').toUpperCase();
  if (raw === 'MODERATE') return 'MEDIUM';
  if (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(raw)) return raw;
  return 'UNKNOWN';
}

export function fixedVersions(vuln, pkg) {
  const fixed = new Set();
  for (const a of vuln.affected ?? []) {
    if (a.package?.name && a.package.name !== pkg) continue;
    for (const r of a.ranges ?? []) {
      for (const ev of r.events ?? []) if (ev.fixed) fixed.add(ev.fixed);
    }
  }
  return [...fixed];
}

/** Unique (ecosystem, package, version) triples, each with the vendor files that contain it. */
export function groupPackages(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = `${e.ecosystem}|${e.package}|${e.version}`;
    if (!map.has(key)) map.set(key, { ecosystem: e.ecosystem, package: e.package, version: e.version, files: [] });
    map.get(key).files.push(e.file);
  }
  return [...map.values()];
}

async function osvJson(fetchImpl, url, init) {
  const res = await fetchImpl(url, init);
  if (!res.ok) throw new Error(`OSV ${url} → HTTP ${res.status}`);
  return res.json();
}

export async function queryOsv(packages, fetchImpl = fetch) {
  const batch = await osvJson(fetchImpl, `${OSV_API}/querybatch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      queries: packages.map((p) => ({ package: { ecosystem: p.ecosystem, name: p.package }, version: p.version })),
    }),
  });
  if (!Array.isArray(batch.results) || batch.results.length !== packages.length) {
    throw new Error('OSV querybatch: unerwartete Antwort');
  }
  const findings = [];
  for (const [i, result] of batch.results.entries()) {
    for (const { id } of result.vulns ?? []) {
      const vuln = await osvJson(fetchImpl, `${OSV_API}/vulns/${encodeURIComponent(id)}`);
      const pkg = packages[i];
      findings.push({
        id: vuln.id,
        aliases: vuln.aliases ?? [],
        summary: vuln.summary ?? vuln.details?.split('\n')[0] ?? '',
        severity: classifySeverity(vuln),
        fixed: fixedVersions(vuln, pkg.package),
        package: pkg.package,
        version: pkg.version,
        files: pkg.files,
        url: `https://osv.dev/vulnerability/${vuln.id}`,
      });
    }
  }
  return findings;
}

export function buildSarif(findings) {
  const rules = [];
  const seen = new Set();
  for (const f of findings) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    rules.push({
      id: f.id,
      name: f.id.replace(/[^A-Za-z0-9]/g, ''),
      shortDescription: { text: f.summary || f.id },
      fullDescription: { text: `${f.package}@${f.version}: ${f.summary}${f.aliases.length ? ` (${f.aliases.join(', ')})` : ''}` },
      helpUri: f.url,
      help: { text: `Betroffen: ${f.package}@${f.version}. Behoben in: ${f.fixed.join(', ') || 'unbekannt'}. ${f.url}` },
      properties: { 'security-severity': SECURITY_SEVERITY[f.severity], tags: ['security', 'vendor', f.package] },
    });
  }
  const results = findings.flatMap((f) =>
    f.files.map((file) => ({
      ruleId: f.id,
      level: SARIF_LEVEL[f.severity],
      message: {
        text: `${f.package}@${f.version} (${file}) ist betroffen von ${f.id}${f.aliases.length ? ` / ${f.aliases.join(', ')}` : ''}: ${f.summary}. Behoben in ${f.fixed.join(', ') || 'unbekannt'}.${f.severity === 'UNKNOWN' ? ' Severity unbekannt — als HIGH gewertet.' : ''}`,
      },
      locations: [{ physicalLocation: { artifactLocation: { uri: file }, region: { startLine: 1 } } }],
    })),
  );
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{ tool: { driver: { name: 'check-vendor-cves', informationUri: 'https://osv.dev', rules } }, results }],
  };
}

export function renderMarkdown(packages, findings, problems = []) {
  const lines = ['## Vendor-CVE-Scan (OSV)', ''];
  if (problems.length) {
    lines.push('### ❌ Inventar veraltet / ungültig', '', ...problems.map((p) => `- ${p}`), '');
  }
  lines.push('| Paket | Version | Dateien | Advisories |', '|---|---|---|---|');
  for (const p of packages) {
    const n = findings.filter((f) => f.package === p.package && f.version === p.version).length;
    lines.push(`| ${p.package} | ${p.version} | ${p.files.map((f) => `\`${f}\``).join(', ')} | ${n || '–'} |`);
  }
  lines.push('');
  if (findings.length === 0) {
    lines.push('✅ Keine bekannten Schwachstellen.');
  } else {
    lines.push('| Severity | Advisory | CVE | Paket | Behoben in | Beschreibung |', '|---|---|---|---|---|---|');
    for (const f of findings) {
      const sev = f.severity === 'UNKNOWN' ? 'UNKNOWN (→ HIGH)' : f.severity;
      const cves = f.aliases.filter((a) => a.startsWith('CVE-')).join(', ') || '–';
      lines.push(`| ${sev} | [${f.id}](${f.url}) | ${cves} | ${f.package}@${f.version} | ${f.fixed.join(', ') || '?'} | ${f.summary.replace(/\|/g, '\\|')} |`);
    }
  }
  return lines.join('\n') + '\n';
}

export async function main(argv = process.argv.slice(2), { fetchImpl = fetch, log = console.log } = {}) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const root = resolve(arg('--root') ?? fileURLToPath(new URL('../../', import.meta.url)));
  const sarifPath = arg('--sarif');
  const emit = (md) => {
    log(md);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  };

  let entries;
  try {
    entries = loadInventory(root);
  } catch (e) {
    emit(`## Vendor-CVE-Scan\n\n❌ ${e.message}\n`);
    return 2;
  }
  const problems = verifyInventory(root, entries);
  const packages = groupPackages(entries);

  let findings;
  try {
    findings = await queryOsv(packages, fetchImpl);
  } catch (e) {
    emit(`## Vendor-CVE-Scan\n\n❌ OSV-Abfrage fehlgeschlagen: ${e.message}\n`);
    return 2;
  }

  if (sarifPath) writeFileSync(sarifPath, JSON.stringify(buildSarif(findings), null, 2));
  emit(renderMarkdown(packages, findings, problems));

  if (problems.length) return 2;
  return findings.some((f) => GATING.has(f.severity)) ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}

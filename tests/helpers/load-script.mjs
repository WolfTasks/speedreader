// tests/helpers/load-script.mjs
// Runs a classic (non-module) extension script in an isolated vm context with injected globals.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function loadScript(relativePath, globals) {
  const code = readFileSync(ROOT + relativePath, 'utf8');
  const context = vm.createContext({ setTimeout, clearTimeout, structuredClone, console, ...globals });
  vm.runInContext(code, context, { filename: relativePath });
  return context;
}

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

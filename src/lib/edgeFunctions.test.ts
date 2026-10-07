import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EDGE_FUNCTIONS } from './edgeFunctions';

const root = resolve(__dirname, '..', '..');
const functionsSource = readFileSync(resolve(root, 'server/services/functions.js'), 'utf8');

function dispatchedFunctionNames(): string[] {
  const names: string[] = [];
  const regex = /case\s+'([a-z0-9-]+)':/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(functionsSource)) !== null) {
    names.push(match[1]);
  }
  return Array.from(new Set(names)).sort();
}

function extractCaseBlock(fnName: string): string {
  const marker = `case '${fnName}':`;
  const idx = functionsSource.indexOf(marker);
  if (idx === -1) return '';
  const rest = functionsSource.slice(idx + marker.length);
  const nextCase = rest.search(/\bcase\s+'[a-z0-9-]+':|\bdefault:/);
  return nextCase === -1 ? rest : rest.slice(0, nextCase);
}

describe('standalone service function configuration', () => {
  it('implements every registered function in server/services/functions.js', () => {
    const dispatched = dispatchedFunctionNames();
    const missing = EDGE_FUNCTIONS.map(f => f.name).filter(name => !dispatched.includes(name));
    expect(missing).toEqual([]);
  });

  it('keeps the registry in sync with server/services/functions.js', () => {
    const registry = EDGE_FUNCTIONS.map(f => f.name).sort();
    expect(registry).toEqual(dispatchedFunctionNames());
  });

  it('classifies every registry entry', () => {
    for (const fn of EDGE_FUNCTIONS) {
      expect(['public', 'staff', 'internal', 'webhook']).toContain(fn.class);
      expect(fn.note.length).toBeGreaterThan(0);
    }
  });

  it('guards every staff-classified function with requireStaffGuard or requireAdminGuard', () => {
    const unguarded: string[] = [];
    for (const fn of EDGE_FUNCTIONS) {
      if (fn.class !== 'staff') continue;
      const block = extractCaseBlock(fn.name);
      if (!/requireStaffGuard\(|requireAdminGuard\(/.test(block)) {
        unguarded.push(fn.name);
      }
    }
    expect(unguarded).toEqual([]);
  });

  it('guards internal functions with requireInternalGuard', () => {
    const unguarded: string[] = [];
    for (const fn of EDGE_FUNCTIONS) {
      if (fn.class !== 'internal' || fn.name === 'process-webhook-queue') continue;
      const block = extractCaseBlock(fn.name);
      if (!/requireInternalGuard\(/.test(block)) {
        unguarded.push(fn.name);
      }
    }
    expect(unguarded).toEqual([]);
  });

  it('does not leave an unverified JWT decode in any service function', () => {
    expect(functionsSource).not.toMatch(/atob\s*\([^)]*\.split\(['"]\.['"]\)\[1\]/);
  });
});

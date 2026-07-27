import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { EDGE_FUNCTIONS } from './edgeFunctions';

const REPO_ROOT = resolve(__dirname, '../..');
const FUNCTIONS_DIR = resolve(REPO_ROOT, 'supabase/functions');
const CONFIG_PATH = resolve(REPO_ROOT, 'supabase/config.toml');

function deployedFunctionNames(): string[] {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
    .map(entry => entry.name)
    .sort();
}

function configuredFunctions(): Map<string, boolean> {
  const toml = readFileSync(CONFIG_PATH, 'utf8');
  const configured = new Map<string, boolean>();

  // [functions.<name>] followed by verify_jwt = <bool>
  const pattern = /\[functions\.([a-z0-9-]+)\]\s*\n\s*verify_jwt\s*=\s*(true|false)/g;
  for (const match of toml.matchAll(pattern)) {
    configured.set(match[1], match[2] === 'true');
  }
  return configured;
}

describe('edge function configuration', () => {
  it('configures every deployed function', () => {
    // An unlisted function inherits verify_jwt = true. Because the browser
    // holds an opaque sb_publishable_ key rather than a JWT, the gateway then
    // rejects it with 401 before the handler runs. This is exactly how
    // employee-auth — the login endpoint — became unreachable.
    const missing = deployedFunctionNames().filter(name => !configuredFunctions().has(name));
    expect(missing, `Missing [functions.<name>] entries in supabase/config.toml`).toEqual([]);
  });

  it('disables gateway JWT verification everywhere', () => {
    // Authorization is enforced in-handler via _shared/auth.ts instead. Leaving
    // it on at the gateway cannot work with opaque publishable keys.
    const verifying = [...configuredFunctions().entries()]
      .filter(([, verifyJwt]) => verifyJwt)
      .map(([name]) => name);
    expect(verifying).toEqual([]);
  });

  it('keeps the registry in sync with the deployed directories', () => {
    const registry = EDGE_FUNCTIONS.map(f => f.name).sort();
    expect(registry).toEqual(deployedFunctionNames());
  });

  it('classifies every registry entry', () => {
    for (const spec of EDGE_FUNCTIONS) {
      expect(['public', 'staff', 'internal', 'webhook']).toContain(spec.class);
      expect(spec.note.length).toBeGreaterThan(0);
    }
  });

  it('guards every non-public function in its handler', () => {
    // verify_jwt = false means the handler is the only thing standing between
    // the endpoint and the internet. Each class has its own accepted guard.
    const GUARD_PATTERN: Record<string, RegExp> = {
      staff: /_shared\/auth\.ts/,
      internal: /INTERNAL_FN_SECRET|requireInternal/,
      webhook: /INTERNAL_FN_SECRET|TELEGRAM_WEBHOOK_SECRET|SIRVOY|signature|secret/i,
    };

    const unguarded = EDGE_FUNCTIONS
      .filter(spec => spec.class !== 'public')
      .filter(spec => {
        const source = readFileSync(resolve(FUNCTIONS_DIR, spec.name, 'index.ts'), 'utf8');
        return !GUARD_PATTERN[spec.class].test(source);
      })
      .map(spec => `${spec.name} (${spec.class})`);

    expect(unguarded, 'functions with no handler-level authorization').toEqual([]);
  });

  it('does not leave an unverified JWT decode in any function', () => {
    // Four agent functions used to base64-decode the JWT payload and trust
    // `is_admin` without checking the signature, so any caller could forge it.
    const offenders = deployedFunctionNames().filter(name => {
      const source = readFileSync(resolve(FUNCTIONS_DIR, name, 'index.ts'), 'utf8');
      return /function\s+decodeJwtPayload/.test(source);
    });
    expect(offenders, 'functions still decoding a JWT without verifying it').toEqual([]);
  });
});

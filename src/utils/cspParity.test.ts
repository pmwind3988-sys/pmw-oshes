import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Content Security Policy parity', () => {
  /** Splits a CSP string into a map of directive name -> raw source list text. */
  function parseDirectives(csp: string): Record<string, string> {
    const directives: Record<string, string> = {};
    for (const part of csp.split(';')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const [name, ...rest] = trimmed.split(/\s+/);
      directives[name] = rest.join(' ');
    }
    return directives;
  }

  function extractCSPFromIndexHtml(): string {
    const indexPath = resolve(process.cwd(), 'index.html');
    const content = readFileSync(indexPath, 'utf-8');
    const match = content.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
    if (!match) throw new Error('Could not extract CSP from index.html');
    return match[1];
  }

  function extractCSPFromViteConfig(): string {
    const vitePath = resolve(process.cwd(), 'vite.config.ts');
    const content = readFileSync(vitePath, 'utf-8');
    const match = content.match(/const CSP = "([^"]+)"/);
    if (!match) throw new Error('Could not extract CSP from vite.config.ts');
    return match[1];
  }

  function extractCSPFromVercelJson(): string {
    const vercelPath = resolve(process.cwd(), 'vercel.json');
    const content = readFileSync(vercelPath, 'utf-8');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = JSON.parse(content) as any;
    const cspHeader = json.headers.find((h: { source: string }) =>
      h.source === '/(.*)'
    )?.headers.find((hdr: { key: string; value: string }) =>
      hdr.key === 'Content-Security-Policy'
    );
    if (!cspHeader) throw new Error('Could not extract CSP from vercel.json');
    return (cspHeader as { value: string }).value;
  }

  function expectGoogleSignInDirectives(csp: string): void {
    const directives = parseDirectives(csp);
    expect(directives['script-src']).toContain('https://accounts.google.com/gsi/client');
    expect(directives['style-src']).toContain('https://accounts.google.com/gsi/style');
    expect(directives['connect-src']).toContain('https://accounts.google.com/gsi/');
    expect(directives['frame-src']).toContain('https://accounts.google.com/gsi/');
  }

  it('index.html should contain all Google sign-in sources, per directive', () => {
    expectGoogleSignInDirectives(extractCSPFromIndexHtml());
  });

  it('vite.config.ts should contain all Google sign-in sources, per directive', () => {
    expectGoogleSignInDirectives(extractCSPFromViteConfig());
  });

  it('vercel.json should contain all Google sign-in sources, per directive', () => {
    expectGoogleSignInDirectives(extractCSPFromVercelJson());
  });
});

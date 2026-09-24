import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Content Security Policy parity', () => {
  const googleSources = [
    'https://accounts.google.com/gsi/client',
    'https://accounts.google.com/gsi/style',
    'https://accounts.google.com/gsi/',
  ];

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

  it('index.html should contain all Google sign-in sources', () => {
    const csp = extractCSPFromIndexHtml();
    for (const source of googleSources) {
      expect(csp).toContain(source);
    }
  });

  it('vite.config.ts should contain all Google sign-in sources', () => {
    const csp = extractCSPFromViteConfig();
    for (const source of googleSources) {
      expect(csp).toContain(source);
    }
  });

  it('vercel.json should contain all Google sign-in sources', () => {
    const csp = extractCSPFromVercelJson();
    for (const source of googleSources) {
      expect(csp).toContain(source);
    }
  });
});

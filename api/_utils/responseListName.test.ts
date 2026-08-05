import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Submissions are created in a list named exactly after the form, but forms
 * provisioned earlier use "<form> Responses" and both are live in this tenant.
 * api/evaluate.ts assumed the suffixed name, so a public evaluation link died
 * with `List "PERMIT TO WORK Responses" not found` on a form whose list is
 * plain "PERMIT TO WORK" — the reviewer saw a broken link, not a naming bug.
 */
describe('resolveResponseListName', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  /** @returns the resolved name, and every displayName Graph was asked about. */
  async function resolveAgainst(existing: string[]): Promise<{ resolved: string; asked: string[] }> {
    vi.resetModules();
    vi.stubEnv('VITE_SP_SITE_URL', 'https://contoso.sharepoint.com/sites/oshes');
    const asked: string[] = [];

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (!url.includes('/lists?')) {
        return new Response(JSON.stringify({ id: 'site-id' }), { status: 200 });
      }
      const match = /displayName%20eq%20'([^']+)'/.exec(url) ?? /displayName eq '([^']+)'/.exec(url);
      const displayName = decodeURIComponent(match?.[1] ?? '');
      asked.push(displayName);
      return new Response(
        JSON.stringify({ value: existing.includes(displayName) ? [{ id: `${displayName}-id`, displayName }] : [] }),
        { status: 200 },
      );
    }));

    const { resolveResponseListName } = await import('./graphClient.ts');
    return { resolved: await resolveResponseListName('graph-token', 'PERMIT TO WORK'), asked };
  }

  it('uses the list named after the form, and stops looking once it finds it', async () => {
    const { resolved, asked } = await resolveAgainst(['PERMIT TO WORK']);
    expect(resolved).toBe('PERMIT TO WORK');
    expect(asked).toEqual(['PERMIT TO WORK']);
  });

  it('falls through to the legacy suffixed list when that is the one provisioned', async () => {
    const { resolved } = await resolveAgainst(['PERMIT TO WORK Responses']);
    expect(resolved).toBe('PERMIT TO WORK Responses');
  });

  it('reports the bare title when neither exists, matching where submissions are written', async () => {
    const { resolved, asked } = await resolveAgainst([]);
    expect(resolved).toBe('PERMIT TO WORK');
    expect(asked).toEqual(['PERMIT TO WORK', 'PERMIT TO WORK Responses']);
  });
});

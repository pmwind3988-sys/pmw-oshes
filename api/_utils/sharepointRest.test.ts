import { afterEach, describe, expect, it, vi } from 'vitest';

describe('SharePoint REST helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('continues with an OAuth MERGE when contextinfo rejects digest lookup', async () => {
    vi.resetModules();
    vi.stubEnv('SP_SITE_URL', 'https://tenant.sharepoint.com/sites/YOUR-SITE');

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/_api/contextinfo')) {
        return new Response('{}', { status: 401 });
      }
      if (url.includes('$select=ListItemEntityTypeFullName')) {
        return Response.json({ ListItemEntityTypeFullName: 'SP.Data.TrainingRequisitionFormListItem' });
      }
      if (url.includes('/items(27)')) {
        const headers = init?.headers as Record<string, string>;
        expect(headers['X-RequestDigest']).toBeUndefined();
        expect(headers['X-HTTP-Method']).toBe('MERGE');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          applicantSignature: {
            __metadata: { type: 'SP.FieldUrlValue' },
            Url: 'https://tenant.sharepoint.com/sites/YOUR-SITE/Signature%20Images/signature.png',
            Description: 'Signature',
          },
        });
        return new Response(null, { status: 204 });
      }
      return new Response('unexpected request', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { patchHyperlinkViaSPRest } = await import('./sharepointRest.ts');
    await patchHyperlinkViaSPRest(
      'sharepoint-token',
      'Training Requisition Form',
      '27',
      'applicantSignature',
      'https://tenant.sharepoint.com/sites/YOUR-SITE/Signature%20Images/signature.png',
      'Signature',
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('creates a list item through SharePoint REST without a digest when OAuth is enough', async () => {
    vi.resetModules();
    vi.stubEnv('SP_SITE_URL', 'https://tenant.sharepoint.com/sites/YOUR-SITE');

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/_api/contextinfo')) {
        return new Response('{}', { status: 401 });
      }
      if (url.includes('$select=ListItemEntityTypeFullName')) {
        return Response.json({ ListItemEntityTypeFullName: 'SP.Data.InternalJobListingListItem' });
      }
      if (url.endsWith("/_api/web/lists/getbytitle('Internal%20Job%20Listing')/items")) {
        const headers = init?.headers as Record<string, string>;
        expect(headers['X-RequestDigest']).toBeUndefined();
        expect(headers['Content-Type']).toBe('application/json;odata=verbose');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          __metadata: { type: 'SP.Data.InternalJobListingListItem' },
          Title: 'Senior Analyst',
          Status: 'New',
        });
        return Response.json({ Id: 42 });
      }
      return new Response('unexpected request', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createListItemViaSPRest } = await import('./sharepointRest.ts');
    const created = await createListItemViaSPRest('sharepoint-token', 'Internal Job Listing', {
      Title: 'Senior Analyst',
      Status: 'New',
    });

    expect(created.id).toBe('42');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

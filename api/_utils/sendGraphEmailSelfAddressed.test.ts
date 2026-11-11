import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * This deployment sends workflow mail from the OSHES mailbox, and a layer
 * handled on paper is addressed to that same mailbox. A message a mailbox sends
 * to itself with no Sent Items copy can leave nothing behind for the site
 * owners who watch it, so that one case keeps its copy. Mail to anyone else
 * still leaves no copy, as before.
 */
describe('sendGraphEmail to the sending mailbox itself', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function payloadFor(to: string | string[]): Promise<{ saveToSentItems: boolean }> {
    vi.resetModules();
    vi.stubEnv('OSHES_FORM_EMAIL_FROM_ADDRESS', 'pmw.oshesweb@pmw-group.com');
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    const { sendGraphEmail } = await import('./workflowEmail.ts');
    await sendGraphEmail('graph-token', { to, subject: 'Permit to work submitted', body: '<p>Review required.</p>' });
    return JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  }

  it('keeps a copy in the mailbox when the mailbox is the recipient', async () => {
    expect((await payloadFor('pmw.oshesweb@pmw-group.com')).saveToSentItems).toBe(true);
  });

  it('recognises the mailbox whatever the capitalisation or spacing', async () => {
    expect((await payloadFor([' PMW.OshesWeb@pmw-group.com '])).saveToSentItems).toBe(true);
  });

  it('keeps the copy when the mailbox is one of several recipients', async () => {
    expect((await payloadFor(['hod@pmw-group.com', 'pmw.oshesweb@pmw-group.com'])).saveToSentItems).toBe(true);
  });

  it('leaves no copy for mail addressed to someone else', async () => {
    expect((await payloadFor('approver@pmw-group.com')).saveToSentItems).toBe(false);
  });
});

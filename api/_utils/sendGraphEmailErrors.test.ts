import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A 404 from sendMail is unrecoverable and easy to misread: a Microsoft 365
 * group is rejected exactly like an address that does not exist, so the message
 * has to raise the recipient type rather than just assert the mailbox is gone.
 */
describe('sendGraphEmail failure messages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const capturedUrls: string[] = [];

  async function sendAgainst(status: number, body: string): Promise<string> {
    vi.resetModules();
    capturedUrls.length = 0;
    vi.stubEnv('OSHES_FORM_EMAIL_FROM_ADDRESS', 'PMWOSHESWEB@pmw-group.com');
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      capturedUrls.push(String(input));
      return new Response(body, { status });
    }));

    const { sendGraphEmail } = await import('./workflowEmail.ts');
    try {
      await sendGraphEmail('graph-token', {
        to: ['approver@pmw-group.com'],
        subject: 'Permit to work submitted',
        body: '<p>Review required.</p>',
      });
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error(`expected sendGraphEmail to reject on status ${status}`);
  }

  it('raises the recipient type instead of only claiming the mailbox is missing', async () => {
    const message = await sendAgainst(404, JSON.stringify({ error: { code: 'ErrorInvalidUser' } }));

    expect(message).toContain('PMWOSHESWEB@pmw-group.com');
    expect(message).toContain('Microsoft 365 group or distribution list');
    expect(message).toContain('RecipientTypeDetails');
    expect(message).toContain('ErrorInvalidUser');
  });

  it('addresses the sender by the configured address', async () => {
    await sendAgainst(404, '{}');

    expect(capturedUrls[0]).toBe(
      'https://graph.microsoft.com/v1.0/users/PMWOSHESWEB%40pmw-group.com/sendMail',
    );
  });

  it('distinguishes a send-as denial from a missing mailbox', async () => {
    const message = await sendAgainst(403, JSON.stringify({ error: { code: 'ErrorAccessDenied' } }));

    expect(message).toContain('not allowed to send as');
    expect(message).toContain('Mail.Send');
  });

  it('quotes the Graph error code for statuses with no dedicated explanation', async () => {
    const message = await sendAgainst(429, JSON.stringify({ error: { code: 'ApplicationThrottled' } }));

    expect(message).toContain('429');
    expect(message).toContain('ApplicationThrottled');
  });

  it('still reports the status when Graph returns a non-JSON body', async () => {
    const message = await sendAgainst(502, '<html>Bad Gateway</html>');

    expect(message).toContain('502');
    expect(message).toContain('Bad Gateway');
  });
});

/**
 * appBaseUrl.ts — the address this deployment answers to, for links that leave it.
 *
 * A link that goes into an email has to open for somebody who is not here: it is
 * read hours later, from another mailbox, often on another device. So it cannot
 * be built from wherever the sender's browser happened to be standing. Sent from
 * a Vercel preview deployment, a branch alias, or `npm run dev`, that would mail
 * out a URL the recipient cannot reach — preview deployments sit behind Vercel's
 * own sign-in, and localhost is nobody else's machine.
 *
 * `VITE_APP_BASE_URL` is the same variable `getApplicationBaseUrl()` in
 * `api/_utils/workflowEmail.ts` reads for the mail the serverless side sends, so
 * both halves of the app address the deployment by one name. Unset, this falls
 * back to the current origin, which is the right answer for a local run against
 * a local deployment and is what every link was built from before.
 */
export function appBaseUrl(): string {
  const configured = import.meta.env.VITE_APP_BASE_URL;
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim().replace(/\/+$/, "");
  }
  return window.location.origin;
}

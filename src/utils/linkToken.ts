/**
 * linkToken.ts — the value that ties one public review link to one submission.
 *
 * The client-side copy of `api/_utils/linkToken.ts`; api/ cannot import from
 * src/. Keep the two in step.
 *
 * The dashboard mints these as well as the server, because resending or
 * rescheduling a layer's notice builds the link here in the browser. There is
 * no secret involved — the binding is a random value stored on the record, and
 * whoever may read the record may read it — which is exactly why this can be
 * done client-side at all.
 */

/** Column holding a submission's binding for one layer. */
export function linkTokenField(layerNumber: number): string {
  return `L${layerNumber}_LinkToken`;
}

export function mintLinkToken(): string {
  return crypto.randomUUID();
}

/** The stored binding for a layer, or "" when the submission predates this. */
export function readLinkToken(
  fields: Record<string, unknown> | undefined,
  layerNumber: number,
): string {
  const value = fields?.[linkTokenField(layerNumber)];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The binding to put in a link, minting one into `patch` if the record has none.
 *
 * Returns "" for a layer that is not reached by link at all — a 365 layer is
 * opened by signing in, so there is nothing to bind. Reuses an existing value
 * rather than rotating it, so resending a notice does not silently kill the
 * link the reviewer already has in their inbox.
 */
export function ensureLinkToken(
  layer: { authMode?: string; publicToken?: string } | undefined,
  fields: Record<string, unknown> | undefined,
  layerNumber: number,
  patch: Record<string, unknown>,
): string {
  if (String(layer?.authMode || "") !== "public") return "";
  if (!String(layer?.publicToken || "").trim()) return "";

  const existing = readLinkToken(fields, layerNumber);
  if (existing) return existing;

  const minted = mintLinkToken();
  patch[linkTokenField(layerNumber)] = minted;
  return minted;
}

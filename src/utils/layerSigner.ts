/**
 * layerSigner.ts — who signed a layer from the signed-in review page, and in
 * which post.
 *
 * In this app a signed-in reviewer's decision is written from the browser over
 * SharePoint REST (`EvaluationPage`), not through `api/evaluate.ts`, so the
 * stamp the server writes for public links is written here for signed-in ones.
 * Both read the signer's `Approval Directory` row: the directory is what
 * routing already trusts about a person, so the position printed under a
 * signature is the one that decided the request reached them.
 *
 * The name and position are stamped at the moment of signing rather than
 * looked up when the record is read — a promotion next year must not rewrite
 * who signed what this year. Wording lives in `signOff.ts`.
 */
import { createApprovalDirectoryReader } from "./approvalDirectory";
import { spPatch } from "./formBuilderSP";

export interface SignerIdentity {
  name: string;
  position: string;
}

/**
 * The signer's name and post from their directory row. Absent — no row, an
 * inactive row, no directory at all — the name falls back to the one Azure
 * gave the signed-in account and the position is left out, for the page to
 * print the layer title in its place. Never throws.
 */
export async function readSignerIdentity(
  token: string,
  email: string,
  fallbackName?: string | null,
): Promise<SignerIdentity> {
  const row = email
    ? await createApprovalDirectoryReader(token).lookupPerson(email).catch(() => null)
    : null;
  const fallback = (fallbackName ?? "").trim();
  return {
    name: row?.name?.trim() || fallback,
    position: row?.position?.trim() || "",
  };
}

/**
 * Records who decided layer `layerNumber`: `L{n}_ActedBy`, then
 * `L{n}_ActedByName` / `L{n}_ActedByPosition`.
 *
 * Each is patched on its own and allowed to fail. The decision itself is
 * already written by the time this runs, and a form whose response list
 * predates these columns must keep working — SharePoint refuses a whole patch
 * that names one missing column, so bundling them would lose the decision's
 * other fields along with them. Such a form prints the layer title as the
 * position until its list gains the columns.
 */
export async function stampLayerSigner(
  token: string,
  itemUrl: string,
  layerNumber: number,
  email: string,
  fallbackName?: string | null,
): Promise<void> {
  const address = email.trim();
  if (!address) return;
  await spPatch(token, itemUrl, { [`L${layerNumber}_ActedBy`]: address.slice(0, 255) }).catch(() => undefined);

  const signer = await readSignerIdentity(token, address, fallbackName);
  const stamp: Record<string, string> = {};
  if (signer.name) stamp[`L${layerNumber}_ActedByName`] = signer.name.slice(0, 255);
  if (signer.position) stamp[`L${layerNumber}_ActedByPosition`] = signer.position.slice(0, 255);
  if (Object.keys(stamp).length === 0) return;
  await spPatch(token, itemUrl, stamp).catch(() => undefined);
}

/**
 * signOff.ts — the block a decision is signed with: what was done, by whom, in
 * which post. "Approved By / Ahmad Faiz / Head of Department, Safety", the way
 * a paper form closes.
 *
 * The reviewer page, its Previous Layers list and the PDF record all print it,
 * so the wording is decided once, here.
 *
 * The name and position are stamped onto the submission at the moment of
 * signing (`L{n}_ActedByName`, `L{n}_ActedByPosition`, written by
 * `api/evaluate.ts`) rather than looked up when the record is read. A promotion
 * next year must not rewrite who signed what this year.
 */
import { approverDisplayName } from "./approverIdentity";

export type SignOffVerdict = "approved" | "evaluated" | "rejected";

/**
 * What a recorded layer status says was done, or null when it records no
 * personal decision — still pending, closed on paper, or rejected by a cascade
 * from an earlier layer ("Rejected at Layer 2"), where nobody at this layer
 * signed anything.
 */
export function signOffVerdictFromStatus(status: unknown): SignOffVerdict | null {
  const value = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (value === "approved") return "approved";
  if (value === "confirmed") return "evaluated";
  if (value === "rejected") return "rejected";
  return null;
}

/** The verdict a layer of this type is about to be signed with. */
export function signOffVerdictForLayer(layerType: unknown, rejecting = false): SignOffVerdict {
  if (rejecting) return "rejected";
  return layerType === "evaluation" ? "evaluated" : "approved";
}

/**
 * The caption above the signature line. A layer's own custom caption wins for
 * a positive decision; a rejection is always called one, because a caption
 * like "Endorsed By" over a rejected request says the opposite of what happened.
 */
export function signOffLabel(verdict: SignOffVerdict, customLabel?: string | null): string {
  if (verdict === "rejected") return "Rejected By";
  const custom = (customLabel ?? "").trim();
  if (custom) return custom;
  return verdict === "evaluated" ? "Evaluated By" : "Approved By";
}

/**
 * The name printed on the line: the one stamped at signing, else whatever the
 * address spells out. Empty when there is nobody to name — a public link acted
 * on by one of several people records no actor at all.
 */
export function signOffName(storedName: unknown, email: unknown): string {
  const address = typeof email === "string" ? email.trim() : "";
  // "SYSTEM" is what the public path records when nobody signed in to be named.
  const usable = address.toUpperCase() === "SYSTEM" ? "" : address;
  return approverDisplayName(typeof storedName === "string" ? storedName : "", usable);
}

/**
 * The post printed under the name: the directory position stamped at signing,
 * else the layer's own title ("HOD Approval"), which is what the page printed
 * before positions were recorded and still says which seat signed.
 */
export function signOffPosition(storedPosition: unknown, layerTitle?: string | null): string {
  const position = typeof storedPosition === "string" ? storedPosition.trim() : "";
  return position || (layerTitle ?? "").trim();
}

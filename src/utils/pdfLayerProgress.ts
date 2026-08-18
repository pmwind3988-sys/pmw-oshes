/**
 * How far a record has got through its chain, as the printed document reads it.
 *
 * One place decides what "signed" means, because three different callers build
 * a PDF — the copy stored at submit time, the copy rebuilt after an approval,
 * and the portal's own download — and a document that prints a signature block
 * for a layer nobody has reached is worse than one that prints nothing at all:
 * an empty signature well looks exactly like a signature whose image failed to
 * load, and the difference between those two is the whole point of the page.
 */

/** The status word a layer carries while it is the one being waited on. */
export const PDF_LAYER_AWAITING = "Pending";
/** …and while it is behind that one, not yet asked of anybody. */
export const PDF_LAYER_NOT_REACHED = "Not started";

/**
 * Whether a layer is still waiting on somebody.
 *
 * Read off the status word rather than off a flag the caller sets, so a
 * document assembled from raw SharePoint columns and one assembled from the
 * portal's own record agree. A blank status is treated as waiting: a layer
 * nobody has written anything against has certainly not signed.
 */
export function isAwaitingLayer(layer: { status: string }): boolean {
  const status = layer.status.trim().toLowerCase();
  if (!status) return true;
  // A layer approved on paper carries "Manual paper …", and that is a decision.
  if (status.startsWith("manual ")) return false;
  return status.includes("pending")
    || status.includes("waiting")
    || status.includes("not started")
    || status.includes("progress");
}

export interface ChainProgress<T> {
  signed: number;
  total: number;
  awaiting: T[];
  headline: string;
  note: string;
}

/**
 * What to say at the top of a document whose chain has not finished, or null
 * for one that has.
 *
 * A finished record says nothing extra — it prints exactly as it always did.
 * An unfinished one says so once, plainly, and says which of the two
 * unfinished states it is in: still moving, or stopped for good.
 */
export function chainProgress<T extends { status: string }>(
  layerResults: T[] | undefined,
  formStatus: string | undefined,
): ChainProgress<T> | null {
  const layers = layerResults ?? [];
  const awaiting = layers.filter(isAwaitingLayer);
  if (layers.length === 0 || awaiting.length === 0) return null;

  const signed = layers.length - awaiting.length;
  const closedEarly = /cancel|withdraw|void|reject/.test((formStatus || "").toLowerCase());

  return {
    signed,
    total: layers.length,
    awaiting,
    headline: closedEarly ? "Closed before the chain finished" : "Interim copy",
    note: closedEarly
      ? `${signed} of ${layers.length} layers were signed. The rest were never reached and are listed unsigned below.`
      : `${signed} of ${layers.length} layers signed. This is not the final record — the layers listed unsigned below have still to sign.`,
  };
}

import type { LayerConfigItem } from "../types";

/** The parts of a layer that decide how its reviewer reaches it. */
export type ReviewableLayer = Pick<LayerConfigItem, "layerNumber" | "authMode"> & {
  publicToken?: string;
};

export interface LayerReviewLinkParams {
  /** Origin the app is served from; a trailing slash is tolerated. */
  baseUrl: string;
  layer: ReviewableLayer | null | undefined;
  formSlug: string;
  responseItemId: string | number;
}

/**
 * The address a reviewer is sent to for one layer.
 *
 * A public layer is reachable only by its own token. That link has to survive
 * being forwarded out of the shared mailbox it was addressed to — the person
 * who actually acts on it has no account here — so it must carry no sign-in
 * requirement. A 365 layer uses the signed-in evaluation route instead.
 *
 * Returns undefined when the layer is not addressable at all, which the caller
 * should treat as a broken workflow rather than a reason to fall back: the
 * default `/admin/submissions` link is admin-only and would strand exactly the
 * outside reviewer a public layer exists to reach.
 */
export function buildLayerReviewLink(params: LayerReviewLinkParams): string | undefined {
  const { layer } = params;
  if (!layer) return undefined;
  const base = params.baseUrl.replace(/\/+$/, "");
  const itemId = encodeURIComponent(String(params.responseItemId));

  if (layer.authMode === "public") {
    const publicToken = String(layer.publicToken ?? "").trim();
    return publicToken
      ? `${base}/eval/${encodeURIComponent(publicToken)}?item=${itemId}`
      : undefined;
  }

  const slug = params.formSlug.trim();
  if (!slug) return undefined;
  return `${base}/eval/${encodeURIComponent(slug)}/${itemId}/${layer.layerNumber}`;
}

/**
 * Why a layer has no reachable review link, phrased for whoever has to fix the
 * workflow. A public layer missing its token is a configuration fault in the
 * form builder, not something the approver acting right now can resolve.
 */
export function describeMissingReviewLink(layer: ReviewableLayer): string {
  return layer.authMode === "public"
    ? `Layer ${layer.layerNumber} is a public step but has no public link token. Republish the form so the public evaluation link can be issued.`
    : `Layer ${layer.layerNumber} has no review link because this form has no slug. Republish the form before advancing.`;
}

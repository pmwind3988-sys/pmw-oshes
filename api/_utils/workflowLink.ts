/**
 * workflowLink.ts — builds the per-item link a workflow email sends out.
 *
 * Approval layers get `/approval/...`, evaluation layers get `/eval/...`, so the
 * URL names what the recipient is being asked to do. Both prefixes mount the
 * same page, which resolves the layer type from the data either way — the label
 * is for the human, not the router.
 *
 * `src/utils/workflowLink.ts` is the client-side copy of this file; api/ cannot
 * import from src/. Keep the two in step.
 */

export type WorkflowRoutePrefix = "approval" | "eval";

export interface WorkflowReviewLinkParams {
  baseUrl: string;
  layerType: string | undefined;
  authMode: string | undefined;
  publicToken: string | undefined;
  formSlug: string;
  responseItemId: string | number;
  layerNumber: number;
}

export function workflowRoutePrefix(layerType: string | undefined): WorkflowRoutePrefix {
  return layerType === "evaluation" ? "eval" : "approval";
}

export function buildWorkflowReviewLink(params: WorkflowReviewLinkParams): string {
  const prefix = workflowRoutePrefix(params.layerType);
  const token = (params.publicToken || "").trim();
  const itemId = encodeURIComponent(String(params.responseItemId));
  // The token form carries the item as a query param, not a path segment — the
  // token identifies the layer, the item says which submission.
  if (params.authMode === "public" && token) {
    return `${params.baseUrl}/${prefix}/${encodeURIComponent(token)}?item=${itemId}`;
  }
  return `${params.baseUrl}/${prefix}/${encodeURIComponent(params.formSlug)}/${itemId}/${params.layerNumber}`;
}

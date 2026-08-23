/**
 * linkReissue.ts — what happens when somebody clicks a link issued before
 * review links were bound to their submission.
 *
 * Those links carry no `k` and cannot be given one after the fact: the value
 * lives on the record, and the email went out years — or at least weeks —
 * before it existed. Refusing them outright would strand a real reviewer, so
 * clicking one mails a fresh, bound link to the address that layer was actually
 * sent to, and shows the clicker nothing.
 *
 * That last part is the point. The id in an old link is exactly the thing that
 * could not be trusted, so it is used only to decide *who to write to*, never
 * what to show. Someone counting the id up sets off an email to that record's
 * own reviewer and learns nothing — which is why `evaluate.ts` answers every
 * old link identically, whether the submission exists, sits at another layer,
 * or was never theirs to see. A response that varied would hand back the
 * enumeration the binding just took away.
 */
import { buildWorkflowActionEmail, sendGraphEmail } from "./workflowEmail.js";
import { buildWorkflowReviewLink } from "./workflowLink.js";
import { updateListItemFields } from "./graphClient.js";
import { ensureWorkflowColumns } from "./provisioning.js";
import { parseValidEmailList } from "./layerRecipients.js";
import { logWarn } from "./logger.js";
import { REFERENCE_NO_FIELD } from "./referenceNumber.js";
import {
  LINK_REISSUE_LOG_FIELD,
  isReissueAllowed,
  linkTokenField,
  mintLinkToken,
  readLinkToken,
  recordReissue,
} from "./linkToken.js";

export interface LinkReissuePlan {
  recipients: string[];
  linkToken: string;
  updates: Record<string, unknown>;
}

/**
 * Whether an old link earns a replacement, and what to write down if so.
 *
 * Kept apart from the sending so the decision can be tested without a mailbox.
 * Returns `null` for "do nothing", which covers three cases that all have to
 * look identical from outside: the layer was never activated on this record, it
 * has no address to write to, or one was sent too recently.
 */
export function planLinkReissue(
  fields: Record<string, unknown> | undefined,
  layerNumber: number,
  now: Date = new Date(),
): LinkReissuePlan | null {
  if (!fields) return null;

  // Only a layer this submission actually reached has recipients written
  // against it, which makes this the cheapest honest test for "was this link
  // ever real for this record".
  const recipients = parseValidEmailList(
    fields[`L${layerNumber}_NotifyEmails`]
    || fields[`L${layerNumber}_Emails`]
    || fields[`L${layerNumber}_Email`],
  );
  if (recipients.length === 0) return null;
  if (!isReissueAllowed(fields[LINK_REISSUE_LOG_FIELD], layerNumber, now)) return null;

  const existing = readLinkToken(fields, layerNumber);
  const linkToken = existing || mintLinkToken();
  const updates: Record<string, unknown> = {
    [LINK_REISSUE_LOG_FIELD]: recordReissue(fields[LINK_REISSUE_LOG_FIELD], layerNumber, now),
  };
  // Minted here rather than in a migration, so a submission already in flight
  // when this shipped needs no backfill and the deployments can go out in any
  // order.
  if (!existing) updates[linkTokenField(layerNumber)] = linkToken;

  return { recipients, linkToken, updates };
}

export interface ReissueReviewLinkParams {
  graphToken: string;
  responseListName: string;
  /** SharePoint's own item id, as `updateListItemFields` expects it. */
  responseItemId: string;
  fields: Record<string, unknown>;
  layerNumber: number;
  /** The layer's config — only a public, tokened layer is reachable by link. */
  layer: Record<string, unknown> | undefined;
  formTitle: string;
  formSlug: string;
  totalLayers: number;
  baseUrl: string;
  now?: Date;
}

/**
 * Best-effort throughout: the caller's answer is the same whether this sent
 * anything or not, so a failure here must not become a failure there.
 */
export async function reissueReviewLink(params: ReissueReviewLinkParams): Promise<void> {
  const publicToken = String(params.layer?.publicToken || "").trim();
  if (String(params.layer?.authMode || "") !== "public" || !publicToken) return;

  const plan = planLinkReissue(params.fields, params.layerNumber, params.now);
  if (!plan) return;

  try {
    // A list provisioned before bindings existed has nowhere to put one, and
    // this is the moment an old link is being repaired — so the columns are
    // added here rather than leaving the replacement to fail quietly.
    await ensureWorkflowColumns(
      params.graphToken,
      params.responseListName,
      Math.max(params.totalLayers, params.layerNumber),
    );
    await updateListItemFields(
      params.graphToken,
      params.responseListName,
      params.responseItemId,
      plan.updates,
    );

    const layerType = params.layer?.type === "evaluation" ? "evaluation" : "approval";
    await sendGraphEmail(params.graphToken, buildWorkflowActionEmail({
      formTitle: params.formTitle,
      submittedBy: String(params.fields.SubmittedBy || "Public respondent"),
      responseItemId: params.responseItemId,
      layer: params.layerNumber,
      totalLayers: params.totalLayers,
      recipient: plan.recipients.length === 1 ? plan.recipients[0] : plan.recipients,
      layerType,
      reviewLink: buildWorkflowReviewLink({
        baseUrl: params.baseUrl,
        layerType,
        authMode: "public",
        publicToken,
        formSlug: params.formSlug,
        responseItemId: params.responseItemId,
        layerNumber: params.layerNumber,
        linkToken: plan.linkToken,
      }),
      // This deployment's action email leads with the link for a public layer
      // rather than a "this is your task" call to action, which is what a
      // replacement link is.
      authMode: "public",
      referenceNo: String(params.fields[REFERENCE_NO_FIELD] || ""),
    }));
  } catch (err) {
    logWarn("api:evaluate:reissue", "Could not replace an unbound review link", {
      layerNumber: params.layerNumber,
      responseItemId: params.responseItemId,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

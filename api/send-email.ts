import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, queryListItemById } from "./_utils/graphClient.js";
import { logError, logWarn } from "./_utils/logger.js";
import {
  buildWorkflowActionEmail,
  deliverWorkflowEmail,
  resolveOshesFormSender,
  sendGraphEmail,
  type WorkflowEmailAttachment,
  type WorkflowEmailContext,
} from "./_utils/workflowEmail.js";
import { sendEmailTestRunDispatch } from "./_utils/sendEmailTestRun.js";
import { redirectTestMessage } from "./_utils/testRun.js";

/**
 * Accepts either a raw base64 string or a data: URI, because the browser's
 * FileReader produces the latter. Anything without a name or payload is dropped
 * rather than sent as an empty attachment.
 */
function normalizeAttachment(entry: unknown): WorkflowEmailAttachment | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const record = entry as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const contentType = typeof record.contentType === "string" && record.contentType.trim()
    ? record.contentType.trim()
    : "application/octet-stream";
  let contentBytes = typeof record.contentBytes === "string"
    ? record.contentBytes
    : typeof record.content === "string"
      ? record.content
      : "";
  if (contentBytes.startsWith("data:")) {
    const commaIndex = contentBytes.indexOf(",");
    contentBytes = commaIndex >= 0 ? contentBytes.slice(commaIndex + 1) : "";
  }
  contentBytes = contentBytes.trim();
  if (!name || !contentBytes) return null;
  return { name, contentType, contentBytes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

interface LayerEmailFacts {
  formTitle: string;
  submittedBy: string;
  totalLayers: number;
  layerType: "approval" | "evaluation";
  reviewLink: string;
  authMode: "365" | "public";
  submittedAt?: string;
  referenceNo?: string;
}

/**
 * The facts of a layer notice from the signed-in browser. The server draws the
 * email from them with the same template as every other layer email, so the
 * browser cannot send a different design. Anything malformed returns null and
 * the caller's own subject and body are used instead.
 */
function readLayerEmailFacts(value: unknown): LayerEmailFacts | null {
  if (!isRecord(value)) return null;
  const text = (field: unknown) => (typeof field === "string" ? field.trim() : "");
  const formTitle = text(value.formTitle);
  const reviewLink = text(value.reviewLink);
  const totalLayers = value.totalLayers;
  if (!formTitle || !/^https?:\/\//i.test(reviewLink)) return null;
  if (typeof totalLayers !== "number" || !Number.isInteger(totalLayers) || totalLayers < 1) return null;
  if (value.layerType !== "approval" && value.layerType !== "evaluation") return null;
  if (value.authMode !== "365" && value.authMode !== "public") return null;
  return {
    formTitle,
    submittedBy: text(value.submittedBy),
    totalLayers,
    layerType: value.layerType,
    reviewLink,
    authMode: value.authMode,
    submittedAt: text(value.submittedAt) || undefined,
    referenceNo: text(value.referenceNo) || undefined,
  };
}

interface ApiRequest {
  body: Record<string, unknown>;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { to, subject, body, workflow, layerEmail, row, sendToConfiguredSender, attachments, testTicket, slug } = req.body as Record<string, unknown>;
  const configuredSender = resolveOshesFormSender();

  // A manual-paper workflow has no online reviewer to address, so it is sent to the
  // configured OSHES mailbox instead of a caller-supplied recipient.
  const recipients = sendToConfiguredSender === true && configuredSender
    ? [configuredSender]
    : typeof to === "string"
      ? [to]
      : Array.isArray(to)
        ? to.filter((recipient): recipient is string => typeof recipient === "string")
        : [];
  const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  if (recipients.length === 0 || recipients.some((recipient) => !isEmail(recipient))) {
    return res.status(400).json({ error: "Invalid recipient email address" });
  }

  if (typeof subject !== "string" || !subject.trim() || typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ error: "Missing required fields: to, subject, body" });
  }

  try {
    const token = await getGraphToken();
    const normalizedAttachments = Array.isArray(attachments)
      ? attachments.map(normalizeAttachment).filter((attachment): attachment is WorkflowEmailAttachment => attachment !== null)
      : [];
    // The context is rebuilt field by field rather than cast from the request:
    // `WorkflowEmailContext.testRun` must only ever be set by this server.
    const workflowFields = isRecord(workflow) ? workflow : null;
    const context: Omit<WorkflowEmailContext, "testRun"> | null =
      workflowFields &&
      typeof workflowFields.listTitle === "string" &&
      (typeof workflowFields.responseItemId === "string" || typeof workflowFields.responseItemId === "number") &&
      typeof workflowFields.layer === "number"
        ? {
          listTitle: workflowFields.listTitle,
          responseItemId: workflowFields.responseItemId,
          layer: workflowFields.layer,
        }
        : null;
    // A layer notice is drawn here from its facts; only a manual-paper send to
    // the configured mailbox keeps the caller's own body.
    const layerFacts = context && sendToConfiguredSender !== true ? readLayerEmailFacts(layerEmail) : null;
    const message = layerFacts && context
      ? buildWorkflowActionEmail({
        ...layerFacts,
        recipient: recipients,
        responseItemId: context.responseItemId,
        layer: context.layer,
      })
      : {
        to: recipients,
        subject,
        body,
        ...(normalizedAttachments.length ? { attachments: normalizedAttachments } : {}),
      };

    // Whether this mail belongs to a test run is read off the response row the
    // caller names — never taken from the request — so a decision made from an
    // emailed link days after the ticket expired is still redirected. `row`
    // names a row for mail that is not a layer notice (the submitter's final
    // approved / not approved notice), so it is checked without being logged
    // against a layer. See _utils/sendEmailTestRun.ts.
    const rowFields = isRecord(row) ? row : null;
    const rowRef = context
      ?? (rowFields
        && typeof rowFields.listTitle === "string"
        && (typeof rowFields.responseItemId === "string" || typeof rowFields.responseItemId === "number")
        ? { listTitle: rowFields.listTitle, responseItemId: rowFields.responseItemId }
        : null);
    let storedFields: Record<string, unknown> | null = null;
    if (rowRef && /^\d+$/.test(String(rowRef.responseItemId))) {
      try {
        storedFields = (await queryListItemById(token, rowRef.listTitle, String(rowRef.responseItemId)))?.fields ?? null;
      } catch (lookupError) {
        logWarn("api:send-email", "Could not read the workflow row to check for a test run; relying on any forwarded ticket", {
          listTitle: rowRef.listTitle,
          errorMessage: lookupError instanceof Error ? lookupError.message : String(lookupError),
        });
      }
    }

    const dispatch = sendEmailTestRunDispatch(storedFields, testTicket, slug);
    if (dispatch.kind === "blocked") {
      logWarn("api:send-email", "Test run has no usable redirect address; refusing to send rather than mailing a real person", {
        listTitle: rowRef?.listTitle,
      });
      return res.status(200).json({ ok: true, skipped: "test-run-redirect-unusable" });
    }
    const testRun = dispatch.kind === "redirect" ? dispatch.redirect : undefined;

    if (context) {
      await deliverWorkflowEmail(token, message, { ...context, testRun });
    } else {
      await sendGraphEmail(token, testRun ? redirectTestMessage(message, testRun) : message);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    logError("api:send-email", "Failed to send email", e);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

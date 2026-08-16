import { setCorsHeaders, validateApiKey } from "./_utils/auth.js";
import {
  getGraphToken,
  queryListItems,
  updateListItemFields,
} from "./_utils/graphClient.js";
import { logError, logWarn } from "./_utils/logger.js";
import { OSHES_LISTS } from "./_utils/oshesConfig.js";
import {
  buildWorkflowActionEmail,
  deliverWorkflowEmail,
  getDueWorkflowEmailSchedules,
  parseWorkflowEmailSchedule,
  setWorkflowEmailSchedule,
} from "./_utils/workflowEmail.js";
import { REFERENCE_NO_FIELD } from "./_utils/referenceNumber.js";
import { parseValidEmailList } from "./_utils/layerRecipients.js";

function scheduledRecipients(recipient: string): string | string[] {
  const parsed = parseValidEmailList(recipient);
  if (parsed.length === 0) return recipient;
  return parsed.length === 1 ? parsed[0] : parsed;
}

interface ApiRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

function isAuthorized(req: ApiRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization;
  const authValue = Array.isArray(authorization) ? authorization[0] : authorization;
  if (cronSecret && authValue === `Bearer ${cronSecret}`) return true;
  return validateApiKey(req.headers).valid;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const token = await getGraphToken();
    const forms = await queryListItems(token, OSHES_LISTS.masterForm, { top: 500 });
    let sent = 0;
    let failed = 0;
    let examined = 0;

    for (const form of forms) {
      const formTitle = typeof form.fields.Title === "string" ? form.fields.Title.trim() : "";
      if (!formTitle) continue;
      let items;
      try {
        items = await queryListItems(token, formTitle, { top: 500 });
      } catch {
        continue;
      }

      for (const item of items) {
        const dueEntries = getDueWorkflowEmailSchedules(item.fields.WorkflowEmailSchedule);
        for (const entry of dueEntries) {
          examined++;
          const currentLayer = Number(item.fields.CurrentLayer || item.fields.CurrentApprovalLayer || 0);
          if (currentLayer && currentLayer !== entry.layer) continue;

          const schedule = setWorkflowEmailSchedule(
            parseWorkflowEmailSchedule(item.fields.WorkflowEmailSchedule),
            { ...entry, status: "sending", updatedAt: new Date().toISOString() },
          );
          await updateListItemFields(token, formTitle, item.id, {
            WorkflowEmailSchedule: JSON.stringify(schedule),
          });

          try {
            await deliverWorkflowEmail(
              token,
              buildWorkflowActionEmail({
                formTitle,
                submittedBy: entry.submittedBy,
                responseItemId: item.id,
                layer: entry.layer,
                totalLayers: entry.totalLayers,
                // A fan-out layer stores its whole delivery list in one string;
                // split it back out so Graph gets separate recipients.
                recipient: scheduledRecipients(entry.recipient),
                layerType: entry.layerType,
                reviewLink: entry.reviewLink,
                authMode: entry.authMode,
                referenceNo: String(item.fields[REFERENCE_NO_FIELD] || ""),
                submittedAt: entry.submittedAt,
              }),
              { listTitle: formTitle, responseItemId: item.id, layer: entry.layer },
            );
            sent++;
          } catch (error) {
            failed++;
            logWarn("api:workflow-email-cron", "Scheduled workflow email failed", {
              formTitle,
              itemId: item.id,
              layer: entry.layer,
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }

    return res.status(200).json({ ok: true, examined, sent, failed });
  } catch (error) {
    logError("api:workflow-email-cron", "Scheduled workflow email run failed", error);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

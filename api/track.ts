import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, queryListItemById, queryListItems } from "./_utils/graphClient.js";
import { logError } from "./_utils/logger.js";
import { OSHES_LISTS } from "./_utils/oshesConfig.js";

interface ApiRequest {
  query: Record<string, string | string[]>;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

const NOT_FOUND = "No report with that reference. Check the letters and dashes.";

interface ParsedReference {
  code: string;
  itemId: number;
}

/** "INC-2607-0142" → code INC, item 142. */
function parseReference(raw: string): ParsedReference | null {
  const parts = raw.trim().toUpperCase().split("-").filter(Boolean);
  if (parts.length < 2) return null;
  const itemId = Number(parts[parts.length - 1]);
  if (!Number.isInteger(itemId) || itemId <= 0) return null;
  return { code: parts[0], itemId };
}

function severityHint(fields: Record<string, unknown>): string {
  for (const [key, value] of Object.entries(fields)) {
    if (!/severity|outcome/i.test(key)) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function subjectOf(fields: Record<string, unknown>): string {
  for (const [key, value] of Object.entries(fields)) {
    if (!/whathappened|description|details|narrative|summary/i.test(key)) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return typeof fields.Title === "string" ? fields.Title : "";
}

/**
 * Public tracking by reference. Reachable only two ways: the button on the
 * confirmation screen, or the sign-in screen's "Track a report I already filed".
 *
 * Only the stage is public — approver names are never returned.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const reference = String(req.query.reference ?? "").trim();
  if (!reference) return res.status(400).json({ error: "Missing reference" });

  const parsed = parseReference(reference);
  if (!parsed) return res.status(404).json({ error: NOT_FOUND });

  try {
    const token = await getGraphToken();
    const forms = await queryListItems(token, OSHES_LISTS.masterForm, { top: 200 });

    let listTitle = "";
    let layerCount = 1;
    let slaDays = 3;

    for (const form of forms) {
      const fields = form.fields as Record<string, unknown>;
      let layerConfig: { layers?: unknown[]; code?: string; slaDays?: number } | null = null;
      if (typeof fields.LayerConfig === "string" && fields.LayerConfig.trim()) {
        try {
          layerConfig = JSON.parse(fields.LayerConfig);
        } catch {
          layerConfig = null;
        }
      }

      const code = String(layerConfig?.code ?? fields.FormID ?? "").toUpperCase();
      if (code !== parsed.code) continue;

      listTitle = String(fields.Title ?? "");
      layerCount = layerConfig?.layers?.length ?? (Number(fields.NumberOfApprovalLayer) || 1);
      slaDays = Number(layerConfig?.slaDays) > 0 ? Number(layerConfig?.slaDays) : 3;
      break;
    }

    if (!listTitle) return res.status(404).json({ error: NOT_FOUND });

    // Response data lives either in a list named after the form or in
    // "<form> Responses", depending on when the form was provisioned.
    let item = null;
    for (const candidate of [listTitle, `${listTitle} Responses`]) {
      try {
        item = await queryListItemById(token, candidate, String(parsed.itemId));
      } catch {
        item = null;
      }
      if (item) break;
    }
    if (!item) return res.status(404).json({ error: NOT_FOUND });

    const fields = item.fields as Record<string, unknown>;
    const currentLayer = Number(fields.CurrentLayer ?? fields.CurrentApprovalLayer ?? 1) || 1;
    const formStatus = String(fields.FormStatus ?? "");
    const closed = /complete|approved|closed/i.test(formStatus);

    const steps = [
      {
        label: "Received",
        when: fields.SubmittedAt ? `Filed ${String(fields.SubmittedAt).slice(0, 10)}` : "Filed",
        done: true,
      },
    ];

    for (let layer = 1; layer <= layerCount; layer += 1) {
      const signed = Boolean(fields[`L${layer}_SignedAt`]);
      steps.push({
        label: layer === 1 ? "With the safety team" : `With approval layer ${layer}`,
        when: signed ? "Signed" : layer === currentLayer ? `In review now · ${slaDays}-day target` : "Not started",
        done: signed,
      });
    }

    steps.push({
      label: "Closed out",
      when: closed ? "Closed" : "You get an email if you left one",
      done: closed,
    });

    return res.status(200).json({
      reference: reference.toUpperCase(),
      subject: subjectOf(fields),
      severity: severityHint(fields),
      steps,
    });
  } catch (err) {
    logError("api:track", "Failed to look up a report by reference", err);
    return res.status(500).json({ error: "Could not look that up right now. Please try again." });
  }
}

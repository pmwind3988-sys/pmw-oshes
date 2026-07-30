import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, queryListItems } from "./_utils/graphClient.js";
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

interface PublicFormSummary {
  listTitle: string;
  slug: string;
  code: string;
  name: string;
  layerCount: number;
  /** "required" | "optional" | "none" — drives whether the outcome question is asked. */
  severityCapture: string;
}

/**
 * The QR picker's form list.
 *
 * Only published form types flagged public in their LayerConfig appear here, and
 * only the fields the poster flow needs — no approver names, no chain detail.
 * The picker reads this so a new public form type shows up without a code change.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = await getGraphToken();
    const items = await queryListItems(token, OSHES_LISTS.masterForm, { top: 200 });

    const forms: PublicFormSummary[] = [];

    for (const item of items) {
      const fields = item.fields as Record<string, unknown>;
      if (fields.IsPublished === false) continue;

      let layerConfig: {
        layers?: { layerNumber?: number }[];
        code?: string;
        isPublic?: boolean;
        severityCapture?: string;
      } | null = null;
      if (typeof fields.LayerConfig === "string" && fields.LayerConfig.trim()) {
        try {
          layerConfig = JSON.parse(fields.LayerConfig);
        } catch {
          layerConfig = null;
        }
      }

      const isPublic = layerConfig?.isPublic ?? fields.IsPublic === true;
      if (!isPublic) continue;

      const title = String(fields.Title ?? "");
      if (!title) continue;

      forms.push({
        listTitle: title,
        slug: String(fields.Slug ?? ""),
        code: String(layerConfig?.code ?? fields.FormID ?? "").toUpperCase(),
        name: title,
        layerCount: layerConfig?.layers?.length ?? (Number(fields.NumberOfApprovalLayer) || 1),
        severityCapture: layerConfig?.severityCapture ?? "none",
      });
    }

    forms.sort((a, b) => a.name.localeCompare(b.name));
    return res.status(200).json({ forms });
  } catch (err) {
    logError("api:public-forms", "Failed to list public form types", err);
    return res.status(500).json({ error: "Could not load the form list. Please try again." });
  }
}

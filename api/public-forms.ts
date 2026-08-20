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
}

/**
 * The QR picker's form list.
 *
 * Only published form types an anonymous visitor can actually open appear here,
 * and only the fields the poster flow needs — no approver names, no chain
 * detail. The picker reads this so a new public form type shows up without a
 * code change.
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
      } | null = null;
      if (typeof fields.LayerConfig === "string" && fields.LayerConfig.trim()) {
        try {
          layerConfig = JSON.parse(fields.LayerConfig);
        } catch {
          layerConfig = null;
        }
      }

      // Must match the gate the form page itself applies (`IsPublic !== false`),
      // or this picker hides forms whose links are in fact open — and the
      // poster it is printed on then points at a form nobody can find here.
      const isPublic = fields.IsPublic !== false && layerConfig?.isPublic !== false;
      if (!isPublic) continue;

      const title = String(fields.Title ?? "");
      if (!title) continue;

      const slug = String(fields.Slug ?? "");
      // Without a slug there is no form to open, and the picker's only job is
      // now to open one.
      if (!slug) continue;

      const declaredLayers = Number(fields.NumberOfApprovalLayer);
      forms.push({
        listTitle: title,
        slug,
        code: String(layerConfig?.code ?? fields.FormID ?? "").toUpperCase(),
        name: title,
        // Zero layers is a real answer. Defaulting it to 1 told every reporter
        // their record-keeping form was going to an approver.
        layerCount:
          layerConfig?.layers?.length
          ?? (Number.isFinite(declaredLayers) && declaredLayers > 0 ? Math.trunc(declaredLayers) : 0),
      });
    }

    forms.sort((a, b) => a.name.localeCompare(b.name));
    return res.status(200).json({ forms });
  } catch (err) {
    logError("api:public-forms", "Failed to list public form types", err);
    return res.status(500).json({ error: "Could not load the form list. Please try again." });
  }
}

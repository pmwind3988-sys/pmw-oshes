/**
 * POST /api/expand-group
 *
 * Expands the distribution list configured on one workflow layer into its
 * member addresses, so the signed-in submission path (which has no
 * client-credentials Graph token) can still resolve a `distribution-list`
 * assignee before writing the layer columns.
 *
 * The caller names a form + layer, never an arbitrary address: the server reads
 * the published `LayerConfig`, confirms that layer really is a distribution-list
 * assignee, and expands the address it finds there. That keeps this from
 * becoming a general group-membership lookup for anyone holding the client API
 * key, which ships in the browser bundle.
 */
import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, queryMasterFormBySlug } from "./_utils/graphClient.js";
import { expandDistributionList } from "./_utils/groupMembers.js";
import { logError } from "./_utils/logger.js";

interface ApiRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

interface ConfigLayer {
  layerNumber?: number;
  assignee?: { type?: string; value?: string };
}

interface ConfigShape {
  layers?: ConfigLayer[];
  manualBranches?: { name?: string; layers?: ConfigLayer[] }[];
}

function parseLayerConfig(raw: unknown): ConfigShape | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as ConfigShape
      : null;
  } catch {
    return null;
  }
}

function findLayer(config: ConfigShape, layerNumber: number, branch: string): ConfigLayer | null {
  const pool = branch
    ? config.manualBranches?.find((entry) => (entry.name || "").trim() === branch)?.layers ?? []
    : config.layers ?? [];
  return pool.find((layer) => Number(layer.layerNumber) === layerNumber) ?? null;
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = validateApiKey(req.headers);
  if (!auth.valid) {
    res.status(401).json({ error: auth.reason || "Unauthorized" });
    return;
  }

  const body = (req.body && typeof req.body === "object" && !Array.isArray(req.body))
    ? req.body as Record<string, unknown>
    : {};
  const slug = readString(body, "slug");
  const branch = readString(body, "branch");
  const layerNumber = Number(body.layerNumber);

  if (!slug || !Number.isInteger(layerNumber) || layerNumber < 1) {
    res.status(400).json({ error: "slug and a positive integer layerNumber are required." });
    return;
  }

  try {
    const token = await getGraphToken();
    const formItem = await queryMasterFormBySlug(token, slug);
    if (!formItem) {
      res.status(404).json({ error: "Form not found." });
      return;
    }

    const config = parseLayerConfig(formItem.fields.LayerConfig);
    const layer = config ? findLayer(config, layerNumber, branch) : null;
    if (!layer) {
      res.status(404).json({ error: "Layer not found on this form." });
      return;
    }
    if (layer.assignee?.type !== "distribution-list") {
      res.status(400).json({ error: "This layer is not assigned to a distribution list." });
      return;
    }

    const address = (layer.assignee.value || "").trim();
    if (!address) {
      res.status(400).json({ error: "This layer has no distribution list address configured." });
      return;
    }

    const members = await expandDistributionList(token, address);
    res.status(200).json({ address, members });
  } catch (error) {
    logError("expand-group", "Distribution list expansion failed", error);
    res.status(500).json({ error: "Could not expand the distribution list." });
  }
}

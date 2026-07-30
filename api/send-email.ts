import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken } from "./_utils/graphClient.js";
import { logError } from "./_utils/logger.js";
import {
  deliverWorkflowEmail,
  sendGraphEmail,
  type WorkflowEmailContext,
} from "./_utils/workflowEmail.js";

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

  const { to, subject, body, workflow } = req.body as Record<string, unknown>;

  const recipients = typeof to === "string"
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
    const message = { to: recipients, subject, body };
    if (
      workflow &&
      typeof workflow === "object" &&
      typeof (workflow as Record<string, unknown>).listTitle === "string" &&
      (typeof (workflow as Record<string, unknown>).responseItemId === "string" ||
        typeof (workflow as Record<string, unknown>).responseItemId === "number") &&
      typeof (workflow as Record<string, unknown>).layer === "number"
    ) {
      await deliverWorkflowEmail(token, message, workflow as unknown as WorkflowEmailContext);
    } else {
      await sendGraphEmail(token, message);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    logError("api:send-email", "Failed to send email", e);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

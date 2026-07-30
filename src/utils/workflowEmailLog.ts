export interface WorkflowEmailStatusEntry {
  status: "sent" | "failed";
  recipient: string;
  attempts: number;
  lastAttemptAt: string;
  sentAt?: string;
  error?: string;
}

export type WorkflowEmailStatus =
  | WorkflowEmailStatusEntry
  | { status: "not_sent" };

export function getWorkflowEmailStatus(
  raw: unknown,
  layerNumber: number,
): WorkflowEmailStatus {
  if (typeof raw !== "string" || !raw.trim()) return { status: "not_sent" };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entry = parsed[String(layerNumber)];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { status: "not_sent" };
    }
    const record = entry as Record<string, unknown>;
    if (record.status !== "sent" && record.status !== "failed") {
      return { status: "not_sent" };
    }
    return {
      status: record.status,
      recipient: typeof record.recipient === "string" ? record.recipient : "",
      attempts: typeof record.attempts === "number" ? record.attempts : 0,
      lastAttemptAt: typeof record.lastAttemptAt === "string" ? record.lastAttemptAt : "",
      ...(typeof record.sentAt === "string" ? { sentAt: record.sentAt } : {}),
      ...(typeof record.error === "string" ? { error: record.error } : {}),
    };
  } catch {
    return { status: "not_sent" };
  }
}

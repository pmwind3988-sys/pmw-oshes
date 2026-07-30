export interface WorkflowAssignmentSnapshot {
  email: string;
  displayName?: string;
  position?: string;
  workflowRole?: string;
  notes?: string;
  reason?: string;
  source: "resolved" | "manual-override";
  updatedBy: string;
  updatedAt: string;
}

export interface WorkflowAssignmentEntry extends WorkflowAssignmentSnapshot {
  layer: number;
  history: WorkflowAssignmentSnapshot[];
}

export interface WorkflowAssignmentData {
  version: 1;
  layers: Record<string, WorkflowAssignmentEntry>;
}

export interface WorkflowAssignmentOverrideInput {
  layer: number;
  email: string;
  displayName?: string;
  position?: string;
  workflowRole?: string;
  notes?: string;
  reason?: string;
  updatedBy: string;
  updatedAt: string;
  previous?: WorkflowAssignmentSnapshot;
}

const EMPTY_ASSIGNMENT_DATA: WorkflowAssignmentData = {
  version: 1,
  layers: {},
};

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseSnapshot(value: unknown): WorkflowAssignmentSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const email = optionalText(record.email);
  const updatedBy = optionalText(record.updatedBy);
  const updatedAt = optionalText(record.updatedAt);
  if (!email || !updatedBy || !updatedAt) return null;
  return {
    email,
    ...(optionalText(record.displayName) ? { displayName: optionalText(record.displayName) } : {}),
    ...(optionalText(record.position) ? { position: optionalText(record.position) } : {}),
    ...(optionalText(record.workflowRole) ? { workflowRole: optionalText(record.workflowRole) } : {}),
    ...(optionalText(record.notes) ? { notes: optionalText(record.notes) } : {}),
    ...(optionalText(record.reason) ? { reason: optionalText(record.reason) } : {}),
    source: record.source === "resolved" ? "resolved" : "manual-override",
    updatedBy,
    updatedAt,
  };
}

export function parseWorkflowAssignmentData(raw: unknown): WorkflowAssignmentData {
  let value = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return { ...EMPTY_ASSIGNMENT_DATA, layers: {} };
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return { ...EMPTY_ASSIGNMENT_DATA, layers: {} };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_ASSIGNMENT_DATA, layers: {} };
  }

  const rawLayers = (value as Record<string, unknown>).layers;
  if (!rawLayers || typeof rawLayers !== "object" || Array.isArray(rawLayers)) {
    return { ...EMPTY_ASSIGNMENT_DATA, layers: {} };
  }

  const layers: Record<string, WorkflowAssignmentEntry> = {};
  for (const [key, rawEntry] of Object.entries(rawLayers)) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    const entryRecord = rawEntry as Record<string, unknown>;
    const snapshot = parseSnapshot(entryRecord);
    const layer = Number(entryRecord.layer ?? key);
    if (!snapshot || !Number.isInteger(layer) || layer < 1) continue;
    const history = Array.isArray(entryRecord.history)
      ? entryRecord.history
        .map(parseSnapshot)
        .filter((entry): entry is WorkflowAssignmentSnapshot => entry !== null)
      : [];
    layers[String(layer)] = { layer, ...snapshot, history };
  }
  return { version: 1, layers };
}

export function getWorkflowAssignment(
  raw: unknown,
  layer: number,
): WorkflowAssignmentEntry | null {
  return parseWorkflowAssignmentData(raw).layers[String(layer)] ?? null;
}

export function setWorkflowAssignmentOverride(
  raw: unknown,
  input: WorkflowAssignmentOverrideInput,
): WorkflowAssignmentData {
  const data = parseWorkflowAssignmentData(raw);
  const key = String(input.layer);
  const previous = data.layers[key];
  const previousSnapshot = previous
    ? {
      email: previous.email,
      ...(previous.displayName ? { displayName: previous.displayName } : {}),
      ...(previous.position ? { position: previous.position } : {}),
      ...(previous.workflowRole ? { workflowRole: previous.workflowRole } : {}),
      ...(previous.notes ? { notes: previous.notes } : {}),
      ...(previous.reason ? { reason: previous.reason } : {}),
      source: previous.source,
      updatedBy: previous.updatedBy,
      updatedAt: previous.updatedAt,
    } satisfies WorkflowAssignmentSnapshot
    : null;
  const history = previousSnapshot
    ? [...previous.history, previousSnapshot].slice(-20)
    : input.previous
      ? [input.previous]
      : [];

  data.layers[key] = {
    layer: input.layer,
    email: input.email.trim(),
    ...(optionalText(input.displayName) ? { displayName: optionalText(input.displayName) } : {}),
    ...(optionalText(input.position) ? { position: optionalText(input.position) } : {}),
    ...(optionalText(input.workflowRole) ? { workflowRole: optionalText(input.workflowRole) } : {}),
    ...(optionalText(input.notes) ? { notes: optionalText(input.notes) } : {}),
    ...(optionalText(input.reason) ? { reason: optionalText(input.reason) } : {}),
    source: "manual-override",
    updatedBy: input.updatedBy.trim(),
    updatedAt: input.updatedAt,
    history,
  };
  return data;
}

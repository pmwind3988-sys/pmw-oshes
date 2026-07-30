import type { LayerConfigItem } from "../types";

/** email (lowercased) → display name, built from the SharePoint site user list. */
export type PeopleDirectory = Record<string, string>;

export function normalizeEmail(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = String(value).trim().toLowerCase();
  const loginName = trimmed.includes("|") ? trimmed.split("|").pop() ?? trimmed : trimmed;
  return loginName.replace(/^mailto:/, "");
}

/** "nurul.aziz@pmw.gov.my" → "Nurul Aziz". Only used when the directory has no better answer. */
export function nameFromEmail(email: string): string {
  const local = normalizeEmail(email).split("@")[0];
  if (!local) return "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function displayName(email: string, directory: PeopleDirectory = {}): string {
  const key = normalizeEmail(email);
  if (!key) return "";
  return directory[key] || nameFromEmail(key);
}

/** First name only — the drawer's "Awaiting Nurul". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * The approval role a layer points at. A layer points at a role, not a person —
 * that is what makes reassignment safe — so prefer the configured role label,
 * then the department-approver role, then the layer title.
 */
export function layerRoleLabel(layer: LayerConfigItem | undefined, fallbackIndex = 0): string {
  if (!layer) return `Layer ${fallbackIndex + 1}`;
  if (layer.roleLabel?.trim()) return layer.roleLabel.trim();
  if (layer.assignee.type === "department-approver" && layer.assignee.roleValue?.trim()) {
    return layer.assignee.roleValue.trim();
  }
  if (layer.title?.trim()) return layer.title.trim();
  if (layer.type === "evaluation") return "Evaluator";
  return `Approver ${layer.layerNumber}`;
}

/** The email a layer is assigned to, when the config names one directly. */
export function layerAssigneeEmail(layer: LayerConfigItem | undefined): string {
  if (!layer) return "";
  if (layer.assignee.type === "user") return normalizeEmail(layer.assignee.value);
  return "";
}

import type { PortalFormDraft } from "../types";

const DRAFT_PREFIX = "pmw-oshes-draft-v2";

export const EMPTY_DRAFT: PortalFormDraft = {
  location: "",
  severity: "",
  description: "",
  name: "",
  email: "",
  photos: 0,
};

/** Drafts are namespaced per form so two half-finished reports cannot collide. */
export function draftKey(formId: string): string {
  return `${DRAFT_PREFIX}:${formId || "default"}`;
}

export interface StoredDraft {
  draft: PortalFormDraft;
  savedAt: number;
}

export function readDraft(formId: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(formId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { draft?: Partial<PortalFormDraft>; savedAt?: number };
    if (!parsed?.draft) return null;
    return {
      draft: { ...EMPTY_DRAFT, ...parsed.draft },
      savedAt: Number(parsed.savedAt) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Written on every keystroke — a dropped signal at the jetty must not lose the
 * entry. Cleared only on a successful submit.
 */
export function writeDraft(formId: string, draft: PortalFormDraft): number {
  const savedAt = Date.now();
  try {
    localStorage.setItem(draftKey(formId), JSON.stringify({ draft, savedAt }));
  } catch {
    // Private browsing or a full quota — the form still works, it just will not survive a reload.
  }
  return savedAt;
}

export function clearDraft(formId: string): void {
  try {
    localStorage.removeItem(draftKey(formId));
  } catch {
    // Nothing to recover from.
  }
}

/** "Saves as you type" → "Draft saved 12s ago" → "Draft saved 3 min ago" */
export function draftLabel(savedAt: number, now: number = Date.now()): string {
  if (!savedAt) return "Saves as you type";
  const seconds = Math.max(1, Math.round((now - savedAt) / 1000));
  if (seconds < 60) return `Draft saved ${seconds}s ago`;
  return `Draft saved ${Math.round(seconds / 60)} min ago`;
}

/** "Still needed: where it happened, the outcome." — blank when the form is complete. */
export function missingFields(draft: PortalFormDraft, askSeverity: boolean): string[] {
  const missing: string[] = [];
  if (!draft.location.trim()) missing.push("where it happened");
  if (askSeverity && !draft.severity) missing.push("the outcome");
  if (!draft.description.trim()) missing.push("what happened");
  return missing;
}

export function missingLabel(missing: string[]): string {
  if (missing.length === 0) return "";
  return `Still needed: ${missing.join(", ")}.`;
}

/** The four outcome choices, in order, with their supporting hints. */
export const SEVERITY_OPTIONS = [
  { key: "No one was hurt", label: "No one was hurt", hint: "Near-miss or hazard only" },
  { key: "Minor", label: "First aid was enough", hint: "Back to work the same day" },
  { key: "Serious", label: "Needed medical treatment", hint: "Clinic, hospital, or time off" },
  { key: "Major · LTI", label: "Serious injury or worse", hint: "Lost time, amputation, fatality" },
] as const;

/** Serious or worse pages the duty officer on receipt, so the form warns first. */
export function severityWarns(severity: string): boolean {
  return severity === "Serious" || severity === "Major · LTI";
}

import type { PortalChainStep, PortalRecord } from "../types";

/**
 * Presentation helpers for the record page. Pure: no React, no I/O.
 */

/** Acronyms that stay upper-case when a label is sentence-cased. */
const KEEP_UPPER = new Set(["PTW", "OSHES", "PMW", "PPE", "IC", "ID", "SLA", "HSE", "QR", "MSDS", "LOTO"]);

const EMAIL = /^\S+@\S+\.\S+$/;

/**
 * A label typed in capitals reads as shouting, so when it has no lower-case
 * letters at all it is brought to sentence case ("WORK PERFORMER ACKNOWLEDGEMENT"
 * becomes "Work performer acknowledgement"). Known acronyms keep their capitals.
 * Mixed-case text is left exactly as it was written.
 */
export function displayLabel(text: string): string {
  const letters = text.match(/[A-Za-z]/g) ?? [];
  if (letters.length < 2 || /[a-z]/.test(text)) return text;

  const lower = text.toLowerCase().replace(/[A-Za-z]+/g, (word) => {
    const upper = word.toUpperCase();
    return KEEP_UPPER.has(upper) ? upper : word;
  });
  return lower.replace(/[A-Za-z]/, (first) => first.toUpperCase());
}

/**
 * Whether the record's subject says anything about the work.
 *
 * A subject that is blank, "Untitled", an email address, or simply repeats who
 * filed it, the form or the reference adds nothing to the header, so the page
 * leaves it out rather than repeat itself.
 */
export function isMeaningfulSubject(record: Pick<PortalRecord, "subject" | "submitter" | "submitterEmail" | "formName" | "reference">): boolean {
  const subject = record.subject.trim();
  if (subject === "" || subject.toLowerCase() === "untitled" || EMAIL.test(subject)) return false;

  const lowered = subject.toLowerCase();
  const repeats = [record.submitter, record.submitterEmail, record.formName, record.reference].some(
    (other) => other.trim().toLowerCase() === lowered,
  );
  return !repeats;
}

/**
 * One line under a sign-off step: who holds it, what state it is in, and any
 * timing. The person is dropped when the step's role already names them, so the
 * caption does not repeat the role.
 */
export function stepCaption(step: Pick<PortalChainStep, "who" | "roleLabel" | "statusText" | "subText">): string {
  const who = step.who.trim();
  const roleRepeated = who.toLowerCase() === step.roleLabel.trim().toLowerCase();
  const head = [who === "" || roleRepeated ? "" : who, step.statusText.trim()].filter((part) => part !== "").join(" · ");

  const sub = step.subText.trim();
  if (sub === "" || head.toLowerCase().includes(sub.toLowerCase())) return head;
  return head === "" ? sub : `${head} · ${sub}`;
}

/** The form's name as the record page shows it. */
export function formDisplayName(record: Pick<PortalRecord, "formName">): string {
  return displayLabel(record.formName);
}

/** One entry in the record page's ⋯ menu. */
export interface RecordMenuItem {
  id: "reassign" | "cancel" | "delete";
  label: string;
  /** Destructive actions are drawn in the error colour. */
  danger?: boolean;
}

/**
 * The ⋯ menu's entries, in order. The gates are decided by the caller; this only
 * lays out what they allow. An empty list means the menu trigger is not drawn.
 */
export function recordMenuItems(gates: {
  canReassign: boolean;
  canCancel: boolean;
  canDelete: boolean;
  cancelLabel: string;
}): RecordMenuItem[] {
  const items: RecordMenuItem[] = [];
  if (gates.canReassign) items.push({ id: "reassign", label: "Change who signs" });
  if (gates.canCancel) items.push({ id: "cancel", label: gates.cancelLabel });
  if (gates.canDelete) items.push({ id: "delete", label: "Delete", danger: true });
  return items;
}

/**
 * Who a returned form is waiting on: the filer, who has to fix it and send it
 * again. "You" when this account is the filer.
 */
export function waitingOnForReturned(
  record: Pick<PortalRecord, "submitter" | "submitterEmail">,
  email: string,
): string {
  const isFiler = record.submitterEmail.trim().toLowerCase() === email.trim().toLowerCase();
  return `${isFiler ? "You" : record.submitter} (to fix and resend)`;
}

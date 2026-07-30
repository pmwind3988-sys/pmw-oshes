import type { AuditEntry, PortalRecord } from "../types";

/** Byte-order mark, so Excel opens the file as UTF-8 rather than guessing. */
const BOM = "\uFEFF";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function download(csv: string, fileName: string): void {
  // Leading BOM so Excel opens the file as UTF-8.
  const blob = new Blob([BOM, csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function datedName(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}

/**
 * The export contract: the rows you are looking at, the columns you can see,
 * plus the approval history. Callers pass the already-filtered rows so what
 * lands in the file matches what is on screen.
 */
export function exportRecordsCsv(records: PortalRecord[]): number {
  const columns = [
    "Reference",
    "Form",
    "Subject",
    "Source",
    "Stage",
    "Status",
    "Filed",
    "Location",
    "Severity",
    "Reported by",
    "Age on layer",
    "SLA (days)",
    "Approval history",
  ];

  const lines = [columns.map(csvCell).join(",")];

  for (const record of records) {
    const history = record.chain
      .map((step, index) => `${index + 1}. ${step.roleLabel} — ${step.who} — ${step.statusText}${step.note ? ` (${step.note})` : ""}`)
      .join(" | ");

    lines.push(
      [
        record.reference,
        record.formName,
        record.subject,
        record.source,
        record.stage,
        record.status,
        record.filedAt ? record.filedAt.toISOString() : "",
        record.location,
        record.severity,
        record.submitter,
        record.ageOnLayerLabel,
        record.slaDays,
        history,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  download(lines.join("\r\n"), datedName("pmw-oshes-records"));
  return records.length;
}

export function exportAuditCsv(entries: AuditEntry[]): number {
  const lines = [["When", "Reference", "Who", "Event"].map(csvCell).join(",")];
  for (const entry of entries) {
    lines.push([entry.at, entry.reference, entry.who, entry.event].map(csvCell).join(","));
  }
  download(lines.join("\r\n"), datedName("pmw-oshes-audit-trail"));
  return entries.length;
}

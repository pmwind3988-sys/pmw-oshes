import type { PortalFormDraft, SurveyJson } from "../types";
import { PDPA_NOTICE_VERSION, getPdpaRetentionUntil } from "./pdpa";

const API_KEY = import.meta.env.VITE_API_SECRET_KEY as string | undefined;

/**
 * The five answers the quick-file and QR flows collect, mapped onto whatever
 * the published form actually calls those fields. Nothing here hard-codes a
 * column name — the form schema is the source of truth.
 */
export interface QuickFieldNames {
  location: string;
  severity: string;
  description: string;
  name: string;
  email: string;
}

const FIELD_HINTS: Record<keyof QuickFieldNames, string[]> = {
  location: ["location", "wherehappened", "where", "site", "area", "berth", "jetty", "place"],
  severity: ["severity", "outcome", "howbad", "consequence", "injury", "risklevel"],
  description: ["whathappened", "description", "details", "narrative", "summary", "incident"],
  name: ["yourname", "reportername", "submittername", "fullname", "name"],
  email: ["email", "contactemail"],
};

function normalize(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function walkElements(elements: Record<string, unknown>[], visit: (element: Record<string, unknown>) => void): void {
  for (const element of elements) {
    visit(element);
    const nested = element.elements;
    if (Array.isArray(nested)) walkElements(nested as Record<string, unknown>[], visit);
  }
}

export function resolveQuickFieldNames(surveyJson: SurveyJson | null | undefined): QuickFieldNames {
  const resolved: QuickFieldNames = { location: "", severity: "", description: "", name: "", email: "" };
  if (!surveyJson?.pages) return resolved;

  for (const page of surveyJson.pages) {
    walkElements(page.elements ?? [], (element) => {
      const fieldName = typeof element.name === "string" ? element.name : "";
      if (!fieldName) return;
      const haystack = normalize(`${fieldName} ${typeof element.title === "string" ? element.title : ""}`);

      for (const key of Object.keys(FIELD_HINTS) as (keyof QuickFieldNames)[]) {
        if (resolved[key]) continue;
        if (FIELD_HINTS[key].some((hint) => haystack.includes(hint))) resolved[key] = fieldName;
      }
    });
  }

  return resolved;
}

export interface QuickSubmitInput {
  listTitle: string;
  surveyJson: SurveyJson | null | undefined;
  draft: PortalFormDraft;
  /** Signed-in submitter, when there is one. The public flow leaves these blank. */
  submitterName?: string;
  submitterEmail?: string;
}

export interface QuickSubmitResult {
  /** SharePoint item id — the portal turns this into the human reference. */
  id: string;
}

/**
 * Files a quick report through the existing submit endpoint, so layer
 * resolution, approver notification and PDPA handling stay in one place.
 *
 * Anonymous reports still carry the consent flag with the current notice
 * version; whether a report with no name and no email needs different PDPA
 * treatment is an open question with the team.
 */
export async function submitQuickReport(input: QuickSubmitInput): Promise<QuickSubmitResult> {
  const fields = resolveQuickFieldNames(input.surveyJson);
  const now = new Date();
  const body: Record<string, unknown> = {};

  if (fields.location) body[fields.location] = input.draft.location.trim();
  if (fields.severity && input.draft.severity) body[fields.severity] = input.draft.severity;
  if (fields.description) body[fields.description] = input.draft.description.trim();

  const reporterName = input.submitterName ?? input.draft.name.trim();
  const reporterEmail = input.submitterEmail ?? input.draft.email.trim();
  if (fields.name && reporterName) body[fields.name] = reporterName;
  if (fields.email && reporterEmail) body[fields.email] = reporterEmail;

  body.Title = input.draft.description.trim().slice(0, 70) || input.listTitle;
  if (reporterEmail) body.SubmittedBy = reporterEmail;
  body.SubmittedAt = now.toISOString();

  const response = await fetch("/api/submit-form", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    },
    body: JSON.stringify({
      listTitle: input.listTitle,
      body,
      pdpaConsent: true,
      pdpaNoticeVersion: PDPA_NOTICE_VERSION,
      pdpaConsentedAt: now.toISOString(),
      retentionUntil: getPdpaRetentionUntil(now),
    }),
  });

  const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!response.ok) throw new Error(data.error || `Could not file the report (${response.status}).`);

  return { id: String(data.id ?? "") };
}

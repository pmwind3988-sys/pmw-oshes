export const PDPA_NOTICE_VERSION =
  import.meta.env.VITE_PDPA_NOTICE_VERSION || "PDPA-MY-OSHES-2026-06-25";

export const PDPA_DEFAULT_RETENTION_YEARS = Number(
  import.meta.env.VITE_PDPA_RETENTION_YEARS || "7",
);

export const PDPA_CONTROLLER_NAME = "PMW International Berhad";

export const PDPA_CONTACT_EMAIL =
  import.meta.env.VITE_PDPA_CONTACT_EMAIL ||
  import.meta.env.VITE_EMAIL_FROM_ADDRESS ||
  "pdpa@pmw-group.com";

export const PDPA_SUMMARY =
  "Your personal data will be processed for OSHE reporting, inspections, permits, approvals, evaluations, record keeping, audit, incident management, and related legal or operational requirements.";

export const PDPA_RETENTION_SUMMARY =
  "We keep personal data only for as long as needed for the stated purpose, legal requirements, investigations, audit, dispute handling, or legitimate OSHE administration, then delete, anonymise, or securely archive it.";

export function getPdpaRetentionUntil(from: Date = new Date()): string {
  const retentionUntil = new Date(from);
  retentionUntil.setFullYear(retentionUntil.getFullYear() + PDPA_DEFAULT_RETENTION_YEARS);
  return retentionUntil.toISOString();
}

export const PDPA_CONSENT_LABEL =
  "I have read and understood the Privacy Notice, and I consent to the processing of my personal data for the stated OSHE purpose.";

export const PDPA_NOTICE_SECTIONS = [
  {
    title: "Personal Data We Collect",
    body: "We may collect identifiers, contact details, workplace details, form answers, approvals, evaluations, signatures, incident evidence, uploaded files, submission metadata, and related SharePoint or Microsoft 365 account information.",
  },
  {
    title: "Purpose",
    body: PDPA_SUMMARY,
  },
  {
    title: "Disclosure",
    body: "Personal data may be disclosed to authorised OSHE personnel, assigned approvers or evaluators, system administrators, Microsoft 365 or SharePoint service providers, auditors, regulators, and other parties where required by law or necessary for the stated purpose.",
  },
  {
    title: "Security",
    body: "Access is restricted by authentication, role-based permissions, API authentication, and SharePoint/Microsoft 365 controls. Do not upload unnecessary sensitive data unless the form specifically asks for it.",
  },
  {
    title: "Retention",
    body: PDPA_RETENTION_SUMMARY,
  },
  {
    title: "Access And Correction",
    body: `You may request access to or correction of your personal data by contacting ${PDPA_CONTACT_EMAIL}. We may need to verify your identity before acting on a request.`,
  },
] as const;

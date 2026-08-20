import {
  ensureDocLibrary,
  ensureListColumns,
  ensureListSchema,
  type GraphColumnSpec,
} from "./graphClient.js";

export interface GraphListSchema {
  displayName: string;
  columns?: GraphColumnSpec[];
  template?: "genericList" | "documentLibrary";
}

export const PDPA_COLUMNS: GraphColumnSpec[] = [
  { name: "PDPAConsent", displayName: "PDPA Consent", type: "text" },
  { name: "PDPANoticeVersion", displayName: "PDPA Notice Version", type: "text" },
  { name: "PDPAConsentAt", displayName: "PDPA Consent At", type: "dateTime" },
  { name: "RetentionUntil", displayName: "Retention Until", type: "dateTime" },
];

export const ADMIN_PANEL_SETTINGS_COLUMNS: GraphColumnSpec[] = [
  { name: "BackgroundId", displayName: "BackgroundId", type: "text" },
  { name: "CustomImageUrl", displayName: "CustomImageUrl", type: "note" },
  { name: "CustomImageSource", displayName: "CustomImageSource", type: "note" },
  { name: "ImageOpacity", displayName: "ImageOpacity", type: "number" },
  // The three appearance axes. Added after the background columns, so a site
  // provisioned before them has the rest of the record and simply reads these
  // as empty — which the API turns into the default theme rather than an error.
  { name: "ColorTheme", displayName: "ColorTheme", type: "text" },
  { name: "ContrastTheme", displayName: "ContrastTheme", type: "text" },
  { name: "FontTheme", displayName: "FontTheme", type: "text" },
  { name: "UpdatedBy", displayName: "UpdatedBy", type: "text" },
  { name: "UpdatedAt", displayName: "UpdatedAt", type: "dateTime" },
];

function workflowColumns(layerCount: number): GraphColumnSpec[] {
  const count = Math.max(layerCount, 1);
  const columns: GraphColumnSpec[] = [
    { name: "SelectedBranch", displayName: "SelectedBranch", type: "text" },
    { name: "PublishKey", displayName: "PublishKey", type: "text" },
    { name: "EvaluationData", displayName: "EvaluationData", type: "note" },
    { name: "WorkflowAssignmentData", displayName: "WorkflowAssignmentData", type: "note" },
    { name: "WorkflowEmailLog", displayName: "WorkflowEmailLog", type: "note" },
    { name: "WorkflowEmailSchedule", displayName: "WorkflowEmailSchedule", type: "note" },
    { name: "CurrentLayer", displayName: "CurrentLayer", type: "number" },
    { name: "FormStatus", displayName: "FormStatus", type: "text" },
  ];
  for (let n = 1; n <= count; n++) {
    columns.push(
      { name: `L${n}_Status`, displayName: `L${n}_Status`, type: "text" },
      { name: `L${n}_Email`, displayName: `L${n}_Email`, type: "text" },
      // Every address allowed to act on the layer, "; " joined. A note column
      // because an expanded distribution list easily exceeds the 255-char text
      // limit. L{n}_Email stays the primary and keeps legacy readers working.
      { name: `L${n}_Emails`, displayName: `L${n}_Emails`, type: "note" },
      // Where the layer notification was actually delivered — includes shared
      // mailboxes that receive the notice but cannot act.
      { name: `L${n}_NotifyEmails`, displayName: `L${n}_NotifyEmails`, type: "note" },
      // Which of the allowed addresses completed the layer.
      { name: `L${n}_ActedBy`, displayName: `L${n}_ActedBy`, type: "text" },
      { name: `L${n}_SignedAt`, displayName: `L${n}_SignedAt`, type: "dateTime" },
      { name: `L${n}_Rejection`, displayName: `L${n}_Rejection`, type: "note" },
      { name: `L${n}_Signature`, displayName: `L${n}_Signature`, type: "note" },
    );
  }
  return columns;
}

export function makeGraphListSchema(
  displayName: string,
  columns: GraphColumnSpec[] = [],
  template: "genericList" | "documentLibrary" = "genericList",
): GraphListSchema {
  return { displayName, columns, template };
}

export async function ensureGraphListSchema(token: string, schema: GraphListSchema): Promise<void> {
  await ensureListSchema(token, schema.displayName, schema.columns ?? [], schema.template ?? "genericList");
}

/**
 * Reference numbers are provisioned by this deployment rather than by a form
 * builder: OSHES forms are authored from the HR builder on a different origin,
 * so a form can be switched to reference numbering without anyone republishing
 * it here. Ensuring the column at submit time is what closes that gap.
 */
export const REFERENCE_COLUMNS: GraphColumnSpec[] = [
  { name: "ReferenceNo", displayName: "ReferenceNo", type: "text" },
];

export async function ensureReferenceColumns(token: string, listDisplayName: string): Promise<void> {
  await ensureListColumns(token, listDisplayName, REFERENCE_COLUMNS);
}

export async function ensurePdpaColumns(token: string, listDisplayName: string): Promise<void> {
  await ensureListColumns(token, listDisplayName, PDPA_COLUMNS);
}

export async function ensureWorkflowColumns(token: string, listDisplayName: string, layerCount: number): Promise<void> {
  await ensureListColumns(token, listDisplayName, workflowColumns(layerCount));
}

export async function ensureAdminPanelSettingsList(token: string, listDisplayName: string): Promise<void> {
  await ensureGraphListSchema(token, makeGraphListSchema(listDisplayName, ADMIN_PANEL_SETTINGS_COLUMNS));
}

export async function ensureUploadLibrary(token: string, libraryName: string): Promise<void> {
  await ensureDocLibrary(token, libraryName);
}

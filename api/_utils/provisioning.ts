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
  { name: "UpdatedBy", displayName: "UpdatedBy", type: "text" },
  { name: "UpdatedAt", displayName: "UpdatedAt", type: "dateTime" },
];

function workflowColumns(layerCount: number): GraphColumnSpec[] {
  const count = Math.max(layerCount, 1);
  const columns: GraphColumnSpec[] = [
    { name: "SelectedBranch", displayName: "SelectedBranch", type: "text" },
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

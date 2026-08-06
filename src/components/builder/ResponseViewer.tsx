/**
 * ResponseViewer.tsx — Admin view for all form submissions
 * Route: /admin/responses/:formTitle
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import { FlatLightPanelless } from "survey-core/themes";
import "survey-core/survey-core.min.css";

import DOMPurify from "dompurify";
import { Alert, Box, Button, Link, MenuItem, Stack, TextField, Typography } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import BlockIcon from "@mui/icons-material/Block";
import DownloadIcon from "@mui/icons-material/Download";
import { spGet, getFormConfigByTitle, readMatrixChildItems } from "../../utils/formBuilderSP";
import type { MatrixColumnDef } from "../../utils/formBuilderSP";
import { createSpClient } from "../../utils/sharepointClient";
import { acquireAccessTokenSilentOrRedirect } from "../../utils/authRecovery";
import { SP_STATIC } from "../../utils/spConfig";
import { rowsToHtml, getDynamicMatrixFields } from "../../utils/DynamicMatrix";
import { getSelectedCompany } from "../../utils/companySelection";
import { formatDisplayDateTimeLong } from "../../utils/displayDateTime";
import { editorial, editorialHairline } from "../../theme/editorial";
import {
  WorkspaceHeader,
  WorkspaceNotice,
  WorkspacePage,
  WorkspacePanelHeader,
  WorkspaceTag,
} from "./WorkspaceLayout";
import { workspacePanelSx, workspaceSurfaceSx } from "./workspaceStyles";
import type { WorkspaceTone } from "./WorkspaceLayout";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

interface MatrixTableEntry {
  columns: MatrixColumnDef[];
  rows: Record<string, unknown>[];
  html: string;
}

interface SubmissionItem {
  Id: number;
  Title: string;
  SubmittedBy: string;
  SubmittedAt: string;
  Status: string;
  CurrentApprovalLayer: number;
  CurrentLayer?: number;
  FormStatus?: string;
  FormVersion: string;
  RawJSON: string;
  PdfUrl?: string;
}

interface FormConfig {
  Title: string;
  NumberOfApprovalLayer?: number;
}

const SYSTEM_FIELDS = new Set([
  "Id", "Title", "SubmittedBy", "SubmittedAt", "Status", "CurrentApprovalLayer",
  "FormVersion", "PublishKey", "FormID", "RawJSON", "CurrentLayer", "FormStatus", "EvaluationData", "WorkflowAssignmentData", "WorkflowEmailLog", "WorkflowEmailSchedule",
  "PDPAConsent", "PDPANoticeVersion", "PDPAConsentAt", "RetentionUntil",
  "Author", "Editor", "Created", "Modified", "ContentType", "PermMask", "PdfUrl",
  "L1_Status", "L1_Email", "L1_SignedAt", "L1_Rejection", "L1_Signature",
  "L2_Status", "L2_Email", "L2_SignedAt", "L2_Rejection", "L2_Signature",
  "L3_Status", "L3_Email", "L3_SignedAt", "L3_Rejection", "L3_Signature",
  "SelectedBranch",
]);

function extractResponseFields(item: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (!SYSTEM_FIELDS.has(key) && value !== null && value !== undefined) {
      data[key] = value;
    }
  }
  return data;
}

export default function ResponseViewer() {
  const { formTitle } = useParams<{ formTitle: string }>();
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [, setFormConfig] = useState<FormConfig | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionItem | null>(null);
  const [selectedResponseData, setSelectedResponseData] = useState<Record<string, unknown> | null>(null);
  const [surveyJson, setSurveyJson] = useState<unknown>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [matrixTables, setMatrixTables] = useState<Record<string, MatrixTableEntry>>({});
  const [matrixLoading, setMatrixLoading] = useState(false);

  // Admin access check (defense-in-depth)
  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) return;

    createSpClient(instance, accounts)
      .isGroupMember(SP_STATIC.adminGroup)
      .then((admin) => {
        setIsAdmin(admin);
        setAdminChecked(true);
      })
      .catch(() => {
        setIsAdmin(false);
        setAdminChecked(true);
      });
  }, [isAuthenticated, inProgress, instance, accounts]);

  // Get token
  useEffect(() => {
    if (!adminChecked || !isAdmin) return;
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) return;

    const origin = new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
    acquireAccessTokenSilentOrRedirect(instance, { scopes: [`${origin}/AllSites.Manage`], account: accounts[0] })
      .then(setToken)
      .catch(() => setError("Failed to acquire token"));
  }, [adminChecked, isAdmin, isAuthenticated, inProgress, instance, accounts]);

  // Load submissions
  useEffect(() => {
    if (!adminChecked || !isAdmin) return;
    if (!token || !formTitle) return;

    const loadData = async () => {
      try {
        // Get form config
        const cfg = await getFormConfigByTitle(token, formTitle);
        setFormConfig(cfg);

        // Get submissions from response list (named after form title, no " Responses" suffix)
        const listName = formTitle;
        const items = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,Title,SubmittedBy,SubmittedAt,Status,CurrentApprovalLayer,CurrentLayer,FormStatus,FormVersion,RawJSON,PdfUrl&$orderby=SubmittedAt desc&$top=100`
        ) as { value?: SubmissionItem[] };

        setSubmissions(items.value || []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [adminChecked, isAdmin, token, formTitle]);

  // Load survey JSON for selected submission
  const loadSubmissionDetails = async (item: SubmissionItem) => {
    if (!token) return;

    setSelectedSubmission(item);
    setSelectedResponseData(null);
    setSurveyJson(null);
    setMatrixTables({});

    try {
      const fullItem = await spGet(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(formTitle || "")}')/items(${item.Id})`
      ) as Record<string, unknown>;
      setSelectedResponseData(extractResponseFields(fullItem));

      const versionData = await spGet(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(formTitle || "")}' and FormVersion eq '${encodeURIComponent(item.FormVersion)}'&$select=SurveyJSON&$top=1`
      ) as { value?: { SurveyJSON?: string }[] };

      if (versionData.value?.[0]?.SurveyJSON) {
        const parsed = JSON.parse(versionData.value[0].SurveyJSON);
        setSurveyJson(parsed);

        // Detect dynamicmatrix fields and load child list data
        const surveyDef = parsed.surveyJson || parsed;
        const dynamicMatrixFields = getDynamicMatrixFields(surveyDef);

        if (dynamicMatrixFields.length > 0 && formTitle) {
          setMatrixLoading(true);
          const tables: Record<string, MatrixTableEntry> = {};

          for (const mf of dynamicMatrixFields) {
            const safeName = mf.name.replace(/[^a-zA-Z0-9_ -]/g, "").trim();
            const childListName = `${formTitle} Matrix ${safeName}`;

            try {
              const rows = await readMatrixChildItems(token, childListName, item.Id);
              if (rows.length > 0) {
                tables[mf.name] = {
                  columns: mf.columns as MatrixColumnDef[],
                  rows,
                  html: rowsToHtml(mf.columns, rows),
                };
              }
            } catch {
              // Child list not found or read failed — try _Html fallback from the response item
              try {
                const itemData = await spGet(
                  token,
                  `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(formTitle)}')/items(${item.Id})?$select=${mf.name}_Html`
                ) as Record<string, unknown>;
                const htmlVal = itemData[`${mf.name}_Html`] as string | undefined;
                if (htmlVal) {
                  tables[mf.name] = {
                    columns: mf.columns as MatrixColumnDef[],
                    rows: [],
                    html: htmlVal,
                  };
                }
              } catch {
                // Both child list and _Html fallback failed — skip this matrix
              }
            }
          }

          setMatrixTables(tables);
          setMatrixLoading(false);
        }
      }
    } catch (e) {
      console.error("[ResponseViewer] load details error:", e);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ["ID", "Submitted By", "Submitted At", "Status", "Form Status", "Current Layer", "Version"];
    const rows = filteredSubmissions.map((s) => [
      s.Id,
      s.SubmittedBy,
      s.SubmittedAt,
      s.Status,
      s.FormStatus || "",
      s.CurrentLayer ?? s.CurrentApprovalLayer,
      s.FormVersion,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formTitle}-submissions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter submissions
  const filteredSubmissions =
    statusFilter === "all"
      ? submissions
      : submissions.filter((s) => s.Status.toLowerCase().includes(statusFilter.toLowerCase()));

  const modelRef = useRef<Model | null>(null);
  // Dispose model on unmount
  useEffect(() => {
    return () => modelRef.current?.dispose();
  }, []);

  // Render preview survey with data
  const previewSurvey = useMemo(() => {
    if (!surveyJson) return null;
    try {
      const m = new Model(surveyJson as object);
      m.applyTheme(FlatLightPanelless);
      m.mode = "display";
      // If there's a selected submission, load its data
      if (selectedSubmission?.RawJSON) {
        try {
          const data = JSON.parse(selectedSubmission.RawJSON);
          m.data = data;
        } catch {
          // Ignore parse errors
        }
      }
      if (selectedResponseData) {
        m.data = selectedResponseData;
      }
      modelRef.current?.dispose();
      modelRef.current = m;
      return m;
    } catch {
      return null;
    }
  }, [surveyJson, selectedSubmission?.RawJSON, selectedResponseData]);

  const selectedCompany = getSelectedCompany(selectedResponseData, surveyJson);

  /** Status tone, shared by the row tag and the detail header tag. */
  const getStatusTone = (status: string): WorkspaceTone => {
    const s = status.toLowerCase();
    if (s.includes("approved") || s.includes("submitted")) return "success";
    if (s.includes("pending")) return "warning";
    if (s.includes("rejected")) return "error";
    return "info";
  };

  if (loading) {
    return <WorkspaceNotice title="Loading submissions..." message="Reading responses for this form from SharePoint." />;
  }

  if (!isAuthenticated) {
    return (
      <WorkspaceNotice
        icon={<LockIcon sx={{ fontSize: 28 }} />}
        title="Sign in required"
        message="You must be signed in with your Microsoft 365 account to view submissions."
      />
    );
  }

  if (adminChecked && !isAdmin) {
    return (
      <WorkspaceNotice
        tone="error"
        icon={<BlockIcon sx={{ fontSize: 28 }} />}
        title="Access denied"
        message="This page is limited to the OSHES admin group. Ask an administrator to add you if you need to read responses."
      />
    );
  }

  return (
    <WorkspacePage>
      <WorkspaceHeader
        eyebrow="OSHES admin workspace"
        title={`${formTitle} responses`}
        subtitle={`${submissions.length} submission${submissions.length !== 1 ? "s" : ""} recorded for this form.`}
        actions={
          <>
            <TextField
              select
              size="small"
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="all">All status</MenuItem>
              <MenuItem value="Pending">Pending</MenuItem>
              <MenuItem value="Approved">Approved</MenuItem>
              <MenuItem value="Rejected">Rejected</MenuItem>
            </TextField>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportCSV} sx={{ minHeight: 40 }}>
              Export CSV
            </Button>
          </>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) minmax(0, 1fr)" },
          gap: 3,
          alignItems: "start",
        }}
      >
        {/* Submissions list */}
        <Box sx={workspacePanelSx}>
          <WorkspacePanelHeader label="Submissions" hint={`${filteredSubmissions.length} items`} />
          <Box sx={{ maxHeight: 600, overflow: "auto" }}>
            {filteredSubmissions.length === 0 ? (
              <Typography sx={{ p: 3, textAlign: "center", fontSize: 13, color: editorial.muted }}>
                No submissions found
              </Typography>
            ) : (
              filteredSubmissions.map((item) => {
                const selected = selectedSubmission?.Id === item.Id;
                const layer = item.CurrentLayer || item.CurrentApprovalLayer;
                return (
                  <Box
                    key={item.Id}
                    onClick={() => loadSubmissionDetails(item)}
                    sx={{
                      p: 2,
                      borderBottom: editorialHairline,
                      cursor: "pointer",
                      borderLeft: `3px solid ${selected ? editorial.pmwBlue : "transparent"}`,
                      backgroundColor: selected ? editorial.blueWash : "transparent",
                      transition: "background-color 0.15s ease",
                      "&:hover": { backgroundColor: selected ? editorial.blueWash : editorial.blueSoft },
                    }}
                  >
                    <Stack direction="row" spacing={1.5} sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                      <Typography sx={{ fontSize: 12, color: editorial.softMuted, fontVariantNumeric: "tabular-nums" }}>
                        #{item.Id}
                      </Typography>
                      <WorkspaceTag tone={getStatusTone(item.Status)}>{item.Status}</WorkspaceTag>
                    </Stack>
                    <Typography sx={{ fontSize: 13, fontWeight: 700 }}>By {item.SubmittedBy}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: editorial.muted, mt: 0.25 }}>
                      {formatDisplayDateTimeLong(item.SubmittedAt, "N/A")}
                      {(layer ?? 0) > 0 && ` · Layer ${layer}`}
                    </Typography>
                  </Box>
                );
              })
            )}
          </Box>
        </Box>

        {/* Detail panel */}
        <Box sx={workspacePanelSx}>
          {!selectedSubmission ? (
            <Typography sx={{ p: 6, textAlign: "center", fontSize: 13, color: editorial.muted }}>
              Select a submission to view details
            </Typography>
          ) : (
            <>
              <Box sx={{ p: 2, borderBottom: editorialHairline }}>
                <Stack direction="row" spacing={1.5} sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 16, fontWeight: 800 }}>Submission #{selectedSubmission.Id}</Typography>
                    <Typography sx={{ fontSize: 12.5, color: editorial.muted, mt: 0.25 }}>
                      {formatDisplayDateTimeLong(selectedSubmission.SubmittedAt, "N/A")}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    {selectedSubmission.PdfUrl && (
                      <Link
                        href={
                          selectedSubmission.PdfUrl.startsWith("http")
                            ? selectedSubmission.PdfUrl
                            : `${SP_SITE_URL}${selectedSubmission.PdfUrl}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                          fontSize: 11,
                          fontWeight: 800,
                          px: 1.25,
                          py: 0.5,
                          borderRadius: "999px",
                          backgroundColor: editorial.blueWash,
                          color: editorial.pmwBlueDark,
                          textDecoration: "none",
                        }}
                      >
                        View PDF
                      </Link>
                    )}
                    <WorkspaceTag tone={getStatusTone(selectedSubmission.Status)}>{selectedSubmission.Status}</WorkspaceTag>
                  </Stack>
                </Stack>
                <Typography sx={{ mt: 1, fontSize: 12, color: editorial.muted }}>
                  Submitted by <strong>{selectedSubmission.SubmittedBy}</strong> · Version {selectedSubmission.FormVersion}
                  {(selectedSubmission.CurrentLayer ?? selectedSubmission.CurrentApprovalLayer) > 0 && (
                    <>
                      {" · Layer "}
                      <strong>{selectedSubmission.CurrentLayer || selectedSubmission.CurrentApprovalLayer}</strong>
                    </>
                  )}
                </Typography>
                {selectedCompany && (
                  <Typography sx={{ mt: 0.5, fontSize: 12, fontWeight: 700, color: editorial.pmwBlueDark }}>
                    Company: {selectedCompany}
                  </Typography>
                )}
              </Box>

              <Box sx={{ p: 2, maxHeight: 500, overflow: "auto" }}>
                {previewSurvey ? (
                  <div className="response-survey-preview">
                    <Survey model={previewSurvey} />
                  </div>
                ) : (
                  <Typography sx={{ fontSize: 13, color: editorial.muted }}>Loading form preview...</Typography>
                )}
              </Box>

              {/* Matrix tables — from child lists, fallback to _Html */}
              {Object.keys(matrixTables).length > 0 && (
                <Box sx={{ px: 2, pb: 2 }}>
                  <Typography
                    sx={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      color: editorial.muted,
                      mb: 1.5,
                    }}
                  >
                    MATRIX TABLES
                  </Typography>
                  {Object.entries(matrixTables).map(([fieldName, entry]) => (
                    <Box key={fieldName} sx={{ mb: 2.25 }}>
                      <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: editorial.pmwBlueDark, mb: 0.5 }}>
                        {entry.columns[0]?.title ? entry.columns[0].title : fieldName}
                      </Typography>
                      <Box
                        sx={{ ...workspaceSurfaceSx, overflow: "auto" }}
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(entry.html) }}
                      />
                      <Typography sx={{ fontSize: 10.5, color: editorial.softMuted, mt: 0.5 }}>
                        {entry.rows.length} row{entry.rows.length !== 1 ? "s" : ""}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
              {matrixLoading && (
                <Typography sx={{ px: 2, pb: 2, fontSize: 12, color: editorial.muted }}>Loading matrix data...</Typography>
              )}

              {selectedSubmission.RawJSON && (
                <Box
                  component="details"
                  sx={{ p: 2, borderTop: editorialHairline, backgroundColor: editorial.paperSoft }}
                >
                  <Box component="summary" sx={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: editorial.muted }}>
                    View raw JSON
                  </Box>
                  <Box
                    component="pre"
                    sx={{
                      mt: 1.5,
                      p: 1.5,
                      backgroundColor: editorial.panel,
                      border: editorialHairline,
                      borderRadius: "8px",
                      fontSize: 11,
                      overflow: "auto",
                      maxHeight: 200,
                    }}
                  >
                    {selectedSubmission.RawJSON}
                  </Box>
                </Box>
              )}
            </>
          )}
        </Box>
      </Box>
    </WorkspacePage>
  );
}

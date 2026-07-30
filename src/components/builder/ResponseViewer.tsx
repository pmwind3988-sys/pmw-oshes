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
import LockIcon from "@mui/icons-material/Lock";
import BlockIcon from "@mui/icons-material/Block";
import { spGet, getFormConfigByTitle, readMatrixChildItems } from "../../utils/formBuilderSP";
import type { MatrixColumnDef } from "../../utils/formBuilderSP";
import { createSpClient } from "../../utils/sharepointClient";
import { acquireAccessTokenSilentOrRedirect } from "../../utils/authRecovery";
import { SP_STATIC } from "../../utils/spConfig";
import { rowsToHtml, getDynamicMatrixFields } from "../../utils/DynamicMatrix";
import { getSelectedCompany } from "../../utils/companySelection";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

// Theme
const C = {
  purple: "#0078D4",
  purpleLight: "#106EBE",
  purplePale: "#E6F2FB",
  purpleMid: "#B4D5F0",
  bg: "#F9FAFB",
  cardBg: "#FFFFFF",
  border: "#E5E7EB",
  textPrimary: "#111827",
  textSecond: "#6B7280",
  textMuted: "#9CA3AF",
  green: "#059669",
  greenPale: "#D1FAE5",
  greenBorder: "#6EE7B7",
  red: "#DC2626",
  redPale: "#FEE2E2",
  amber: "#D97706",
  amberPale: "#FEF3C7",
};

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
  "FormVersion", "FormID", "RawJSON", "CurrentLayer", "FormStatus", "EvaluationData", "WorkflowAssignmentData", "WorkflowEmailLog", "WorkflowEmailSchedule",
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

  // Status badge color
  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes("approved") || s.includes("submitted")) return { bg: C.greenPale, color: C.green };
    if (s.includes("pending")) return { bg: C.amberPale, color: C.amber };
    if (s.includes("rejected")) return { bg: C.redPale, color: C.red };
    return { bg: C.purplePale, color: C.purple };
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: C.textMuted }}>Loading submissions...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: C.cardBg, borderRadius: 16, padding: 40, textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 16, display: 'flex', justifyContent: 'center' }}><LockIcon style={{ fontSize: 40 }} /></div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.textPrimary, marginBottom: 8 }}>Sign in required</div>
          <div style={{ color: C.textSecond }}>You must be signed in to view submissions.</div>
        </div>
      </div>
    );
  }

  if (adminChecked && !isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: C.cardBg, borderRadius: 16, padding: 40, textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 16, display: 'flex', justifyContent: 'center' }}><BlockIcon style={{ fontSize: 40 }} /></div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.red, marginBottom: 8 }}>Access Denied</div>
          <div style={{ color: C.textSecond }}>You need OSHES Forms Owner permissions to view this page.</div>
          <div style={{ color: C.textMuted, marginTop: 8, fontSize: 13 }}>Please return to the dashboard.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <header style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.textPrimary, margin: 0 }}>
              {formTitle} Responses
            </h1>
            <p style={{ color: C.textSecond, marginTop: 4 }}>
              {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.cardBg,
                color: C.textPrimary,
                fontSize: 13,
              }}
            >
              <option value="all">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
            <button
              onClick={handleExportCSV}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.cardBg,
                color: C.textPrimary,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              📥 Export CSV
            </button>
          </div>
        </header>

        {error && (
          <div style={{ background: C.redPale, border: "1px solid #FCA5A5", borderRadius: 8, padding: 12, color: C.red, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Submissions List */}
          <div style={{ background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, color: C.textPrimary }}>Submissions</span>
              <span style={{ fontSize: 12, color: C.textMuted }}>{filteredSubmissions.length} items</span>
            </div>
            <div style={{ maxHeight: 600, overflow: "auto" }}>
              {filteredSubmissions.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: C.textMuted }}>No submissions found</div>
              ) : (
                filteredSubmissions.map((item) => {
                  const statusStyle = getStatusColor(item.Status);
                  return (
                    <div
                      key={item.Id}
                      onClick={() => loadSubmissionDetails(item)}
                      style={{
                        padding: 16,
                        borderBottom: `1px solid ${C.border}`,
                        cursor: "pointer",
                        background: selectedSubmission?.Id === item.Id ? C.purplePale : "transparent",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: C.textMuted }}>#{item.Id}</span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 12,
                            background: statusStyle.bg,
                            color: statusStyle.color,
                          }}
                        >
                          {item.Status}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: C.textSecond }}>
                        By {item.SubmittedBy}
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                        {item.SubmittedAt ? new Date(item.SubmittedAt).toLocaleString() : "N/A"}
                      </div>
                      {(item.CurrentLayer ?? item.CurrentApprovalLayer) > 0 && (
                        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                          Layer {item.CurrentLayer || item.CurrentApprovalLayer}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Detail Panel */}
          <div style={{ background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {!selectedSubmission ? (
              <div style={{ padding: 48, textAlign: "center", color: C.textMuted }}>
                Select a submission to view details
              </div>
            ) : (
              <>
                <div style={{ padding: 16, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: C.textPrimary }}>Submission #{selectedSubmission.Id}</div>
                      <div style={{ fontSize: 13, color: C.textSecond, marginTop: 4 }}>
                        {selectedSubmission.SubmittedAt ? new Date(selectedSubmission.SubmittedAt).toLocaleString() : "N/A"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {selectedSubmission.PdfUrl && (
                        <a
                          href={selectedSubmission.PdfUrl.startsWith("http") ? selectedSubmission.PdfUrl : `${SP_SITE_URL}${selectedSubmission.PdfUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "4px 12px",
                            borderRadius: 12,
                            background: C.purplePale,
                            color: C.purple,
                            textDecoration: "none",
                          }}
                        >
                          View PDF
                        </a>
                      )}
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "4px 12px",
                          borderRadius: 12,
                          ...getStatusColor(selectedSubmission.Status),
                        }}
                      >
                        {selectedSubmission.Status}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: C.textMuted }}>
                    Submitted by: <strong>{selectedSubmission.SubmittedBy}</strong> • Version: {selectedSubmission.FormVersion}
                    {(selectedSubmission.CurrentLayer ?? selectedSubmission.CurrentApprovalLayer) > 0 && (
                      <> • Layer: <strong>{selectedSubmission.CurrentLayer || selectedSubmission.CurrentApprovalLayer}</strong></>
                    )}
                  </div>
                  {selectedCompany && (
                    <div style={{ marginTop: 4, fontSize: 12, color: C.purple, fontWeight: 600 }}>
                      Company: {selectedCompany}
                    </div>
                  )}
                </div>

                <div style={{ padding: 16, maxHeight: 500, overflow: "auto" }}>
                  {previewSurvey ? (
                    <div className="response-survey-preview">
                      <Survey model={previewSurvey} />
                    </div>
                  ) : (
                    <div style={{ color: C.textMuted }}>Loading form preview...</div>
                  )}
                </div>

                {/* Matrix Tables — from child lists, fallback to _Html */}
                {Object.keys(matrixTables).length > 0 && (
                  <div style={{ padding: "0 16px 16px" }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: C.textSecond,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 12,
                      }}
                    >
                      Matrix Tables
                    </div>
                    {Object.entries(matrixTables).map(([fieldName, entry]) => (
                      <div key={fieldName} style={{ marginBottom: 18 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: C.purple,
                            marginBottom: 4,
                          }}
                        >
                          {entry.columns[0]?.title ? entry.columns[0].title : fieldName}
                        </div>
                        <div
                          style={{
                            overflow: "auto",
                            border: `1px solid ${C.border}`,
                            borderRadius: 8,
                          }}
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(entry.html) }}
                        />
                        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
                          {entry.rows.length} row{entry.rows.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {matrixLoading && (
                  <div style={{ padding: "0 16px 16px", color: C.textMuted, fontSize: 12 }}>Loading matrix data...</div>
                )}

                {selectedSubmission.RawJSON && (
                  <details style={{ padding: 16, borderTop: `1px solid ${C.border}`, background: C.bg }}>
                    <summary style={{ cursor: "pointer", color: C.textSecond, fontSize: 13 }}>
                      View Raw JSON
                    </summary>
                    <pre
                      style={{
                        marginTop: 12,
                        padding: 12,
                        background: C.cardBg,
                        borderRadius: 8,
                        fontSize: 11,
                        overflow: "auto",
                        maxHeight: 200,
                      }}
                    >
                      {selectedSubmission.RawJSON}
                    </pre>
                  </details>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

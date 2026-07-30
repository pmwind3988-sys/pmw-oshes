import { useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import {
  AdminPanelSettingsOutlined as AdminIcon,
  DeleteForeverOutlined as DeleteForeverIcon,
  FileDownloadOutlined as FileDownloadIcon,
  PersonOutlined as PersonIcon,
  SpaceDashboardOutlined as DashboardIcon,
  TableChartOutlined as TableChartIcon,
  WarningAmberOutlined as WarningIcon,
} from "@mui/icons-material";
import { useDashboard } from "../contexts/DashboardContext";
import Header from "../components/dashboard/Header";
import StatsRow from "../components/dashboard/StatsRow";
import ListSummaryCards from "../components/dashboard/ListSummaryCards";
import Toolbar from "../components/dashboard/Toolbar";
import ListHeader from "../components/dashboard/ListHeader";
import SubmissionRow from "../components/dashboard/SubmissionRow";
import EmptyState from "../components/dashboard/EmptyState";
import ConfigWarningBanner from "../components/dashboard/ConfigWarningBanner";
import DetailModal from "../components/dashboard/DetailModal";
import type { HardDeleteSubmissionResult, Submission } from "../types";
import { editorial, editorialShadow } from "../theme/editorial";

type ExportDatePreset = "all" | "today" | "week" | "month" | "custom";

const EXPORT_BASE_COLUMNS = [
  "Reference",
  "Form",
  "Category",
  "Title",
  "Submitted By",
  "Submitter Email",
  "Submitted At",
  "Modified At",
  "Status",
  "Current Layer",
  "Total Layers",
  "Selected Branch",
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function parseDateValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function exportDateRange(preset: ExportDatePreset, customFrom: string, customTo: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (preset === "week") {
    const start = startOfDay(now);
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    const end = endOfDay(start);
    end.setDate(start.getDate() + 6);
    return { from: start, to: end };
  }
  if (preset === "month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }
  if (preset === "custom") {
    return {
      from: customFrom ? startOfDay(new Date(customFrom)) : null,
      to: customTo ? endOfDay(new Date(customTo)) : null,
    };
  }
  return { from: null, to: null };
}

function submissionMatchesExportFilters(
  item: Submission,
  filters: {
    datePreset: ExportDatePreset;
    customFrom: string;
    customTo: string;
    listTitle: string;
    category: string;
    submitter: string;
    listMetaMap: Record<string, { category: string }>;
  },
): boolean {
  const { from, to } = exportDateRange(filters.datePreset, filters.customFrom, filters.customTo);
  const submitted = parseDateValue(item.submittedAt);
  if (from && (!submitted || submitted < from)) return false;
  if (to && (!submitted || submitted > to)) return false;
  if (filters.listTitle && item.listTitle !== filters.listTitle) return false;
  if (filters.category && filters.listMetaMap[item.listTitle]?.category !== filters.category) return false;
  if (filters.submitter) {
    const needle = filters.submitter.toLowerCase();
    const candidates = [
      item.submittedByEmail,
      item.submitterName ?? "",
      item.createdByEmail ?? "",
      item.createdByName ?? "",
    ];
    if (!candidates.some((candidate) => candidate.toLowerCase().includes(needle))) return false;
  }
  return true;
}

function buildSubmissionCsv(rows: Submission[], listMetaMap: Record<string, { category: string }>): string {
  const fieldKeys = Array.from(
    rows.reduce((keys, row) => {
      Object.keys(row.submissionData).forEach((key) => keys.add(key));
      return keys;
    }, new Set<string>()),
  ).sort((a, b) => a.localeCompare(b));
  const columns = [...EXPORT_BASE_COLUMNS, ...fieldKeys];
  const lines = [columns.map(csvCell).join(",")];

  for (const row of rows) {
    const baseValues: Record<(typeof EXPORT_BASE_COLUMNS)[number], unknown> = {
      Reference: row.submissionId,
      Form: row.listTitle,
      Category: listMetaMap[row.listTitle]?.category ?? "",
      Title: row.title,
      "Submitted By": row.submitterName || row.createdByName || row.submittedByEmail,
      "Submitter Email": row.submittedByEmail || row.createdByEmail,
      "Submitted At": row.submittedAt,
      "Modified At": row.modifiedAt,
      Status: row.formStatus,
      "Current Layer": row.currentLayer ?? "",
      "Total Layers": row.totalLayers,
      "Selected Branch": row.selectedBranch ?? "",
    };
    lines.push([
      ...EXPORT_BASE_COLUMNS.map((column) => csvCell(baseValues[column])),
      ...fieldKeys.map((key) => csvCell(row.submissionData[key])),
    ].join(","));
  }

  return lines.join("\r\n");
}

function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminHomePage() {
  const {
    userEmail,
    isAdmin,
    submissions,
    visibleLists,
    listMetaMap,
    missingConfigs,
    hasFilters,
    detailItem,
    setDetailItem,
    search,
    setSearch,
    listFilter,
    setListFilter,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    submitterFilter,
    setSubmitterFilter,
    sortedSubmissions,
    onSignOut,
    onSwitchAccount,
    onHardDeleteSubmission,
  } = useDashboard();
  const [deleteTarget, setDeleteTarget] = useState<Submission | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting">("idle");
  const [deleteError, setDeleteError] = useState("");
  const [deleteResult, setDeleteResult] = useState<HardDeleteSubmissionResult | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportDatePreset, setExportDatePreset] = useState<ExportDatePreset>("all");
  const [exportCustomFrom, setExportCustomFrom] = useState("");
  const [exportCustomTo, setExportCustomTo] = useState("");
  const [exportListFilter, setExportListFilter] = useState("");
  const [exportCategoryFilter, setExportCategoryFilter] = useState("");
  const [exportSubmitterFilter, setExportSubmitterFilter] = useState("");
  const workspaceLabel = isAdmin ? "OSHES admin workspace" : "OSHES workspace";
  const canHardDeleteSubmission = isAdmin;
  const canExportSubmissions = isAdmin;
  const categoryOptions = Array.from(
    new Set(visibleLists.map((list) => listMetaMap[list.title]?.category).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const exportRows = submissions.filter((item) =>
    submissionMatchesExportFilters(item, {
      datePreset: exportDatePreset,
      customFrom: exportCustomFrom,
      customTo: exportCustomTo,
      listTitle: exportListFilter,
      category: exportCategoryFilter,
      submitter: exportSubmitterFilter,
      listMetaMap,
    }),
  );
  const dashboardSubtitle = isAdmin
    ? "Review submissions, monitor workflows, and manage OSHES operations."
    : "Submit OSHES forms, track workflow status, and access your submission history.";

  const openDeleteDialog = (item: Submission) => {
    setDeleteTarget(item);
    setDeleteError("");
    setDeleteResult(null);
  };

  const closeDeleteDialog = () => {
    if (deleteStatus === "deleting") return;
    setDeleteTarget(null);
    setDeleteError("");
  };

  const confirmHardDelete = async () => {
    if (!deleteTarget) return;

    setDeleteStatus("deleting");
    setDeleteError("");
    try {
      const result = await onHardDeleteSubmission(deleteTarget);
      setDeleteResult(result);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete submission.");
    } finally {
      setDeleteStatus("idle");
    }
  };

  const handleExportCsv = () => {
    const csv = buildSubmissionCsv(exportRows, listMetaMap);
    const datePart = new Date().toISOString().slice(0, 10);
    const scopePart = (exportListFilter || exportCategoryFilter || "all-forms")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    downloadCsv(csv, `pmw-oshes-submissions-${scopePart}-${datePart}.csv`);
    setExportOpen(false);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background:
          "var(--app-bg, linear-gradient(180deg, #F6FAFD 0%, #F8FAFC 48%, #FFFFFF 100%))",
        color: editorial.ink,
        WebkitFontSmoothing: "antialiased",
        position: "relative",
        "&::before": {
          content: '""',
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(90deg, rgba(0, 120, 212, 0.045) 0%, rgba(255,255,255,0) 42%, rgba(98, 100, 167, 0.04) 100%)",
        },
      }}
    >
      <Header
        userEmail={userEmail}
        isAdmin={isAdmin}
        onLogout={onSignOut}
        onSwitch={onSwitchAccount}
      />

      <Box
        sx={{
          maxWidth: 1440,
          mx: "auto",
          px: { xs: 1.5, sm: 3, md: 4 },
          py: { xs: 2, sm: 3, md: 4 },
          position: "relative",
          zIndex: 1,
        }}
      >
        <Box
          component="section"
          sx={{
            mb: { xs: 2.5, md: 3.5 },
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(280px, auto)" },
            gap: { xs: 2, md: 3 },
            alignItems: "end",
          }}
        >
          <Box>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mb: 1.5 }}>
              <Chip
                icon={<DashboardIcon />}
                label={workspaceLabel}
                size="small"
                sx={{
                  backgroundColor: isAdmin ? editorial.purpleWash : editorial.blueWash,
                  color: isAdmin ? editorial.pmwPurpleDark : editorial.pmwBlueDark,
                  border: `1px solid ${isAdmin ? editorial.pmwPurpleSoft : editorial.pmwBlueSoft}`,
                  fontWeight: 800,
                  "& .MuiChip-icon": {
                    color: isAdmin ? editorial.pmwPurpleDark : editorial.pmwBlueDark,
                  },
                }}
              />
              <Chip
                label={`${visibleLists.length} visible form${visibleLists.length === 1 ? "" : "s"}`}
                size="small"
                sx={{
                  backgroundColor: "rgba(255, 255, 255, 0.82)",
                  color: editorial.muted,
                  border: `1px solid ${editorial.border}`,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                }}
              />
            </Stack>
            <Typography
              variant="h1"
              sx={{
                color: editorial.ink,
                fontSize: { xs: "2rem", sm: "2.55rem", md: "3rem" },
                lineHeight: 1,
                textWrap: "balance",
              }}
            >
              PMW OSHES Forms
            </Typography>
            <Typography
              variant="h6"
              sx={{
                color: editorial.muted,
                fontWeight: 700,
                mt: 1,
                maxWidth: 820,
                textWrap: "pretty",
              }}
            >
              {dashboardSubtitle}
            </Typography>
          </Box>
          <Box
            sx={{
              justifySelf: { xs: "start", md: "end" },
              display: "grid",
              gridTemplateColumns: "40px minmax(0, 1fr)",
              gap: 1.25,
              alignItems: "center",
              maxWidth: "100%",
              px: 1.5,
              py: 1.25,
              borderRadius: "8px",
              color: editorial.muted,
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              boxShadow: editorialShadow,
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isAdmin ? editorial.purpleWash : editorial.blueWash,
                color: isAdmin ? editorial.pmwPurpleDark : editorial.pmwBlueDark,
                boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.06)",
              }}
            >
              {isAdmin ? <AdminIcon sx={{ fontSize: 20 }} /> : <PersonIcon sx={{ fontSize: 20 }} />}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 800 }}>
                Signed in as
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: editorial.ink,
                  fontWeight: 800,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {userEmail}
              </Typography>
            </Box>
          </Box>
        </Box>

        {missingConfigs.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <ConfigWarningBanner missingLists={missingConfigs} />
          </Box>
        )}

        <Box sx={{ mb: 4 }}>
          <StatsRow submissions={submissions} />
        </Box>

        {visibleLists.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <ListSummaryCards
              submissions={submissions}
              visibleLists={visibleLists}
              listMetaMap={listMetaMap}
              isAdmin={isAdmin}
            />
          </Box>
        )}

        <Box sx={{ mb: 4 }}>
          <Toolbar
            search={search}
            setSearch={setSearch}
            listFilter={listFilter}
            setListFilter={setListFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            submitterFilter={submitterFilter}
            setSubmitterFilter={setSubmitterFilter}
            isAdmin={isAdmin}
            canExportSubmissions={canExportSubmissions}
            onOpenExport={() => setExportOpen(true)}
            visibleLists={visibleLists}
            total={submissions.length}
            filtered={sortedSubmissions.length}
          />
        </Box>

        {deleteResult && (
          <Alert
            severity={deleteResult.warnings.length > 0 ? "warning" : "success"}
            icon={<DeleteForeverIcon />}
            onClose={() => setDeleteResult(null)}
            sx={{
              mb: 2,
              borderRadius: "8px",
              backgroundColor: deleteResult.warnings.length > 0 ? "#FFF3E0" : "#F1FAF1",
              border: `1px solid ${deleteResult.warnings.length > 0 ? "rgba(177, 92, 0, 0.42)" : "rgba(16, 124, 16, 0.42)"}`,
              boxShadow: "0 10px 26px rgba(16, 16, 16, 0.12), 0 0 0 1px rgba(16, 16, 16, 0.04)",
              color: editorial.ink,
              "& .MuiAlert-message": {
                width: "100%",
              },
              "& .MuiAlert-icon": {
                color: deleteResult.warnings.length > 0 ? editorial.warning : editorial.success,
                opacity: 1,
              },
            }}
          >
            <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              Submission deleted. Removed {deleteResult.deletedFiles} managed file{deleteResult.deletedFiles === 1 ? "" : "s"} and {deleteResult.deletedMatrixRows} matrix row{deleteResult.deletedMatrixRows === 1 ? "" : "s"}.
            </Typography>
            {deleteResult.warnings.length > 0 && (
              <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: editorial.warning, fontWeight: 700, lineHeight: 1.5 }}>
                Cleanup warnings: {deleteResult.warnings.slice(0, 2).join(" ")}
              </Typography>
            )}
          </Alert>
        )}

        {sortedSubmissions.length > 0 ? (
          <>
            <ListHeader isAdmin={isAdmin} />
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {sortedSubmissions.map((item) => (
                <SubmissionRow
                  key={`${item.listTitle}-${item.id}`}
                  item={item}
                  onView={setDetailItem}
                  onDelete={openDeleteDialog}
                  isAdmin={isAdmin}
                  canDelete={canHardDeleteSubmission}
                  isDeleting={deleteStatus === "deleting" && deleteTarget?.listTitle === item.listTitle && deleteTarget.id === item.id}
                  listMetaMap={listMetaMap}
                />
              ))}
            </Box>
          </>
        ) : (
          <EmptyState hasFilters={hasFilters} />
        )}
      </Box>

      <DetailModal item={detailItem} isAdmin={isAdmin} onClose={() => setDetailItem(null)} />

      <Dialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        fullWidth
        maxWidth="md"
        slotProps={{
          paper: {
            sx: {
              borderRadius: "8px",
              boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.06), 0 18px 48px rgba(16, 16, 16, 0.18)",
              overflow: "hidden",
            },
          },
        }}
      >
        <DialogTitle sx={{ display: "flex", gap: 1.5, alignItems: "center", px: 3, py: 2.5, backgroundColor: editorial.paperSoft }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: editorial.blueWash,
              color: editorial.pmwBlueDark,
              flexShrink: 0,
            }}
          >
            <TableChartIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 900, color: editorial.ink, textWrap: "balance" }}>
              Export dashboard submissions
            </Typography>
            <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 700, textWrap: "pretty" }}>
              CSV opens in Excel and includes submitted form fields.
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
              gap: 2,
            }}
          >
            <FormControl size="small" sx={{ minWidth: 0 }}>
              <InputLabel>Date range</InputLabel>
              <Select
                value={exportDatePreset}
                label="Date range"
                onChange={(event) => setExportDatePreset(event.target.value as ExportDatePreset)}
                sx={{ borderRadius: "8px", backgroundColor: editorial.paperSoft }}
              >
                <MenuItem value="all">All dates</MenuItem>
                <MenuItem value="today">Today</MenuItem>
                <MenuItem value="week">This week</MenuItem>
                <MenuItem value="month">This month</MenuItem>
                <MenuItem value="custom">Custom date range</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 0 }}>
              <InputLabel>Form</InputLabel>
              <Select
                value={exportListFilter}
                label="Form"
                onChange={(event) => setExportListFilter(event.target.value)}
                sx={{ borderRadius: "8px", backgroundColor: editorial.paperSoft }}
              >
                <MenuItem value="">All forms</MenuItem>
                {visibleLists.map((list) => (
                  <MenuItem key={list.title} value={list.title}>
                    {list.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {exportDatePreset === "custom" && (
              <>
                <TextField
                  label="From"
                  type="date"
                  size="small"
                  value={exportCustomFrom}
                  onChange={(event) => setExportCustomFrom(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px", backgroundColor: editorial.paperSoft } }}
                />
                <TextField
                  label="To"
                  type="date"
                  size="small"
                  value={exportCustomTo}
                  onChange={(event) => setExportCustomTo(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px", backgroundColor: editorial.paperSoft } }}
                />
              </>
            )}

            <FormControl size="small" sx={{ minWidth: 0 }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={exportCategoryFilter}
                label="Category"
                onChange={(event) => setExportCategoryFilter(event.target.value)}
                sx={{ borderRadius: "8px", backgroundColor: editorial.paperSoft }}
              >
                <MenuItem value="">All categories</MenuItem>
                {categoryOptions.map((category) => (
                  <MenuItem key={category} value={category}>
                    {category}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Submitter"
              placeholder="Name or email"
              size="small"
              value={exportSubmitterFilter}
              onChange={(event) => setExportSubmitterFilter(event.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px", backgroundColor: editorial.paperSoft } }}
            />
          </Box>

          <Alert
            severity={exportRows.length > 0 ? "info" : "warning"}
            sx={{
              mt: 2,
              borderRadius: "8px",
              backgroundColor: exportRows.length > 0 ? editorial.blueWash : editorial.yellowSoft,
              color: exportRows.length > 0 ? editorial.pmwBlueDark : editorial.warning,
              boxShadow: `inset 0 0 0 1px ${exportRows.length > 0 ? editorial.pmwBlueSoft : "rgba(177, 92, 0, 0.28)"}`,
              "& .MuiAlert-icon": {
                color: exportRows.length > 0 ? editorial.pmwBlueDark : editorial.warning,
              },
              "& .MuiAlert-message": {
                fontVariantNumeric: "tabular-nums",
                fontWeight: 800,
              },
            }}
          >
            {exportRows.length} submission{exportRows.length === 1 ? "" : "s"} match these export filters.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1, backgroundColor: editorial.paperSoft }}>
          <Button
            onClick={() => setExportOpen(false)}
            sx={{
              borderRadius: "8px",
              minHeight: 40,
              px: 2,
              textTransform: "none",
              fontWeight: 800,
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<FileDownloadIcon />}
            onClick={handleExportCsv}
            disabled={exportRows.length === 0}
            sx={{
              borderRadius: "8px",
              minHeight: 40,
              fontWeight: 800,
              textTransform: "none",
              transition: "background-color 0.18s ease, transform 0.18s ease",
              "&:active": {
                transform: "scale(0.96)",
              },
            }}
          >
            Export CSV
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={closeDeleteDialog}
        fullWidth
        maxWidth="sm"
        slotProps={{
          paper: {
            sx: {
              borderRadius: "8px",
              border: `1px solid rgba(198, 40, 40, 0.18)`,
              boxShadow: "0 18px 48px rgba(16, 16, 16, 0.18)",
            },
          },
        }}
      >
        <DialogTitle sx={{ display: "flex", gap: 1.5, alignItems: "center", pb: 1 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(198, 40, 40, 0.08)",
              color: editorial.error,
              flexShrink: 0,
            }}
          >
            <WarningIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 900, color: editorial.ink, textWrap: "balance" }}>
              Permanently delete submission?
            </Typography>
            <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 700 }}>
              {deleteTarget?.listTitle} · Reference {deleteTarget?.submissionId}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
            <Alert severity="error" sx={{ borderRadius: "8px", mb: 2, fontWeight: 700 }}>
              This removes the SharePoint item, generated PDFs, signature images, uploaded files stored in app-managed libraries, and matrix child rows. This action cannot be undone.
            </Alert>
          {deleteError && (
            <Alert severity="error" sx={{ borderRadius: "8px", fontWeight: 700 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={closeDeleteDialog} disabled={deleteStatus === "deleting"} sx={{ borderRadius: "8px", minHeight: 40 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={deleteStatus === "deleting" ? <CircularProgress size={16} color="inherit" /> : <DeleteForeverIcon />}
            onClick={confirmHardDelete}
            disabled={deleteStatus === "deleting"}
            sx={{
              borderRadius: "8px",
              minHeight: 40,
              fontWeight: 800,
              textTransform: "none",
              transition: "background-color 0.18s ease, transform 0.18s ease",
              "&:active": {
                transform: "scale(0.96)",
              },
            }}
          >
            Delete permanently
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

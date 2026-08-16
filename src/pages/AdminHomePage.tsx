import { useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, Typography } from "@mui/material";
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
import {
  collectFieldCatalog,
  collectFormTypes,
  collectFormVersions,
  collectPublishProfiles,
} from "../utils/submissionFilters";
import { csvCell, downloadCsv } from "../utils/csv";
import type { HardDeleteSubmissionResult, Submission } from "../types";
import { editorial, editorialShadow } from "../theme/editorial";

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

export default function AdminHomePage() {
  const {
    userEmail,
    isAdmin,
    canUseFormBuilder,
    submissions,
    visibleLists,
    listMetaMap,
    missingConfigs,
    hasFilters,
    detailItem,
    setDetailItem,
    filters,
    setFilters,
    sortBy,
    setSortBy,
    sortedSubmissions,
    onSignOut,
    onSwitchAccount,
    onOpenBuilder,
    onEditForm,
    onHardDeleteSubmission,
  } = useDashboard();
  const [deleteTarget, setDeleteTarget] = useState<Submission | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting">("idle");
  const [deleteError, setDeleteError] = useState("");
  const [deleteResult, setDeleteResult] = useState<HardDeleteSubmissionResult | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"current" | "all">("current");
  const workspaceLabel = isAdmin ? "Admin workspace" : "Employee workspace";
  const canHardDeleteSubmission = isAdmin || canUseFormBuilder;
  const canExportSubmissions = isAdmin || canUseFormBuilder;
  const formTypeOptions = collectFormTypes(submissions, visibleLists.map((list) => list.title));
  const publishProfileOptions = collectPublishProfiles(submissions, filters.formType);
  const formVersionOptions = collectFormVersions(submissions, filters.formType, filters.publishProfile);
  const fieldCatalog = collectFieldCatalog(submissions, filters.formType, {
    publishProfile: filters.publishProfile,
    formVersion: filters.formVersion,
  });
  const exportRows = exportScope === "all" ? submissions : sortedSubmissions;
  const dashboardSubtitle = isAdmin
    ? canUseFormBuilder
      ? "Manage HR forms, review submissions, monitor approval workflows, and maintain form configurations."
      : "Review submissions, monitor approval workflows, and manage HR portal operations."
    : "Submit HR forms, track approval status, and access your submission history.";

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
    const scopePart = exportScope === "all" ? "all" : "filtered";
    downloadCsv(csv, `pmw-hr-submissions-${scopePart}-${datePart}.csv`);
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
        // `clip` rather than `hidden`: it stops a stray wide child from making the
        // whole document scroll/pinch-zoom sideways without creating a scroll
        // container, so the sticky Header keeps sticking to the viewport.
        overflowX: "clip",
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
        canUseFormBuilder={canUseFormBuilder}
        onLogout={onSignOut}
        onSwitch={onSwitchAccount}
        onOpenBuilder={onOpenBuilder}
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
              PMW Group HR Portal
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
              canUseFormBuilder={canUseFormBuilder}
              onEditForm={onEditForm}
            />
          </Box>
        )}

        <Box sx={{ mb: 4 }}>
          <Toolbar
            filters={filters}
            setFilters={setFilters}
            sortBy={sortBy}
            setSortBy={setSortBy}
            formTypeOptions={formTypeOptions}
            publishProfileOptions={publishProfileOptions}
            formVersionOptions={formVersionOptions}
            fieldCatalog={fieldCatalog}
            isAdmin={isAdmin}
            canExportSubmissions={canExportSubmissions}
            onOpenExport={() => setExportOpen(true)}
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
          <FormControl size="small" fullWidth>
            <InputLabel>Scope</InputLabel>
            <Select
              value={exportScope}
              label="Scope"
              onChange={(event) => setExportScope(event.target.value as "current" | "all")}
              sx={{ borderRadius: "8px", backgroundColor: editorial.paperSoft }}
            >
              <MenuItem value="current">Current view (filters applied)</MenuItem>
              <MenuItem value="all">All submissions</MenuItem>
            </Select>
          </FormControl>

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
            {exportRows.length} submission{exportRows.length === 1 ? "" : "s"} will be exported.
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

/**
 * Toolbar.tsx — the dashboard's submission filter bar.
 *
 * Organised scope-first: the always-visible row carries free-text search and the
 * form type, because choosing a form is what makes everything else meaningful.
 * The advanced panel then splits in two — facets every submission has (status,
 * submitter, submitted-on, sort) and facets belonging to the chosen form type
 * (its publish profile, and conditions on its own questions).
 *
 * Applied conditions are always echoed as removable chips below the bar. With a
 * stack of field conditions an admin must be able to see and undo any one of
 * them without reopening the panel.
 */
import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Collapse,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  AdminPanelSettings as AdminIcon,
  ExpandLess,
  ExpandMore,
  FileDownloadOutlined as FileDownloadIcon,
  FilterList as FilterListIcon,
  RestartAlt as ClearFiltersIcon,
  Search as SearchIcon,
} from "@mui/icons-material";
import { editorial, editorialShadow } from "../../theme/editorial";
import {
  EMPTY_SUBMISSION_FILTERS,
  applyFormTypeChange,
  applyFormVersionChange,
  applyPublishProfileChange,
  countActiveFilters,
  describeFieldFilter,
  type FieldFilter,
  type FormTypeOption,
  type FormVersionOption,
  type SubmissionFilterState,
} from "../../utils/submissionFilters";
import type { FilterableField } from "../../utils/formFieldCatalog";
import { LIFECYCLE_STAGES, lifecycleLabel } from "../../utils/submissionLifecycle";
import { AddFieldCondition, FieldConditionRow } from "./FieldConditions";

interface ToolbarProps {
  filters: SubmissionFilterState;
  setFilters: (filters: SubmissionFilterState) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  formTypeOptions: FormTypeOption[];
  publishProfileOptions: string[];
  /** Versions of the form and profile in scope. */
  formVersionOptions: FormVersionOption[];
  /** Questions of the form, profile and version in scope. Empty until a form is chosen. */
  fieldCatalog: FilterableField[];
  isAdmin: boolean;
  canExportSubmissions: boolean;
  onOpenExport: () => void;
  total: number;
  filtered: number;
}

const SECTION_LABEL_SX = {
  fontWeight: 800,
  fontSize: "0.72rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: editorial.softMuted,
} as const;

export default function Toolbar({
  filters,
  setFilters,
  sortBy,
  setSortBy,
  formTypeOptions,
  publishProfileOptions,
  formVersionOptions,
  fieldCatalog,
  isAdmin,
  canExportSubmissions,
  onOpenExport,
  total,
  filtered,
}: ToolbarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const patch = (next: Partial<SubmissionFilterState>) => setFilters({ ...filters, ...next });
  const detailedFilterCount = countActiveFilters(filters) + (sortBy !== "newest" ? 1 : 0);
  const hasFilters = detailedFilterCount > 0;
  const fieldByKey = new Map(fieldCatalog.map((field) => [field.key, field]));

  const searchFieldSx = {
    minWidth: 0,
    "& .MuiOutlinedInput-root": {
      borderRadius: "10px",
      backgroundColor: editorial.paperSoft,
      transition: "background-color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
      "&:hover": {
        backgroundColor: editorial.blueSoft,
      },
      "&.Mui-focused": {
        backgroundColor: "#ffffff",
        boxShadow: `0 0 0 3px ${editorial.pmwBlueSoft}`,
      },
    },
  } as const;
  const selectSx = {
    borderRadius: "10px",
    backgroundColor: editorial.paperSoft,
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: editorial.pmwBlue,
    },
  } as const;

  const clearFilters = () => {
    setFilters(EMPTY_SUBMISSION_FILTERS);
    setSortBy("newest");
  };

  const updateFieldFilter = (next: FieldFilter) => {
    patch({ fieldFilters: filters.fieldFilters.map((entry) => (entry.id === next.id ? next : entry)) });
  };
  const removeFieldFilter = (id: string) => {
    patch({ fieldFilters: filters.fieldFilters.filter((entry) => entry.id !== id) });
  };

  const chips: { key: string; label: string; onDelete: () => void }[] = [];
  if (filters.search) {
    chips.push({ key: "search", label: `Search "${filters.search}"`, onDelete: () => patch({ search: "" }) });
  }
  if (filters.formType) {
    chips.push({
      key: "formType",
      label: `Form: ${filters.formType}`,
      // Clearing the form type must also drop what was scoped to it.
      onDelete: () => setFilters(applyFormTypeChange(filters, "")),
    });
  }
  if (filters.stage !== "all") {
    chips.push({
      key: "stage",
      label: `Status: ${lifecycleLabel(filters.stage as (typeof LIFECYCLE_STAGES)[number])}`,
      onDelete: () => patch({ stage: "all" }),
    });
  }
  if (filters.publishProfile) {
    chips.push({
      key: "profile",
      label: `Profile: ${filters.publishProfile}`,
      onDelete: () => setFilters(applyPublishProfileChange(filters, "")),
    });
  }
  if (filters.formVersion) {
    chips.push({
      key: "version",
      label: `Version: ${filters.formVersion}`,
      onDelete: () => setFilters(applyFormVersionChange(filters, "")),
    });
  }
  if (filters.submitter) {
    chips.push({
      key: "submitter",
      label: `Submitter: ${filters.submitter}`,
      onDelete: () => patch({ submitter: "" }),
    });
  }
  if (filters.dateFrom || filters.dateTo) {
    chips.push({
      key: "dates",
      label: `Submitted ${filters.dateFrom || "…"} – ${filters.dateTo || "…"}`,
      onDelete: () => patch({ dateFrom: "", dateTo: "" }),
    });
  }
  for (const fieldFilter of filters.fieldFilters) {
    chips.push({
      key: fieldFilter.id,
      label: describeFieldFilter(fieldFilter, fieldByKey.get(fieldFilter.key)),
      onDelete: () => removeFieldFilter(fieldFilter.id),
    });
  }

  return (
    <Box
      sx={{
        backgroundColor: "rgba(255, 255, 255, 0.92)",
        borderRadius: "12px",
        boxShadow: editorialShadow,
        p: { xs: 1.5, sm: 2 },
      }}
    >
      <Stack spacing={{ xs: 1.5, sm: 2 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "minmax(0, 1fr) auto", md: "minmax(0, 1fr) minmax(0, 260px) auto" },
            gap: { xs: 1, sm: 1.5 },
            alignItems: "center",
          }}
        >
          <TextField
            placeholder="Search reference no, form or ID..."
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            size="small"
            sx={searchFieldSx}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: editorial.muted, fontSize: 20 }} />
                  </InputAdornment>
                ),
              },
            }}
          />

          <FormControl size="small" sx={{ minWidth: 0, gridColumn: { xs: "1 / -1", md: "auto" } }}>
            <InputLabel>Form type</InputLabel>
            <Select
              value={filters.formType}
              label="Form type"
              onChange={(e) => setFilters(applyFormTypeChange(filters, e.target.value))}
              sx={selectSx}
            >
              <MenuItem value="">All form types</MenuItem>
              {formTypeOptions.map((option) => (
                <MenuItem key={option.title} value={option.title}>
                  {option.title}
                  {option.count > 0 && (
                    <Box component="span" sx={{ ml: 0.75, color: editorial.softMuted, fontVariantNumeric: "tabular-nums" }}>
                      ({option.count})
                    </Box>
                  )}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant={advancedOpen ? "contained" : "outlined"}
            startIcon={<FilterListIcon />}
            endIcon={advancedOpen ? <ExpandLess /> : <ExpandMore />}
            onClick={() => setAdvancedOpen((open) => !open)}
            sx={{
              justifySelf: "end",
              height: 40,
              minWidth: { xs: 116, sm: 178 },
              px: { xs: 1.25, sm: 2 },
              borderRadius: "10px",
              whiteSpace: "nowrap",
              ...(advancedOpen
                ? {
                    backgroundColor: editorial.pmwBlue,
                    color: editorial.white,
                    boxShadow: `inset 0 0 0 1px ${editorial.pmwBlue}`,
                    "&:hover": {
                      backgroundColor: editorial.pmwBlueDark,
                    },
                  }
                : {
                    backgroundColor: editorial.white,
                    color: editorial.pmwBlueDark,
                    boxShadow: `inset 0 0 0 1px ${editorial.pmwBlueSoft}`,
                    "&:hover": {
                      backgroundColor: editorial.blueWash,
                      boxShadow: `inset 0 0 0 1px ${editorial.pmwBlue}`,
                    },
                  }),
              transition: "background-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
              "&:active": {
                transform: "scale(0.96)",
              },
              "& .MuiButton-startIcon": {
                mr: { xs: 0.5, sm: 0.75 },
              },
              "& .MuiButton-endIcon": {
                ml: { xs: 0.25, sm: 0.75 },
              },
            }}
          >
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              Advanced Search
            </Box>
            <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
              Advanced
            </Box>
            {detailedFilterCount > 0 && (
              <Box component="span" sx={{ ml: 0.75 }}>
                ({detailedFilterCount})
              </Box>
            )}
          </Button>
        </Box>

        <Collapse in={advancedOpen} timeout={180} unmountOnExit>
          <Box sx={{ pt: 2, borderTop: `1px solid ${editorial.border}` }}>
            <Typography sx={SECTION_LABEL_SX}>Any form type</Typography>
            <Box
              sx={{
                mt: 1,
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  lg: isAdmin ? "repeat(4, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))",
                },
                gap: 2,
                alignItems: "center",
              }}
            >
              <FormControl size="small" sx={{ minWidth: 0 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={filters.stage}
                  label="Status"
                  onChange={(e) => patch({ stage: e.target.value })}
                  sx={selectSx}
                >
                  <MenuItem value="all">All statuses</MenuItem>
                  {LIFECYCLE_STAGES.map((stage) => (
                    <MenuItem key={stage} value={stage}>
                      {lifecycleLabel(stage)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 0 }}>
                <InputLabel>Sort by</InputLabel>
                <Select
                  value={sortBy}
                  label="Sort by"
                  onChange={(e) => setSortBy(e.target.value)}
                  sx={selectSx}
                >
                  <MenuItem value="newest">Newest first</MenuItem>
                  <MenuItem value="oldest">Oldest first</MenuItem>
                  <MenuItem value="status">By status</MenuItem>
                  <MenuItem value="list">By form type</MenuItem>
                </Select>
              </FormControl>

              {isAdmin && (
                <>
                  <TextField
                    placeholder="Filter by submitter email..."
                    value={filters.submitter}
                    onChange={(e) => patch({ submitter: e.target.value })}
                    size="small"
                    sx={searchFieldSx}
                  />

                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, minWidth: 0 }}>
                    <TextField
                      label="Submitted from"
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => patch({ dateFrom: e.target.value })}
                      size="small"
                      sx={searchFieldSx}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                    <TextField
                      label="Submitted to"
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => patch({ dateTo: e.target.value })}
                      size="small"
                      sx={searchFieldSx}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </Box>
                </>
              )}
            </Box>

            <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px dashed ${editorial.border}` }}>
              <Typography sx={SECTION_LABEL_SX}>
                {filters.formType
                  ? `Only in ${filters.formType}${filters.formVersion ? ` v${filters.formVersion}` : ""}`
                  : "One form's own fields"}
              </Typography>

              {!filters.formType ? (
                <Typography sx={{ mt: 1, fontSize: "0.85rem", color: editorial.muted }}>
                  Pick a form above to narrow to a profile and version, then filter by the questions that version
                  asked — dates, titles, times, numbers, ratings, choices.
                </Typography>
              ) : (
                <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                  {/* Profile, then version, then that version's own questions. */}
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                      gap: 2,
                      maxWidth: { sm: 660 },
                    }}
                  >
                    <FormControl size="small" sx={{ minWidth: 0 }}>
                      <InputLabel>Profile</InputLabel>
                      <Select
                        value={filters.publishProfile}
                        label="Profile"
                        onChange={(e) => setFilters(applyPublishProfileChange(filters, e.target.value))}
                        sx={selectSx}
                      >
                        <MenuItem value="">All profiles</MenuItem>
                        {publishProfileOptions.map((profile) => (
                          <MenuItem key={profile} value={profile}>
                            {profile}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 0 }} disabled={!formVersionOptions.length}>
                      <InputLabel>Version</InputLabel>
                      <Select
                        value={filters.formVersion}
                        label="Version"
                        onChange={(e) => setFilters(applyFormVersionChange(filters, e.target.value))}
                        sx={selectSx}
                      >
                        <MenuItem value="">
                          {formVersionOptions.length ? "All versions" : "No versions yet"}
                        </MenuItem>
                        {formVersionOptions.map((option) => (
                          <MenuItem key={option.version} value={option.version}>
                            v{option.version}
                            {option.count > 0 && (
                              <Box component="span" sx={{ ml: 0.75, color: editorial.softMuted, fontVariantNumeric: "tabular-nums" }}>
                                ({option.count})
                              </Box>
                            )}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>

                  {filters.fieldFilters.map((fieldFilter) => (
                    <FieldConditionRow
                      key={fieldFilter.id}
                      filter={fieldFilter}
                      field={fieldByKey.get(fieldFilter.key)}
                      onChange={updateFieldFilter}
                      onRemove={() => removeFieldFilter(fieldFilter.id)}
                    />
                  ))}

                  <AddFieldCondition
                    fields={fieldCatalog}
                    onAdd={(fieldFilter) => patch({ fieldFilters: [...filters.fieldFilters, fieldFilter] })}
                  />

                  {!fieldCatalog.length && (
                    <Typography sx={{ fontSize: "0.8rem", color: editorial.muted }}>
                      No filterable questions found for this selection yet — its published schema loads with the
                      submissions.
                    </Typography>
                  )}
                </Stack>
              )}
            </Box>

            {(isAdmin || canExportSubmissions) && (
              <Box
                sx={{
                  mt: 2,
                  display: "flex",
                  alignItems: { xs: "stretch", sm: "center" },
                  justifyContent: "space-between",
                  gap: 1.5,
                  flexDirection: { xs: "column", sm: "row" },
                }}
              >
                {isAdmin ? (
                  <Chip
                    icon={<AdminIcon />}
                    label="Admin - all users visible"
                    size="small"
                    sx={{
                      justifySelf: { xs: "stretch", lg: "end" },
                      width: { xs: "100%", lg: "auto" },
                      backgroundColor: editorial.purpleWash,
                      color: editorial.pmwPurpleDark,
                      border: `1px solid ${editorial.pmwPurpleSoft}`,
                      fontWeight: 800,
                      fontSize: "0.75rem",
                      height: 32,
                      "& .MuiChip-icon": {
                        color: editorial.pmwPurpleDark,
                      },
                    }}
                  />
                ) : (
                  <Box />
                )}

                {canExportSubmissions && (
                  <Button
                    variant="outlined"
                    startIcon={<FileDownloadIcon />}
                    onClick={onOpenExport}
                    sx={{
                      minHeight: 40,
                      borderRadius: "10px",
                      px: 1.5,
                      color: editorial.pmwBlueDark,
                      borderColor: editorial.pmwBlueSoft,
                      backgroundColor: editorial.white,
                      fontWeight: 800,
                      textTransform: "none",
                      transition: "background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease",
                      "&:hover": {
                        backgroundColor: editorial.blueWash,
                        borderColor: editorial.pmwBlue,
                      },
                      "&:active": {
                        transform: "scale(0.96)",
                      },
                    }}
                  >
                    Export submissions
                  </Button>
                )}
              </Box>
            )}
          </Box>
        </Collapse>

        {hasFilters && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, pt: 1, flexWrap: "wrap" }}>
            <FilterListIcon sx={{ fontSize: 18, color: editorial.muted }} />
            <Chip
              label={`Showing ${filtered} of ${total} submissions`}
              size="small"
              sx={{
                backgroundColor: editorial.blueWash,
                color: editorial.pmwBlueDark,
                border: `1px solid ${editorial.pmwBlueSoft}`,
                fontWeight: 800,
                fontSize: "0.75rem",
                height: 32,
                fontVariantNumeric: "tabular-nums",
              }}
            />

            {chips.map((chip) => (
              <Chip
                key={chip.key}
                label={chip.label}
                size="small"
                onDelete={chip.onDelete}
                sx={{
                  maxWidth: 280,
                  backgroundColor: editorial.white,
                  color: editorial.ink,
                  border: `1px solid ${editorial.border}`,
                  fontWeight: 700,
                  fontSize: "0.75rem",
                  height: 32,
                }}
              />
            ))}

            <Button
              size="small"
              variant="text"
              startIcon={<ClearFiltersIcon />}
              onClick={clearFilters}
              sx={{
                color: editorial.pmwBlueDark,
                fontWeight: 800,
                textTransform: "none",
                minHeight: 32,
                px: 1,
                "&:hover": {
                  backgroundColor: editorial.blueWash,
                },
              }}
            >
              Clear filters
            </Button>
          </Box>
        )}
      </Stack>
    </Box>
  );
}

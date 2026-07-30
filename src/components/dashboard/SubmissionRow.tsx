import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  ChevronRight as ChevronRightIcon,
  DeleteOutlined as DeleteIcon,
  LayersOutlined as LayersIcon,
  NumbersOutlined as NumbersIcon,
  VisibilityOutlined as ViewIcon,
} from "@mui/icons-material";
import type { KeyboardEvent, MouseEvent } from "react";
import type { Submission, ListMetaEntry } from "../../types";
import ListBadge from "./ListBadge";
import StatusBadge from "./StatusBadge";
import { editorial, editorialShadow, editorialShadowHover } from "../../theme/editorial";
import {
  formatDashboardDate,
  formatDashboardTime,
  getSubmittedByDisplayName,
  getFormReference,
  getSubmissionDisplayTitle,
} from "../../utils/submissionDisplay";

interface SubmissionRowProps {
  item: Submission;
  onView: (item: Submission) => void;
  onDelete?: (item: Submission) => void;
  isAdmin: boolean;
  canDelete?: boolean;
  isDeleting?: boolean;
  listMetaMap: Record<string, ListMetaEntry>;
}

export default function SubmissionRow({
  item,
  onView,
  onDelete,
  isAdmin,
  canDelete = false,
  isDeleting = false,
  listMetaMap,
}: SubmissionRowProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const meta = listMetaMap[item.listTitle] ?? {
    icon: "📋",
    color: editorial.ink,
    pale: editorial.blueWash,
    category: "General",
  };

  const displayTitle = getSubmissionDisplayTitle(item);
  const submitterDisplay = getSubmittedByDisplayName(item);
  const formReference = getFormReference(item);
  const submittedAt = formatDashboardDate(item.submittedAt);
  const submittedTime = formatDashboardTime(item.submittedAt);
  const statusKey = (item.formStatus ?? "").toLowerCase().replace(/[\s_-]/g, "");
  const layerOutcomeLabel = statusKey.includes("reject")
    ? "rejected"
    : statusKey === "fullyapproved" || statusKey === "completed" || statusKey === "approved"
      ? "complete"
      : "";
  const layerLabel =
    item.totalLayers > 1 && item.currentLayer !== undefined
      ? item.currentLayer > 0
        ? `Layer ${item.currentLayer}/${item.totalLayers}${layerOutcomeLabel ? ` ${layerOutcomeLabel}` : ""}`
        : `${item.totalLayers} layers`
      : null;
  const handleOpen = () => onView(item);
  const handleDelete = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDelete?.(item);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpen();
    }
  };
  const identityChipSx = {
    borderRadius: "8px",
    backgroundColor: editorial.blueWash,
    color: editorial.pmwBlueDark,
    border: `1px solid ${editorial.pmwBlueSoft}`,
    fontWeight: 800,
    fontSize: "0.7rem",
    height: 24,
    "& .MuiChip-icon": {
      color: editorial.pmwBlueDark,
    },
  } as const;
  const layerChipSx = {
    borderRadius: "8px",
    backgroundColor: editorial.purpleWash,
    color: editorial.pmwPurpleDark,
    border: `1px solid ${editorial.pmwPurpleSoft}`,
    fontWeight: 800,
    fontSize: "0.7rem",
    height: 24,
    "& .MuiChip-icon": {
      color: editorial.pmwPurpleDark,
    },
  } as const;

  if (isMobile) {
    return (
      <Box
        role="button"
        tabIndex={0}
        aria-label={`View submission ${displayTitle}`}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        sx={{
          backgroundColor: "rgba(255, 255, 255, 0.94)",
          borderRadius: "8px",
          boxShadow: editorialShadow,
          p: 2,
          mb: 2,
          cursor: "pointer",
          transition: "box-shadow 0.2s ease, transform 0.2s ease",
          "&:hover": {
            boxShadow: editorialShadowHover,
            transform: "translateY(-1px)",
          },
          "&:active": {
            transform: "scale(0.995)",
          },
          "&:focus-visible": {
            outline: `3px solid ${editorial.pmwBlueSoft}`,
            outlineOffset: 2,
          },
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body1" sx={{ fontWeight: 800, color: editorial.ink, mb: 0.5 }}>
              {displayTitle}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Chip icon={<NumbersIcon />} label={`Ref ${item.submissionId}`} size="small" sx={identityChipSx} />
              <Typography variant="caption" sx={{ color: editorial.muted }}>
                {submittedAt}
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
            {canDelete && (
              <Tooltip title="Delete submission and managed files">
                <span onClick={(event) => event.stopPropagation()}>
                  <IconButton
                    aria-label={`Delete submission ${displayTitle}`}
                    onClick={handleDelete}
                    disabled={isDeleting}
                    size="small"
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: "8px",
                      border: `1px solid rgba(198, 40, 40, 0.2)`,
                      backgroundColor: "rgba(198, 40, 40, 0.08)",
                      color: editorial.error,
                      transition: "background-color 0.18s ease, transform 0.18s ease",
                      "&:hover": {
                        backgroundColor: "rgba(198, 40, 40, 0.14)",
                      },
                      "&:active": {
                        transform: "scale(0.96)",
                      },
                    }}
                  >
                    {isDeleting ? <CircularProgress size={18} color="inherit" /> : <DeleteIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </span>
              </Tooltip>
            )}
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "8px",
                border: `1px solid ${editorial.pmwBlueSoft}`,
                backgroundColor: editorial.blueWash,
                color: editorial.pmwBlueDark,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ViewIcon sx={{ fontSize: 18 }} />
            </Box>
          </Stack>
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
          <ListBadge title={item.listTitle} color={meta.color} pale={meta.pale} />
          <StatusBadge status={item.formStatus} />
          {layerLabel && (
            <Chip icon={<LayersIcon />} label={layerLabel} size="small" sx={layerChipSx} />
          )}
        </Box>
        <Stack spacing={0.25}>
          <Typography variant="caption" sx={{ color: editorial.muted, display: "block" }}>
            {meta.category}{submittedTime ? ` · ${submittedTime}` : ""}
          </Typography>
          {isAdmin && (
            <Typography variant="caption" sx={{ color: editorial.muted, display: "block" }}>
              Submitted by {submitterDisplay}
            </Typography>
          )}
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={`View submission ${displayTitle}`}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      sx={{
        display: "grid",
        gridTemplateColumns: isAdmin
          ? "minmax(240px, 2fr) minmax(180px, 1.35fr) minmax(170px, 1.15fr) minmax(132px, 0.85fr) minmax(150px, 1fr) 88px"
          : "minmax(260px, 2.2fr) minmax(180px, 1.25fr) minmax(132px, 0.85fr) minmax(150px, 1fr) 40px",
        gap: 2,
        px: 2.5,
        py: 2,
        backgroundColor: "rgba(255, 255, 255, 0.92)",
        borderRadius: 0,
        borderBottom: `1px solid ${editorial.border}`,
        alignItems: "center",
        cursor: "pointer",
        transition: "background-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease",
        outline: "none",
        "&:hover": {
          backgroundColor: "#ffffff",
          boxShadow: "inset 3px 0 0 rgba(0, 120, 212, 0.55), 0 8px 22px rgba(0, 90, 158, 0.08)",
          transform: "translateY(-1px)",
        },
        "&:focus-visible": {
          backgroundColor: editorial.blueSoft,
          boxShadow: `inset 0 0 0 3px ${editorial.pmwBlueSoft}`,
        },
      }}
    >
      {/* Submission */}
      <Box>
        <Typography variant="body1" sx={{ fontWeight: 800, color: editorial.ink, mb: 0.5, textWrap: "balance" }}>
          {displayTitle}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <Chip icon={<NumbersIcon />} label={`Ref ${item.submissionId}`} size="small" sx={identityChipSx} />
          <Typography variant="caption" sx={{ color: editorial.muted }}>
            Form {formReference}
          </Typography>
        </Box>
      </Box>

      {/* Submitted By */}
      {isAdmin && (
        <Typography
          variant="body2"
          sx={{
            color: editorial.muted,
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {submitterDisplay}
        </Typography>
      )}

      {/* List */}
      <Box sx={{ minWidth: 0 }}>
        <ListBadge title={item.listTitle} color={meta.color} pale={meta.pale} />
        <Typography
          variant="caption"
          sx={{
            color: editorial.softMuted,
            display: "block",
            mt: 0.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {meta.category}
        </Typography>
      </Box>

      {/* Submitted */}
      <Box>
        <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 800 }}>
          {submittedAt}
        </Typography>
        {submittedTime && (
          <Typography variant="caption" sx={{ color: editorial.muted }}>
            {submittedTime}
          </Typography>
        )}
      </Box>

      {/* Status */}
      <Box>
        <StatusBadge status={item.formStatus} />
        {layerLabel && (
          <Chip icon={<LayersIcon />} label={layerLabel} size="small" sx={{ ...layerChipSx, mt: 0.75 }} />
        )}
      </Box>

      {/* Actions */}
      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end", alignItems: "center" }}>
        {canDelete && (
          <Tooltip title="Delete submission and managed files">
            <span onClick={(event) => event.stopPropagation()}>
              <IconButton
                aria-label={`Delete submission ${displayTitle}`}
                onClick={handleDelete}
                disabled={isDeleting}
                size="small"
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "8px",
                  color: editorial.error,
                  transition: "background-color 0.18s ease, transform 0.18s ease",
                  "&:hover": {
                    backgroundColor: "rgba(198, 40, 40, 0.1)",
                  },
                  "&:active": {
                    transform: "scale(0.96)",
                  },
                }}
              >
                {isDeleting ? <CircularProgress size={18} color="inherit" /> : <DeleteIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </span>
          </Tooltip>
        )}
        <ChevronRightIcon
          sx={{
            color: editorial.pmwBlueDark,
            fontSize: 20,
            transition: "transform 0.2s ease",
            ".MuiBox-root:hover &": {
              transform: "translateX(4px)",
            },
          }}
        />
      </Stack>
    </Box>
  );
}

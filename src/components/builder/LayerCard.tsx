/**
 * LayerCard.tsx - Single layer summary card for the layer config panel
 */
import { useState } from "react";
import { C } from "./constants";
import LockIcon from "@mui/icons-material/Lock";
import LinkIcon from "@mui/icons-material/Link";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { LayerConfigItem } from "../../types";

interface LayerCardProps {
  layer: LayerConfigItem;
  index: number;
  total: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  children: React.ReactNode;
  actionsDisabled?: boolean;
}

const TYPE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  approval: { bg: "#DBEAFE", color: "#1D4ED8", label: "Approval" },
  evaluation: { bg: C.greenPale, color: C.green, label: "Evaluation" },
};

const AUTH_ICON: Record<string, { icon: React.ReactNode; label: string }> = {
  "365": { icon: <LockIcon style={{ fontSize: 12 }} />, label: "365 Sign-in" },
  public: { icon: <LinkIcon style={{ fontSize: 12 }} />, label: "Public Link" },
};

export default function LayerCard({
  layer,
  index,
  total,
  expanded,
  onToggleExpand,
  onMoveUp,
  onMoveDown,
  onDelete,
  children,
  actionsDisabled,
}: LayerCardProps) {
  const [hoverDel, setHoverDel] = useState(false);
  const badge = TYPE_BADGE[layer.type] || TYPE_BADGE.approval;
  const auth = AUTH_ICON[layer.authMode] || AUTH_ICON["365"];
  const assigneeLabel =
    layer.assignee.type === "field-reference"
      ? `Field: ${layer.assignee.value || "—"}`
      : layer.assignee.type === "department-approver"
        ? `Dept: ${layer.assignee.value || "—"} -> ${layer.assignee.roleValue || "HOD"}`
      : layer.assignee.value || "No assignee";

  return (
    <div
      style={{
        border: `1px solid ${expanded ? C.purpleMid : C.border}`,
        borderRadius: 12,
        background: expanded ? C.white : C.offWhite,
        marginBottom: 8,
        overflow: "hidden",
        boxShadow: expanded ? "0 10px 24px rgba(16,16,16,0.07)" : "0 3px 10px rgba(16,16,16,0.04)",
        transition: "border-color .15s, box-shadow .15s, background .15s",
      }}
    >
      {/* Header row */}
      <div
        onClick={onToggleExpand}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 11px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {/* Layer number */}
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            flexShrink: 0,
            background: `linear-gradient(135deg,${C.purple},${C.purpleLight})`,
            color: C.white,
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {index + 1}
        </div>

        {/* Type badge */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: badge.color,
            background: badge.bg,
            borderRadius: 20,
            padding: "2px 8px",
            textTransform: "uppercase",
            letterSpacing: ".04em",
          }}
        >
          {badge.label}
        </span>

        {/* Auth mode icon */}
        <span style={{ fontSize: 12 }} title={auth.label}>
          {auth.icon}
        </span>

        {/* Title / assignee */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.textPrimary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {layer.title || `Layer ${index + 1}`}
          </div>
          <div style={{ fontSize: 10, color: C.textMuted }}>{assigneeLabel}</div>
        </div>

        {/* Move / delete buttons */}
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={onMoveUp}
            disabled={index === 0 || actionsDisabled}
            style={{
              width: 30,
              height: 30,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              background: C.white,
              color: index === 0 || actionsDisabled ? C.textMuted : C.textSecond,
              cursor: index === 0 || actionsDisabled ? "default" : "pointer",
              fontSize: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowUpwardIcon style={{ fontSize: 12 }} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1 || actionsDisabled}
            style={{
              width: 30,
              height: 30,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              background: C.white,
              color: index === total - 1 || actionsDisabled ? C.textMuted : C.textSecond,
              cursor: index === total - 1 || actionsDisabled ? "default" : "pointer",
              fontSize: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowDownwardIcon style={{ fontSize: 12 }} />
          </button>
          <button
            onClick={onDelete}
            disabled={actionsDisabled}
            onMouseEnter={() => !actionsDisabled && setHoverDel(true)}
            onMouseLeave={() => !actionsDisabled && setHoverDel(false)}
            style={{
              width: 30,
              height: 30,
              border: "none",
              borderRadius: 8,
              background: actionsDisabled ? C.offWhite : (hoverDel ? C.red : C.redPale),
              color: actionsDisabled ? C.textMuted : (hoverDel ? C.white : C.red),
              cursor: actionsDisabled ? "default" : "pointer",
              fontSize: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CloseIcon style={{ fontSize: 10 }} />
          </button>
        </div>

        {/* Expand chevron */}
        <div
          style={{
            fontSize: 10,
            color: C.textMuted,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform .15s",
          }}
        >
          <ExpandMoreIcon style={{ fontSize: 14 }} />
        </div>
      </div>

      {/* Expanded settings */}
      {expanded && (
        <div
          style={{
            padding: "0 11px 11px",
            borderTop: `1px solid ${C.border}`,
            animation: "fadeUp .15s ease",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

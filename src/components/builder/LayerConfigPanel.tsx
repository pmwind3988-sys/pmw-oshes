/**
 * LayerConfigPanel.tsx - Full layer sequence editor for the unified "Layers" tab
 */
import { useState, useEffect, useRef } from "react";
import { C } from "./constants";
import LockIcon from "@mui/icons-material/Lock";
import LinkIcon from "@mui/icons-material/Link";
import DescriptionIcon from "@mui/icons-material/Description";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import LayerCard from "./LayerCard";
import EvalElementPicker from "./EvalElementPicker";
import PublicLinkDisplay from "./PublicLinkDisplay";
import { validateLayerConfig } from "./layerValidation";
import { createDepartmentApproverAssignee, getDepartmentApproverLookupConfig } from "../../utils/departmentApproverLookup";
import type { LayerFieldOption } from "./layerValidation";
import type {
  LayerConfig,
  LayerConfigItem,
  ApprovalLayerConfig,
  EvaluationLayerConfig,
  EvaluationEmailSchedule,
  AuthMode,
  ConfirmationType,
  ManualBranch,
  LayerAssignee,
  DepartmentApproverLayerAssignee,
} from "../../types";

interface LayerConfigPanelProps {
  value: LayerConfig | null;
  onChange: (config: LayerConfig | null) => void;
  siteUsers: { email: string; name: string }[];
  formFields: LayerFieldOption[];
  slug: string;
}

const inp = {
  width: "100%",
  height: 40,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "0 10px",
  fontSize: 12,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  color: C.textPrimary,
  background: C.white,
  outline: "none",
};

const TOGGLE_BTN = (active: boolean): React.CSSProperties => ({
  flex: 1,
  minHeight: 40,
  border: `1px solid ${active ? C.purple : C.border}`,
  borderRadius: 6,
  background: active ? C.purplePale : C.white,
  color: active ? C.purple : C.textMuted,
  fontSize: 10,
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1.2,
  padding: "5px 7px",
  minWidth: 0,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  transition: "background-color .12s, border-color .12s, color .12s, transform .12s",
});

const SECTION_CARD: React.CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "10px 11px",
  boxShadow: "0 1px 2px rgba(26,31,43,0.04)",
};

function ValidationGlyph({ tone }: { tone: "ok" | "warn" | "err" }) {
  const color = tone === "err" ? C.red : tone === "warn" ? C.amber : C.green;
  const path = tone === "ok" ? "M7 12.5l3 3L17 8" : "M12 7v6M12 16.5v.2";
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={tone === "ok" ? "Workflow valid" : "Workflow needs attention"} style={{ width: 20, height: 20, flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="1.8" opacity="0.35">
        {tone !== "ok" && <animate attributeName="opacity" values="0.25;0.65;0.25" dur="1.8s" repeatCount="indefinite" />}
      </circle>
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="28" strokeDashoffset="28">
        <animate attributeName="stroke-dashoffset" values="28;0" dur="0.45s" fill="freeze" />
      </path>
    </svg>
  );
}

function WorkflowMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: "7px 8px",
      minWidth: 0,
    }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: C.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </div>
    </div>
  );
}

function isEmailProducingField(field: LayerFieldOption | undefined): boolean {
  if (!field) return false;
  return field.type === "email" || field.inputType === "email";
}

function fieldOptionLabel(field: LayerFieldOption): string {
  const title = field.title?.trim();
  const base = title && title !== field.name ? `${title} (${field.name})` : field.name;
  const tag = isEmailProducingField(field)
      ? "Email"
      : "Text";
  return `${base} - ${tag}`;
}

function departmentFieldOptionLabel(field: LayerFieldOption): string {
  const title = field.title?.trim();
  const base = title && title !== field.name ? `${title} (${field.name})` : field.name;
  const tag = field.type === "dropdown" || field.type === "radiogroup" ? "Choice" : "Field";
  return `${base} - ${tag}`;
}

function toUserAssignee(assignee: LayerAssignee): LayerAssignee {
  return { type: "user", value: assignee.type === "user" ? assignee.value : "" };
}

function toFieldReferenceAssignee(assignee: LayerAssignee): LayerAssignee {
  return { type: "field-reference", value: assignee.type === "field-reference" ? assignee.value : "" };
}

function toDepartmentApproverAssignee(assignee: LayerAssignee): DepartmentApproverLayerAssignee {
  return createDepartmentApproverAssignee(
    assignee.type === "department-approver" ? assignee.value : "",
    assignee.type === "department-approver" ? assignee : undefined,
  );
}

function DepartmentLookupSettings({
  assignee,
  formFields,
  onChange,
}: {
  assignee: DepartmentApproverLayerAssignee;
  formFields: LayerFieldOption[];
  onChange: (assignee: DepartmentApproverLayerAssignee) => void;
}) {
  const config = getDepartmentApproverLookupConfig(assignee);
  const patch = (next: Partial<DepartmentApproverLayerAssignee>) => {
    onChange({ ...assignee, ...next });
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 8,
      background: C.offWhite,
      borderRadius: 8,
      padding: "9px 10px",
      boxShadow: "inset 0 0 0 1px rgba(26,31,43,0.06)",
    }}>
      <div>
        <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, display: "block", marginBottom: 4 }}>
          Department field
        </label>
        <select
          value={assignee.value}
          onChange={e => patch({ value: e.target.value })}
          style={{ ...inp, height: 40 }}
        >
          <option value="">- Select department field -</option>
          {formFields.map(field => (
            <option key={field.name} value={field.name}>{departmentFieldOptionLabel(field)}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted }}>
          List name
          <input value={config.listName} onChange={e => patch({ listName: e.target.value })} style={{ ...inp, marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted }}>
          Role value
          <input value={config.roleValue} onChange={e => patch({ roleValue: e.target.value })} style={{ ...inp, marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted }}>
          Department column
          <input value={config.departmentColumn} onChange={e => patch({ departmentColumn: e.target.value })} style={{ ...inp, marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted }}>
          Email column
          <input value={config.emailColumn} onChange={e => patch({ emailColumn: e.target.value })} style={{ ...inp, marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted }}>
          Name column
          <input value={config.nameColumn} onChange={e => patch({ nameColumn: e.target.value })} style={{ ...inp, marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted }}>
          Role column
          <input value={config.roleColumn} onChange={e => patch({ roleColumn: e.target.value })} style={{ ...inp, marginTop: 4 }} />
        </label>
      </div>
      <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.45 }}>
        The submitted department must match the SharePoint directory value exactly.
      </div>
    </div>
  );
}

function FieldReferenceHint({ field }: { field: LayerFieldOption | undefined }) {
  if (!field || isEmailProducingField(field)) return null;
  return (
    <div style={{ fontSize: 10, color: C.amber, marginTop: 4, lineHeight: 1.45 }}>
      This field must submit a valid email address before a Microsoft 365 layer can start.
    </div>
  );
}

function ValidationPanel({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  const tone = errors.length > 0 ? "err" : warnings.length > 0 ? "warn" : "ok";
  const bg = tone === "err" ? C.redPale : tone === "warn" ? C.amberPale : C.greenPale;
  const fg = tone === "err" ? C.red : tone === "warn" ? C.amber : C.green;
  const title = tone === "err" ? "Workflow needs fixes" : tone === "warn" ? "Workflow has warnings" : "Workflow checks passed";
  const items = errors.length > 0 ? errors : warnings;

  return (
    <div style={{
      display: "flex",
      gap: 9,
      alignItems: "flex-start",
      background: bg,
      borderRadius: 10,
      padding: "9px 10px",
      marginBottom: 12,
      boxShadow: "0 1px 2px rgba(26,31,43,0.05)",
    }}>
      <ValidationGlyph tone={tone} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: fg, fontSize: 11, fontWeight: 800, marginBottom: items.length ? 4 : 0 }}>{title}</div>
        {items.slice(0, 4).map((item) => (
          <div key={item} style={{ color: C.textSecond, fontSize: 10, lineHeight: 1.45 }}>{item}</div>
        ))}
        {items.length > 4 && (
          <div style={{ color: C.textMuted, fontSize: 10, marginTop: 2 }}>+{items.length - 4} more</div>
        )}
      </div>
    </div>
  );
}

export default function LayerConfigPanel({
  value,
  onChange,
  siteUsers,
  formFields,
  slug,
}: LayerConfigPanelProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [condEnabled, setCondEnabled] = useState(!!value?.routing?.length);
  const [condField, setCondField] = useState(value?.routing?.[0]?.conditionField || "");
  const [condRules, setCondRules] = useState<{ when: string; skipLayers: number[] }[]>(
    value?.routing?.[0]?.rules?.map(r => ({ when: r.when, skipLayers: r.skipLayers || [] })) || [{ when: "", skipLayers: [] }]
  );
  const [evalPickerOpen, setEvalPickerOpen] = useState<number | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState<number | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [branchEnabled, setBranchEnabled] = useState(!!value?.manualBranches);
  const [branchExpanded, setBranchExpanded] = useState<Record<number, number>>({});
  const [branchEvalPicker, setBranchEvalPicker] = useState<string | null>(null);
  const [branchSearchAt, setBranchSearchAt] = useState<string | null>(null);
  const [branchSearchQ, setBranchSearchQ] = useState("");

  const layers = value?.layers || [];
  const branches = value?.manualBranches || [];
  const branchLayerCount = branches.reduce((count, branch) => count + branch.layers.length, 0);
  const activeLayerCount = branchEnabled ? branchLayerCount : layers.length;
  const validation = validateLayerConfig(value, formFields);

  // Close search dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const updateLayers = (newLayers: LayerConfigItem[]) => {
    // Re-number layers
    const renumbered = newLayers.map((l, i) => ({ ...l, layerNumber: i + 1 }));
    const routing = condEnabled && condField
      ? [{ conditionField: condField, rules: condRules.map(r => ({ when: r.when, skipLayers: r.skipLayers })) }]
      : undefined;
    onChange({ version: "1.0", layers: renumbered, routing, manualBranches: branches.length > 0 ? branches : undefined });
  };

  const addLayer = () => {
    if (branchEnabled) return;
    const next = layers.length + 1;
    const newLayer: ApprovalLayerConfig = {
      layerNumber: next,
      type: "approval",
      authMode: "365",
      assignee: { type: "user", value: "" },
      confirmationType: "signature",
      allowRejectionReason: true,
    };
    updateLayers([...layers, newLayer]);
    setExpandedIdx(layers.length);
  };

  const removeLayer = (idx: number) => {
    if (branchEnabled) return;
    updateLayers(layers.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
    else if (expandedIdx !== null && expandedIdx > idx) setExpandedIdx(expandedIdx - 1);
  };

  const moveLayer = (idx: number, dir: -1 | 1) => {
    if (branchEnabled) return;
    const target = idx + dir;
    if (target < 0 || target >= layers.length) return;
    const arr = [...layers];
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    updateLayers(arr);
    if (expandedIdx === idx) setExpandedIdx(target);
    else if (expandedIdx === target) setExpandedIdx(idx);
  };

  const patchLayer = (idx: number, patch: Record<string, unknown>) => {
    updateLayers(layers.map((l, i) => {
      if (i !== idx) return l;
      return { ...l, ...patch } as LayerConfigItem;
    }));
  };

  // ── Branch CRUD ────────────────────────────────────────────────────────────
  const updateBranches = (newBranches: ManualBranch[]) => {
    const routing = condEnabled && condField
      ? [{ conditionField: condField, rules: condRules.map(r => ({ when: r.when, skipLayers: r.skipLayers })) }]
      : undefined;
    onChange({ version: "1.0", layers, routing, manualBranches: newBranches.length > 0 ? newBranches : undefined });
  };

  const addBranch = () => updateBranches([...branches, { name: "", label: "", layers: [] }]);

  const removeBranch = (bi: number) => {
    updateBranches(branches.filter((_, i) => i !== bi));
    setBranchExpanded(prev => { const n = { ...prev }; delete n[bi]; return n; });
  };

  const updateBranchField = (bi: number, field: "name" | "label", val: string) => {
    updateBranches(branches.map((b, i) => i === bi ? { ...b, [field]: val } : b));
  };

  const addBranchLayer = (bi: number) => {
    const branch = branches[bi];
    const nextLayer: ApprovalLayerConfig = {
      layerNumber: branch.layers.length + 1,
      type: "approval",
      authMode: "365",
      assignee: { type: "user", value: "" },
      confirmationType: "signature",
      allowRejectionReason: true,
    };
    updateBranches(branches.map((b, i) => i !== bi ? b : { ...b, layers: [...b.layers, nextLayer] }));
    setBranchExpanded(prev => ({ ...prev, [bi]: branch.layers.length }));
  };

  const removeBranchLayer = (bi: number, li: number) => {
    updateBranches(branches.map((b, i) => i !== bi ? b : { ...b, layers: b.layers.filter((_, j) => j !== li) }));
    setBranchExpanded(prev => {
      const ce = prev[bi];
      if (ce === undefined) return prev;
      if (ce === li) { const n = { ...prev }; delete n[bi]; return n; }
      if (ce > li) return { ...prev, [bi]: ce - 1 };
      return prev;
    });
  };

  const moveBranchLayer = (bi: number, li: number, dir: -1 | 1) => {
    const branch = branches[bi];
    const target = li + dir;
    if (target < 0 || target >= branch.layers.length) return;
    updateBranches(branches.map((b, i) => {
      if (i !== bi) return b;
      const arr = [...b.layers];
      [arr[li], arr[target]] = [arr[target], arr[li]];
      return { ...b, layers: arr };
    }));
    setBranchExpanded(prev => {
      const ce = prev[bi];
      if (ce === li) return { ...prev, [bi]: target };
      if (ce === target) return { ...prev, [bi]: li };
      return prev;
    });
  };

  const patchBranchLayer = (bi: number, li: number, patch: Record<string, unknown>) => {
    updateBranches(branches.map((b, i) => i !== bi ? b : { ...b, layers: b.layers.map((l, j) => j === li ? { ...l, ...patch } as LayerConfigItem : l) }));
  };

  // Search suggestions for assignee
  const suggestions = searchQ
    ? siteUsers.filter(u => u.email.toLowerCase().includes(searchQ.toLowerCase()) || u.name.toLowerCase().includes(searchQ.toLowerCase())).slice(0, 5)
    : siteUsers.slice(0, 5);

  const branchSuggestions = branchSearchQ
    ? siteUsers.filter(u => u.email.toLowerCase().includes(branchSearchQ.toLowerCase()) || u.name.toLowerCase().includes(branchSearchQ.toLowerCase())).slice(0, 5)
    : siteUsers.slice(0, 5);

  const renderAssigneeEditor = (
    layer: LayerConfigItem,
    onAssigneeChange: (assignee: LayerAssignee) => void,
    search: {
      isOpen: boolean;
      open: () => void;
      close: () => void;
      setQuery: (query: string) => void;
      suggestions: { email: string; name: string }[];
    },
  ) => (
    <div>
      <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
        Assignee
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4, marginBottom: 6 }}>
        <button onClick={() => onAssigneeChange(toUserAssignee(layer.assignee))} style={TOGGLE_BTN(layer.assignee.type === "user")}>
          Fixed user
        </button>
        <button onClick={() => onAssigneeChange(toFieldReferenceAssignee(layer.assignee))} style={TOGGLE_BTN(layer.assignee.type === "field-reference")}>
          Form field email
        </button>
        <button onClick={() => onAssigneeChange(toDepartmentApproverAssignee(layer.assignee))} style={TOGGLE_BTN(layer.assignee.type === "department-approver")}>
          Department HOD
        </button>
      </div>

      {layer.assignee.type === "user" ? (
        <div ref={searchRef} style={{ position: "relative" }}>
          <input
            value={layer.assignee.value}
            onChange={e => {
              onAssigneeChange({ type: "user", value: e.target.value });
              search.setQuery(e.target.value);
            }}
            onFocus={search.open}
            placeholder="email@company.com"
            style={inp}
          />
          {search.isOpen && search.suggestions.length > 0 && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 3px)",
              left: 0,
              right: 0,
              zIndex: 200,
              background: C.white,
              border: `1px solid ${C.border}`,
              borderRadius: 9,
              boxShadow: C.shadowMd,
              overflow: "hidden",
            }}>
              {search.suggestions.map(u => (
                <div
                  key={u.email}
                  onClick={() => {
                    onAssigneeChange({ type: "user", value: u.email });
                    search.close();
                    search.setQuery("");
                  }}
                  style={{ padding: "7px 9px", cursor: "pointer", borderBottom: `1px solid ${C.border}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.purplePale}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ fontSize: 11, fontWeight: 500 }}>{u.name}</div>
                  <div style={{ fontSize: 9, color: C.textMuted }}>{u.email}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : layer.assignee.type === "field-reference" ? (
        <>
          <select
            value={layer.assignee.value}
            onChange={e => onAssigneeChange({ type: "field-reference", value: e.target.value })}
            style={{ ...inp, height: 40 }}
          >
            <option value="">- Select field -</option>
            {formFields.map(field => (
              <option key={field.name} value={field.name}>{fieldOptionLabel(field)}</option>
            ))}
          </select>
          <FieldReferenceHint field={formFields.find(field => field.name === layer.assignee.value)} />
        </>
      ) : (
        <DepartmentLookupSettings
          assignee={layer.assignee}
          formFields={formFields}
          onChange={onAssigneeChange}
        />
      )}
    </div>
  );

  const renderWorkflowRow = (label: string, rowLayers: LayerConfigItem[]) => (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 5, overflowX: "auto", paddingBottom: 2 }}>
        <div style={{
          minWidth: 58,
          borderRadius: 8,
          background: C.white,
          border: `1px solid ${C.border}`,
          padding: "6px 7px",
          fontSize: 10,
          fontWeight: 700,
          color: C.textSecond,
          textAlign: "center",
        }}>
          Submit
        </div>
        {rowLayers.map((layer, idx) => (
          <div key={`${label}-${idx}`} style={{
            minWidth: 82,
            borderRadius: 8,
            background: layer.type === "approval" ? C.purplePale : C.greenPale,
            border: `1px solid ${layer.type === "approval" ? C.purpleMid : "#6EE7B7"}`,
            padding: "6px 7px",
            color: C.textPrimary,
          }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: layer.type === "approval" ? C.purple : C.green, textTransform: "uppercase", letterSpacing: 0 }}>
              {layer.type}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {layer.title || `Layer ${idx + 1}`}
            </div>
          </div>
        ))}
        <div style={{
          minWidth: 62,
          borderRadius: 8,
          background: C.white,
          border: `1px solid ${C.border}`,
          padding: "6px 7px",
          fontSize: 10,
          fontWeight: 700,
          color: C.green,
          textAlign: "center",
        }}>
          Done
        </div>
      </div>
    </div>
  );

  const renderEvaluationEmailSchedule = (
    layer: EvaluationLayerConfig,
    onPatch: (patch: Partial<EvaluationLayerConfig>) => void,
  ) => {
    const schedule = layer.emailSchedule ?? { mode: "immediate" as const };
    const setMode = (mode: EvaluationEmailSchedule["mode"]) => {
      onPatch({
        emailSchedule: mode === "custom_days"
          ? { mode, customDays: Math.max(1, schedule.customDays ?? 30) }
          : { mode },
      });
    };
    return (
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 9, background: C.lightGray }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 5 }}>
          Evaluator Email Timing
        </label>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button onClick={() => setMode("immediate")} style={TOGGLE_BTN(schedule.mode === "immediate")}>
            Send right away
          </button>
          <button onClick={() => setMode("three_months")} style={TOGGLE_BTN(schedule.mode === "three_months")}>
            After 3 months
          </button>
          <button onClick={() => setMode("custom_days")} style={TOGGLE_BTN(schedule.mode === "custom_days")}>
            Custom delay
          </button>
        </div>
        {schedule.mode === "custom_days" && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 7 }}>
            <input
              type="number"
              min={1}
              step={1}
              value={schedule.customDays ?? 30}
              onChange={(event) => onPatch({
                emailSchedule: {
                  mode: "custom_days",
                  customDays: Math.max(1, Math.trunc(Number(event.target.value) || 1)),
                },
              })}
              style={{ ...inp, width: 92 }}
            />
            <span style={{ fontSize: 10, color: C.textSecond }}>days after this evaluation layer becomes active</span>
          </div>
        )}
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 5 }}>
          Admins and Form Builder Superusers can override the date for an individual submission.
        </div>
      </div>
    );
  };

  // ── Render per-layer settings ──────────────────────────────────────────────
  const renderLayerSettings = (layer: LayerConfigItem, idx: number) => {
    const isApproval = layer.type === "approval";
    const isEval = layer.type === "evaluation";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 9 }}>
        {/* Layer type toggle */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
            Layer Type
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => {
              if (isApproval) return;
              const converted: ApprovalLayerConfig = {
                layerNumber: layer.layerNumber,
                type: "approval",
                authMode: layer.authMode,
                assignee: layer.assignee,
                title: layer.title,
                description: layer.description,
                publicToken: layer.publicToken,
                tokenExpiresAt: layer.tokenExpiresAt,
                notifyOnComplete: layer.notifyOnComplete,
                confirmationType: "signature",
                allowRejectionReason: true,
              };
              patchLayer(idx, converted as unknown as Record<string, unknown>);
            }} style={TOGGLE_BTN(isApproval)}>Approval</button>
            <button onClick={() => {
              if (isEval) return;
              const converted: EvaluationLayerConfig = {
                layerNumber: layer.layerNumber,
                type: "evaluation",
                authMode: layer.authMode,
                assignee: layer.assignee,
                title: layer.title,
                description: layer.description,
                publicToken: layer.publicToken,
                tokenExpiresAt: layer.tokenExpiresAt,
                notifyOnComplete: layer.notifyOnComplete,
                surveyElements: [],
                emailSchedule: { mode: "immediate" },
              };
              patchLayer(idx, converted as unknown as Record<string, unknown>);
            }} style={TOGGLE_BTN(isEval)}>Evaluation</button>
          </div>
        </div>

        {/* Auth mode toggle */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
            Auth Mode
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => patchLayer(idx, { authMode: "365" as AuthMode })} style={TOGGLE_BTN(layer.authMode === "365")}>
              <LockIcon style={{ fontSize: 12, marginRight: 4 }} /> 365 Sign-in
            </button>
            <button onClick={() => {
              const patch: Partial<LayerConfigItem> & { publicToken?: string; tokenExpiresAt?: string } = { authMode: "public" as AuthMode };
              if (!layer.publicToken) patch.publicToken = crypto.randomUUID();
              if (!layer.tokenExpiresAt) {
                const d = new Date();
                d.setDate(d.getDate() + 30);
                patch.tokenExpiresAt = d.toISOString();
              }
              patchLayer(idx, patch);
            }} style={TOGGLE_BTN(layer.authMode === "public")}>
              <LinkIcon style={{ fontSize: 12, marginRight: 4 }} /> Public Link
            </button>
          </div>
          {layer.authMode === "public" && (
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
              Anyone with the link can access this layer without signing in.
            </div>
          )}
        </div>

        {renderAssigneeEditor(layer, (assignee) => patchLayer(idx, { assignee }), {
          isOpen: searchOpen === idx,
          open: () => setSearchOpen(idx),
          close: () => setSearchOpen(null),
          setQuery: setSearchQ,
          suggestions,
        })}

        {/* Approval-specific: confirmation type */}
        {isApproval && (
          <>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
                Confirmation Type
              </label>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => patchLayer(idx, { confirmationType: "signature" as ConfirmationType })}
                  style={TOGGLE_BTN((layer as ApprovalLayerConfig).confirmationType === "signature")}
                >
                  ✍️ Signature
                </button>
                <button
                  onClick={() => patchLayer(idx, { confirmationType: "checkbox" as ConfirmationType })}
                  style={TOGGLE_BTN((layer as ApprovalLayerConfig).confirmationType === "checkbox")}
                >
                  ☑️ Checkbox
                </button>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textSecond }}>
              <input
                type="checkbox"
                checked={(layer as ApprovalLayerConfig).allowRejectionReason}
                onChange={e => patchLayer(idx, { allowRejectionReason: e.target.checked })}
                style={{ width: 14, height: 14, accentColor: C.purple }}
              />
              Show rejection reason
            </label>
          </>
        )}

        {/* Evaluation-specific: configure form */}
        {isEval && (
          <div>
            {renderEvaluationEmailSchedule(
              layer as EvaluationLayerConfig,
              (patch) => patchLayer(idx, patch),
            )}
            {evalPickerOpen === idx ? (
              <EvalElementPicker
                elements={(layer as EvaluationLayerConfig).surveyElements || []}
                onChange={els => patchLayer(idx, { surveyElements: els })}
              />
            ) : (
              <button
                onClick={() => setEvalPickerOpen(idx)}
                style={{
                  width: "100%",
                  height: 30,
                  border: `1px dashed ${C.purpleMid}`,
                  borderRadius: 7,
                  background: "none",
                  color: C.purple,
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                }}
              >
                <DescriptionIcon style={{ fontSize: 12, marginRight: 4 }} /> Configure Evaluation Form ({((layer as EvaluationLayerConfig).surveyElements || []).length} fields)
              </button>
            )}
            {evalPickerOpen === idx && (
              <button
                onClick={() => setEvalPickerOpen(null)}
                style={{
                  fontSize: 10,
                  color: C.textMuted,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  marginTop: 4,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                }}
              >
                Done
              </button>
            )}
          </div>
        )}

        {/* Title & description */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
            Layer Title
          </label>
          <input
            value={layer.title || ""}
            onChange={e => patchLayer(idx, { title: e.target.value })}
            placeholder={`Layer ${idx + 1}`}
            style={inp}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
            Description
          </label>
          <input
            value={layer.description || ""}
            onChange={e => patchLayer(idx, { description: e.target.value })}
            placeholder="Optional description"
            style={inp}
          />
        </div>

        {/* Public link display */}
        {layer.authMode === "public" && (
          <PublicLinkDisplay
            slug={slug}
            publicToken={layer.publicToken || ""}
            tokenExpiresAt={layer.tokenExpiresAt || ""}
            onTokenChange={t => patchLayer(idx, { publicToken: t })}
            onExpiryChange={d => patchLayer(idx, { tokenExpiresAt: d })}
          />
        )}
      </div>
    );
  };

  // ── Render per-branch-layer settings ────────────────────────────────────────
  const renderBranchLayerSettings = (layer: LayerConfigItem, bi: number, li: number) => {
    const isApproval = layer.type === "approval";
    const isEval = layer.type === "evaluation";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 9 }}>
        {/* Layer type toggle */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
            Layer Type
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => {
              if (isApproval) return;
              const converted: ApprovalLayerConfig = {
                layerNumber: layer.layerNumber,
                type: "approval",
                authMode: layer.authMode,
                assignee: layer.assignee,
                title: layer.title,
                description: layer.description,
                publicToken: layer.publicToken,
                tokenExpiresAt: layer.tokenExpiresAt,
                notifyOnComplete: layer.notifyOnComplete,
                confirmationType: "signature",
                allowRejectionReason: true,
              };
              patchBranchLayer(bi, li, converted as unknown as Record<string, unknown>);
            }} style={TOGGLE_BTN(isApproval)}>Approval</button>
            <button onClick={() => {
              if (isEval) return;
              const converted: EvaluationLayerConfig = {
                layerNumber: layer.layerNumber,
                type: "evaluation",
                authMode: layer.authMode,
                assignee: layer.assignee,
                title: layer.title,
                description: layer.description,
                publicToken: layer.publicToken,
                tokenExpiresAt: layer.tokenExpiresAt,
                notifyOnComplete: layer.notifyOnComplete,
                surveyElements: [],
                emailSchedule: { mode: "immediate" },
              };
              patchBranchLayer(bi, li, converted as unknown as Record<string, unknown>);
            }} style={TOGGLE_BTN(isEval)}>Evaluation</button>
          </div>
        </div>

        {/* Auth mode toggle */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
            Auth Mode
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => patchBranchLayer(bi, li, { authMode: "365" as AuthMode })} style={TOGGLE_BTN(layer.authMode === "365")}>
              <LockIcon style={{ fontSize: 12, marginRight: 4 }} /> 365 Sign-in
            </button>
            <button onClick={() => {
              const patch: Partial<LayerConfigItem> & { publicToken?: string; tokenExpiresAt?: string } = { authMode: "public" as AuthMode };
              if (!layer.publicToken) patch.publicToken = crypto.randomUUID();
              if (!layer.tokenExpiresAt) {
                const d = new Date();
                d.setDate(d.getDate() + 30);
                patch.tokenExpiresAt = d.toISOString();
              }
              patchBranchLayer(bi, li, patch);
            }} style={TOGGLE_BTN(layer.authMode === "public")}>
              <LinkIcon style={{ fontSize: 12, marginRight: 4 }} /> Public Link
            </button>
          </div>
          {layer.authMode === "public" && (
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
              Anyone with the link can access this layer without signing in.
            </div>
          )}
        </div>

        {renderAssigneeEditor(layer, (assignee) => patchBranchLayer(bi, li, { assignee }), {
          isOpen: branchSearchAt === `${bi}-${li}`,
          open: () => setBranchSearchAt(`${bi}-${li}`),
          close: () => setBranchSearchAt(null),
          setQuery: setBranchSearchQ,
          suggestions: branchSuggestions,
        })}

        {/* Approval-specific: confirmation type */}
        {isApproval && (
          <>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
                Confirmation Type
              </label>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => patchBranchLayer(bi, li, { confirmationType: "signature" as ConfirmationType })}
                  style={TOGGLE_BTN((layer as ApprovalLayerConfig).confirmationType === "signature")}
                >
                  ✍️ Signature
                </button>
                <button
                  onClick={() => patchBranchLayer(bi, li, { confirmationType: "checkbox" as ConfirmationType })}
                  style={TOGGLE_BTN((layer as ApprovalLayerConfig).confirmationType === "checkbox")}
                >
                  ☑️ Checkbox
                </button>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textSecond }}>
              <input
                type="checkbox"
                checked={(layer as ApprovalLayerConfig).allowRejectionReason}
                onChange={e => patchBranchLayer(bi, li, { allowRejectionReason: e.target.checked })}
                style={{ width: 14, height: 14, accentColor: C.purple }}
              />
              Show rejection reason
            </label>
          </>
        )}

        {/* Evaluation-specific: configure form */}
        {isEval && (
          <div>
            {renderEvaluationEmailSchedule(
              layer as EvaluationLayerConfig,
              (patch) => patchBranchLayer(bi, li, patch),
            )}
            {branchEvalPicker === `${bi}-${li}` ? (
              <EvalElementPicker
                elements={(layer as EvaluationLayerConfig).surveyElements || []}
                onChange={els => patchBranchLayer(bi, li, { surveyElements: els })}
              />
            ) : (
              <button
                onClick={() => setBranchEvalPicker(`${bi}-${li}`)}
                style={{
                  width: "100%",
                  height: 30,
                  border: `1px dashed ${C.purpleMid}`,
                  borderRadius: 7,
                  background: "none",
                  color: C.purple,
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                }}
              >
                <DescriptionIcon style={{ fontSize: 12, marginRight: 4 }} /> Configure Evaluation Form ({((layer as EvaluationLayerConfig).surveyElements || []).length} fields)
              </button>
            )}
            {branchEvalPicker === `${bi}-${li}` && (
              <button
                onClick={() => setBranchEvalPicker(null)}
                style={{
                  fontSize: 10,
                  color: C.textMuted,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  marginTop: 4,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                }}
              >
                Done
              </button>
            )}
          </div>
        )}

        {/* Title & description */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
            Layer Title
          </label>
          <input
            value={layer.title || ""}
            onChange={e => patchBranchLayer(bi, li, { title: e.target.value })}
            placeholder={`Layer ${li + 1}`}
            style={inp}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
            Description
          </label>
          <input
            value={layer.description || ""}
            onChange={e => patchBranchLayer(bi, li, { description: e.target.value })}
            placeholder="Optional description"
            style={inp}
          />
        </div>

        {/* Public link display */}
        {layer.authMode === "public" && (
          <PublicLinkDisplay
            slug={slug}
            publicToken={layer.publicToken || ""}
            tokenExpiresAt={layer.tokenExpiresAt || ""}
            onTokenChange={t => patchBranchLayer(bi, li, { publicToken: t })}
            onExpiryChange={d => patchBranchLayer(bi, li, { tokenExpiresAt: d })}
          />
        )}
      </div>
    );
  };

  // ── Conditional routing section ────────────────────────────────────────────
  const renderConditionalRouting = () => (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.textPrimary,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        Conditional Routing
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={condEnabled}
          onChange={e => {
            setCondEnabled(e.target.checked);
            if (!e.target.checked) {
              // Persist the removal
              const routing = undefined;
              onChange({ version: "1.0", layers, routing, manualBranches: branches.length > 0 ? branches : undefined });
            }
          }}
          style={{ width: 16, height: 16, accentColor: C.purple }}
        />
        <span style={{ fontSize: 11, color: C.textSecond }}>
          {condEnabled ? "Enabled" : "Disabled — all layers always active"}
        </span>
      </label>

      {condEnabled && (
        <>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>
              Condition field name
            </label>
            <input
              value={condField}
              onChange={e => setCondField(e.target.value)}
              placeholder="subject"
              style={inp}
            />
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
            Rules ({condRules.length})
          </div>

          {condRules.map((rule, ri) => (
            <div
              key={ri}
              style={{
                background: C.offWhite,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "8px 10px",
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>When =</span>
                <input
                  value={rule.when}
                  onChange={e => {
                    const next = condRules.map((r, i) => i === ri ? { ...r, when: e.target.value } : r);
                    setCondRules(next);
                  }}
                  placeholder="value"
                  style={{ ...inp, flex: 1, height: 26, fontSize: 11 }}
                />
                <button
                  onClick={() => setCondRules(condRules.filter((_, i) => i !== ri))}
                  style={{
                    width: 20,
                    height: 20,
                    border: "none",
                    background: C.redPale,
                    color: C.red,
                    borderRadius: 5,
                    cursor: "pointer",
                    fontSize: 10,
                    flexShrink: 0,
                  }}
                >
                  <CloseIcon style={{ fontSize: 14 }} />
                </button>
              </div>
              <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 4 }}>Skip layers:</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {layers.map((l, li) => (
                  <label
                    key={li}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: 10,
                      color: rule.skipLayers.includes(l.layerNumber) ? C.purple : C.textMuted,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={rule.skipLayers.includes(l.layerNumber)}
                      onChange={e => {
                        const skip = e.target.checked
                          ? [...rule.skipLayers, l.layerNumber]
                          : rule.skipLayers.filter(n => n !== l.layerNumber);
                        const next = condRules.map((r, i) => i === ri ? { ...r, skipLayers: skip } : r);
                        setCondRules(next);
                      }}
                      style={{ width: 12, height: 12, accentColor: C.purple }}
                    />
                    L{l.layerNumber}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={() => setCondRules([...condRules, { when: "", skipLayers: [] }])}
            style={{
              width: "100%",
              height: 26,
              border: `1px dashed ${C.border}`,
              borderRadius: 7,
              background: "none",
              color: C.purple,
              fontSize: 10,
              cursor: "pointer",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            }}
          >
            + Add rule
          </button>
        </>
      )}
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{ animation: "fadeUp .15s ease" }}>
      <div style={{
        background: C.offWhite,
        border: `1px solid ${C.border}`,
        borderRadius: 11,
        padding: "11px 12px",
        marginBottom: 12,
        boxShadow: "0 8px 20px rgba(16,16,16,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <AccountTreeIcon style={{ fontSize: 16, color: C.purple, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.textPrimary, marginBottom: 2 }}>Workflow map</div>
            <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.55 }}>
              Review paths, then expand a step below to edit assignee, auth mode, confirmation, and evaluation fields.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: C.green, whiteSpace: "nowrap" }}>
            <CheckCircleIcon style={{ fontSize: 13 }} />
            {branchEnabled ? `${branches.length} branch${branches.length === 1 ? "" : "es"}` : `${layers.length} layer${layers.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, marginTop: 10 }}>
          <WorkflowMetric label="Mode" value={branchEnabled ? "Branch" : "Linear"} />
          <WorkflowMetric label="Paths" value={branchEnabled ? String(branches.length) : "1"} />
          <WorkflowMetric label="Steps" value={String(activeLayerCount)} />
        </div>
        {branchEnabled && branches.length > 0
          ? branches.map((branch, bi) => renderWorkflowRow(branch.label || branch.name || `Branch ${bi + 1}`, branch.layers))
          : renderWorkflowRow("Main sequence", layers)}
      </div>

      <ValidationPanel errors={validation.errors} warnings={validation.warnings} />

      {/* Layer cards */}
      {layers.length === 0 && (
        <div
          style={{
            background: C.amberPale,
            border: "1px solid #FDE68A",
            borderRadius: 8,
            padding: "9px 11px",
            fontSize: 11,
            color: C.amber,
            marginBottom: 10,
          }}
        >
          No layers — submissions go straight to Submitted.
        </div>
      )}

      {layers.map((layer, idx) => (
        <LayerCard
          key={idx}
          layer={layer}
          index={idx}
          total={layers.length}
          expanded={expandedIdx === idx}
          onToggleExpand={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
          onMoveUp={() => moveLayer(idx, -1)}
          onMoveDown={() => moveLayer(idx, 1)}
          onDelete={() => removeLayer(idx)}
          actionsDisabled={branchEnabled}
        >
          {renderLayerSettings(layer, idx)}
        </LayerCard>
      ))}

      {/* Add layer button — disabled when manual branching is on */}
      <button
        onClick={addLayer}
        style={{
          width: "100%",
          height: 32,
          border: `1px dashed ${branchEnabled ? C.border : C.purpleMid}`,
          borderRadius: 8,
          background: branchEnabled ? C.offWhite : "none",
          color: branchEnabled ? C.textMuted : C.purple,
          fontSize: 11,
          fontWeight: 600,
          cursor: branchEnabled ? "not-allowed" : "pointer",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          marginBottom: 14,
        }}
      >
        + Add Layer
      </button>

      {/* Manual Branching */}
      <div style={{ ...SECTION_CARD, marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.textPrimary, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
              Approval branches
            </div>
            <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.45 }}>
              Use separate paths for managerial and non-managerial submissions.
            </div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 800, color: branchEnabled ? C.green : C.textMuted, background: branchEnabled ? C.greenPale : C.offWhite, border: `1px solid ${branchEnabled ? C.green : C.border}`, borderRadius: 999, padding: "3px 7px", whiteSpace: "nowrap" }}>
            {branchEnabled ? "On" : "Off"}
          </span>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 10px", cursor: "pointer" }}>
          <input type="checkbox" checked={branchEnabled}
            onChange={e => {
              setBranchEnabled(e.target.checked);
              if (!e.target.checked) {
                const routing = condEnabled && condField
                  ? [{ conditionField: condField, rules: condRules.map(r => ({ when: r.when, skipLayers: r.skipLayers })) }]
                  : undefined;
                onChange({ version: "1.0", layers, routing });
              } else if (!branches.length) {
                const routing = condEnabled && condField
                  ? [{ conditionField: condField, rules: condRules.map(r => ({ when: r.when, skipLayers: r.skipLayers })) }]
                  : undefined;
                onChange({ version: "1.0", layers, routing, manualBranches: [] });
              }
            }}
            style={{ width: 16, height: 16, accentColor: C.purple }} />
          <span style={{ fontSize: 11, color: C.textSecond, fontWeight: 650 }}>Enable branch-specific approval paths</span>
        </label>
        {branchEnabled && (
          <>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
              Branch layers override the main sequence. Each branch can still reference the same HOD or manager email field.
            </div>
            {branches.length === 0 && (
              <div style={{ background: C.amberPale, border: "1px solid #FDE68A", borderRadius: 8, padding: "9px 11px", fontSize: 11, color: C.amber, marginBottom: 10 }}>
                No branches defined — add a branch to get started.
              </div>
            )}
            {branches.map((branch, bi) => (
              <div key={bi} style={{ border: `1px solid ${C.purpleMid}`, borderRadius: 10, background: C.white, marginBottom: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", background: C.purplePale, borderBottom: `1px solid ${C.purpleMid}` }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, background: `linear-gradient(135deg,${C.purple},#3B0764)`, color: C.white, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{bi + 1}</span>
                  <div style={{ flex: 1, display: "flex", gap: 6 }}>
                    <input value={branch.name} onChange={e => updateBranchField(bi, "name", e.target.value)} placeholder="Branch name (key)" style={{ ...inp, flex: 1, height: 26, fontSize: 11 }} />
                    <input value={branch.label} onChange={e => updateBranchField(bi, "label", e.target.value)} placeholder="Display label" style={{ ...inp, flex: 1, height: 26, fontSize: 11 }} />
                  </div>
                  <button onClick={() => removeBranch(bi)} style={{ width: 22, height: 22, border: "none", borderRadius: 5, background: C.redPale, color: C.red, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><CloseIcon style={{ fontSize: 10 }} /></button>
                </div>
                <div style={{ padding: "9px 11px" }}>
                  {branch.layers.length === 0 && <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 8 }}>No layers in this branch.</div>}
                  {branch.layers.map((layer, li) => (
                    <LayerCard key={li} layer={layer} index={li} total={branch.layers.length}
                      expanded={branchExpanded[bi] === li}
                      onToggleExpand={() => setBranchExpanded(prev => {
                        const c = prev[bi];
                        if (c === li) { const n = { ...prev }; delete n[bi]; return n; }
                        return { ...prev, [bi]: li };
                      })}
                      onMoveUp={() => moveBranchLayer(bi, li, -1)}
                      onMoveDown={() => moveBranchLayer(bi, li, 1)}
                      onDelete={() => removeBranchLayer(bi, li)}>
                      {renderBranchLayerSettings(layer, bi, li)}
                    </LayerCard>
                  ))}
                  <button onClick={() => addBranchLayer(bi)}
                    style={{ width: "100%", height: 28, border: `1px dashed ${C.purpleMid}`, borderRadius: 7, background: "none", color: C.purple, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" }}>
                    + Add Layer to Branch
                  </button>
                </div>
              </div>
            ))}
            <button onClick={addBranch}
              style={{ width: "100%", height: 30, border: `1px dashed ${C.purpleMid}`, borderRadius: 8, background: "none", color: C.purple, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", marginBottom: 14 }}>
              + Add Branch
            </button>
          </>
        )}
      </div>

      {/* Conditional routing */}
      {renderConditionalRouting()}
    </div>
  );
}

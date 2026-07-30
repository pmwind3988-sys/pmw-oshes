/**
 * EvalElementPicker.tsx — Detailed evaluation form field editor
 * with MUI icons, expandable property panels, and type-specific settings.
 */
import { useState, useMemo } from "react";
import { C } from "./constants";
import { QUESTION_TYPES } from "../../utils/FormBuilderEngine";

// ── MUI Icons ──────────────────────────────────────────────────────────
import TextFieldsIcon from "@mui/icons-material/TextFields";
import NumbersIcon from "@mui/icons-material/Numbers";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CommentIcon from "@mui/icons-material/Comment";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import EmailIcon from "@mui/icons-material/Email";
import LinkIcon from "@mui/icons-material/Link";
import PhoneIcon from "@mui/icons-material/Phone";
import LockIcon from "@mui/icons-material/Lock";
import ArrowDropDownCircleIcon from "@mui/icons-material/ArrowDropDownCircle";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import StarRateIcon from "@mui/icons-material/StarRate";
import GestureIcon from "@mui/icons-material/Gesture";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import BadgeIcon from "@mui/icons-material/Badge";
import ArticleIcon from "@mui/icons-material/Article";
import TableChartIcon from "@mui/icons-material/TableChart";
import TableRowsIcon from "@mui/icons-material/TableRows";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import WarningIcon from "@mui/icons-material/Warning";

import TimelapseIcon from "@mui/icons-material/Timelapse";
import CalculateIcon from "@mui/icons-material/Calculate";
import PlusOneIcon from "@mui/icons-material/PlusOne";
import LinearScaleIcon from "@mui/icons-material/LinearScale";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import PaletteIcon from "@mui/icons-material/Palette";
import DialpadIcon from "@mui/icons-material/Dialpad";
import PlaylistAddCheckIcon from "@mui/icons-material/PlaylistAddCheck";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  text: <TextFieldsIcon sx={{ fontSize: 16 }} />,
  number: <NumbersIcon sx={{ fontSize: 16 }} />,
  boolean: <CheckCircleIcon sx={{ fontSize: 16 }} />,
  comment: <CommentIcon sx={{ fontSize: 16 }} />,
  date: <CalendarTodayIcon sx={{ fontSize: 16 }} />,
  datetime: <AccessTimeIcon sx={{ fontSize: 16 }} />,
  email: <EmailIcon sx={{ fontSize: 16 }} />,
  url: <LinkIcon sx={{ fontSize: 16 }} />,
  tel: <PhoneIcon sx={{ fontSize: 16 }} />,
  password: <LockIcon sx={{ fontSize: 16 }} />,
  dropdown: <ArrowDropDownCircleIcon sx={{ fontSize: 16 }} />,
  radiogroup: <RadioButtonCheckedIcon sx={{ fontSize: 16 }} />,
  checkbox: <CheckBoxIcon sx={{ fontSize: 16 }} />,
  buttongroup: <RadioButtonCheckedIcon sx={{ fontSize: 16 }} />,
  currency: <AttachMoneyIcon sx={{ fontSize: 16 }} />,
  rating: <StarRateIcon sx={{ fontSize: 16 }} />,
  signaturepad: <GestureIcon sx={{ fontSize: 16 }} />,
  file: <AttachFileIcon sx={{ fontSize: 16 }} />,
  imageupload: <AddPhotoAlternateIcon sx={{ fontSize: 16 }} />,
  nric: <BadgeIcon sx={{ fontSize: 16 }} />,
  consent: <ArticleIcon sx={{ fontSize: 16 }} />,
  dynamicmatrix: <TableChartIcon sx={{ fontSize: 16 }} />,
  tableinput: <TableRowsIcon sx={{ fontSize: 16 }} />,
  ranking: <FormatListNumberedIcon sx={{ fontSize: 16 }} />,
  hierarchy: <AccountTreeIcon sx={{ fontSize: 16 }} />,
  duration: <TimelapseIcon sx={{ fontSize: 16 }} />,
  formula: <CalculateIcon sx={{ fontSize: 16 }} />,
  counter: <PlusOneIcon sx={{ fontSize: 16 }} />,
  slider: <LinearScaleIcon sx={{ fontSize: 16 }} />,
  taginput: <LocalOfferIcon sx={{ fontSize: 16 }} />,
  time: <AccessTimeIcon sx={{ fontSize: 16 }} />,
  colorpicker: <PaletteIcon sx={{ fontSize: 16 }} />,
  otp: <DialpadIcon sx={{ fontSize: 16 }} />,
  autocomplete: <PlaylistAddCheckIcon sx={{ fontSize: 16 }} />,
};

// ── Eval-capable types (excluding layout/display-only) ─────────────────
const EVALUABLE_TYPES = QUESTION_TYPES.filter(
  t => t.spColumnKind !== null && !["spacer", "divider", "pagebreak", "panel", "columns", "repeater", "html", "image", "alert", "videoembed", "countdown", "scorecard", "datatable", "chartdisplay"].includes(t.type)
);

// ── Shared style constants ─────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%",
  height: 30,
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  padding: "0 9px",
  fontSize: 12,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  color: C.textPrimary,
  background: C.white,
  outline: "none",
  boxSizing: "border-box",
};
const textareaStyle: React.CSSProperties = {
  ...inp,
  height: "auto",
  minHeight: 56,
  padding: "8px 9px",
  resize: "vertical",
  lineHeight: 1.5,
};
const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: C.textMuted,
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  display: "block",
  marginBottom: 4,
};
const toggleBtn = (active: boolean): React.CSSProperties => ({
  flex: 1,
  height: 26,
  border: `1px solid ${active ? C.purple : C.border}`,
  borderRadius: 6,
  background: active ? C.purplePale : C.white,
  color: active ? C.purple : C.textMuted,
  fontSize: 10,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  transition: "all .1s",
});

// ── Small helper components ────────────────────────────────────────────
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 0" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 15, height: 15, accentColor: C.purple, margin: 0, flexShrink: 0 }} />
      {label && <span style={{ fontSize: 12, color: C.textSecond }}>{label}</span>}
    </label>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  );
}

function ChoicesEditor({ choices, onChange }: { choices: (string | { value: string; text: string })[]; onChange: (c: (string | { value: string; text: string })[]) => void }) {
  const addChoice = () => onChange([...choices, `Option ${choices.length + 1}`]);
  const updateChoice = (idx: number, val: string) => onChange(choices.map((c, i) => i === idx ? val : c));
  const removeChoice = (idx: number) => onChange(choices.filter((_, i) => i !== idx));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {choices.map((c, i) => {
        const val = typeof c === "string" ? c : c.text || c.value;
        return (
          <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: C.textMuted, width: 14, flexShrink: 0 }}>{i + 1}.</span>
            <input value={val} onChange={e => updateChoice(i, e.target.value)}
              placeholder={`Option ${i + 1}`} style={{ ...inp, flex: 1, height: 26, fontSize: 11 }} />
            <button onClick={() => removeChoice(i)}
              style={{ width: 22, height: 22, border: "none", background: C.redPale, color: C.red, borderRadius: 5, cursor: "pointer", fontSize: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CloseIcon sx={{ fontSize: 14 }} />
            </button>
          </div>
        );
      })}
      <button onClick={addChoice}
        style={{ width: "100%", height: 26, border: `1px dashed ${C.border}`, borderRadius: 6, background: "none", color: C.purple, fontSize: 11, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <AddIcon sx={{ fontSize: 14 }} /> Add choice
      </button>
    </div>
  );
}

// ── Property Panel for a single evaluation element ─────────────────────
function EvalElementPropertyPanel({
  el, idx, onChange, allElements,
}: {
  el: Record<string, unknown>;
  idx: number;
  onChange: (idx: number, key: string, value: unknown) => void;
  allElements: Record<string, unknown>[];
}) {
  const [tab, setTab] = useState<"general" | "validation" | "options">("general");
  const hasChoices = ["dropdown", "radiogroup", "checkbox", "buttongroup"].includes(el.type as string);
  const isNumeric = ["number", "currency", "slider", "rating", "counter"].includes(el.type as string);
  const isText = ["text", "email", "url", "tel", "password"].includes(el.type as string);
  const isComment = el.type === "comment";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 6 }}>
      {/* Tab selector */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["general", "validation", "options"] as const).filter(t => t !== "options" || hasChoices).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
              fontSize: 10, fontWeight: 600,
              background: tab === t ? C.purple : C.offWhite,
              color: tab === t ? "#fff" : C.textMuted,
              fontFamily: "inherit",
            }}>
            {t === "general" ? "General" : t === "validation" ? "Validation" : "Options"}
          </button>
        ))}
      </div>

      {/* ── General Tab ── */}
      {tab === "general" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <PropRow label="Field name (SP column)">
            <input value={(el.name as string) || ""} onChange={e => onChange(idx, "name", e.target.value.replace(/\s+/g, "_"))}
              placeholder="eval_field_name" style={inp} />
          </PropRow>
          <PropRow label="Label">
            <input value={(el.title as string) || ""} onChange={e => onChange(idx, "title", e.target.value)}
              placeholder="Question label" style={inp} />
          </PropRow>
          <PropRow label="Description / hint">
            <textarea value={(el.description as string) || ""} onChange={e => onChange(idx, "description", e.target.value)}
              placeholder="Optional helper text" style={textareaStyle} rows={2} />
          </PropRow>
          {el.type !== "boolean" && el.type !== "signaturepad" && el.type !== "consent" && el.type !== "formula" && (
            <PropRow label="Placeholder">
              <input value={(el.placeholder as string) || ""} onChange={e => onChange(idx, "placeholder", e.target.value)}
                placeholder="Placeholder text" style={inp} />
            </PropRow>
          )}
          
          {el.type === "formula" && <>
            <PropRow label="Expression / Formula">
              <div>
                <textarea value={(el.expression as string) || ""} onChange={e => onChange(idx, "expression", e.target.value)}
                  placeholder="e.g. {field1} + {field2}" rows={3}
                  style={{ ...inp, height: "auto", minHeight: 56, padding: "8px 9px", resize: "vertical", lineHeight: 1.5, fontFamily: "monospace" }} />
                <div style={{ fontSize: 9, color: C.textMuted, marginTop: 3, lineHeight: 1.4 }}>
                  Use <code style={{ background: "#F3F4F6", padding: "1px 3px", borderRadius: 2, fontSize: 9 }}>{'{field_name}'}</code> syntax.
                  Supports +, -, *, / and parentheses.
                </div>
              </div>
              {allElements.length > 1 && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.borderLight}` }}>
                  <div style={{ fontSize: 9, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    Insert field
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, maxHeight: 72, overflowY: "auto" }}>
                    {allElements.filter(e => (e.name as string) !== el.name).map(e => (
                      <button key={e.name as string} onClick={() => {
                        const cur = ((el.expression as string) || "").replace(/\s*[+\-*/]\s*$/, "");
                        onChange(idx, "expression", cur ? `${cur} + {${e.name}}` : `{${e.name}}`);
                      }}
                        title={`${(e.title as string) || ""}`}
                        style={{
                          padding: "1px 5px", fontSize: 9, fontFamily: "monospace",
                          border: `1px solid ${C.border}`, borderRadius: 3,
                          background: C.offWhite, color: C.purple, cursor: "pointer",
                          lineHeight: 1.6, whiteSpace: "nowrap",
                        }}
                      >{`{${e.name}}`}</button>
                    ))}
                  </div>
                </div>
              )}
            </PropRow>
            <PropRow label="Display format">
              <select value={(el.displayFormat as string) || "number"} onChange={e => onChange(idx, "displayFormat", e.target.value)} style={inp}>
                <option value="number">Number</option>
                <option value="currency">Currency (RM)</option>
                <option value="percent">Percentage</option>
              </select>
            </PropRow>
          </>}

          {isComment && (
            <PropRow label="Visible rows">
              <input type="number" min={1} max={20} value={String((el.rows as number) ?? 4)} onChange={e => onChange(idx, "rows", parseInt(e.target.value) || 4)}
                style={inp} />
            </PropRow>
          )}
          <PropRow label="Columns (side by side)">
            <select value={String((el.colCount as number) ?? 1)} onChange={e => onChange(idx, "colCount", parseInt(e.target.value))} style={inp}>
              {[0, 1, 2, 3, 4].map(n => (
                <option key={n} value={n}>{n === 0 ? "Auto" : `${n} column${n > 1 ? "s" : ""}`}</option>
              ))}
            </select>
          </PropRow>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Toggle checked={!!el.isRequired} onChange={v => onChange(idx, "isRequired", v)} label="Required" />
            <Toggle checked={!!el.readOnly} onChange={v => onChange(idx, "readOnly", v)} label="Read-only" />
          </div>
        </div>
      )}

      {/* ── Validation Tab ── */}
      {tab === "validation" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(isText || isComment) && (
            <>
              <PropRow label="Min length">
                <input type="number" min={0} value={String((el.minLength as number) ?? "")} onChange={e => onChange(idx, "minLength", e.target.value ? parseInt(e.target.value) : 0)} placeholder="0" style={inp} />
              </PropRow>
              <PropRow label="Max length">
                <input type="number" min={0} value={String((el.maxLength as number) ?? "")} onChange={e => onChange(idx, "maxLength", e.target.value ? parseInt(e.target.value) : 0)} placeholder="No limit" style={inp} />
              </PropRow>
            </>
          )}
          {(isNumeric || el.type === "number") && (
            <>
              <PropRow label="Min value">
                <input type="number" value={String((el.min as number) ?? "")} onChange={e => onChange(idx, "min", e.target.value ? parseFloat(e.target.value) : undefined)} placeholder="No minimum" style={inp} />
              </PropRow>
              <PropRow label="Max value">
                <input type="number" value={String((el.max as number) ?? "")} onChange={e => onChange(idx, "max", e.target.value ? parseFloat(e.target.value) : undefined)} placeholder="No maximum" style={inp} />
              </PropRow>
            </>
          )}
          {el.type === "text" && (
            <PropRow label="Input type">
              <select value={(el.inputType as string) || "text"} onChange={e => onChange(idx, "inputType", e.target.value)} style={inp}>
                {[{ v: "text", l: "Text" }, { v: "email", l: "Email" }, { v: "number", l: "Number" }, { v: "tel", l: "Phone" }, { v: "url", l: "URL" }].map(opt => (
                  <option key={opt.v} value={opt.v}>{opt.l}</option>
                ))}
              </select>
            </PropRow>
          )}
          <PropRow label="Error message">
            <input value={(el.requiredErrorText as string) || ""} onChange={e => onChange(idx, "requiredErrorText", e.target.value)} placeholder="Custom required error" style={inp} />
          </PropRow>
        </div>
      )}

      {/* ── Options Tab (choices) ── */}
      {tab === "options" && hasChoices && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <PropRow label="Manual Choices">
            <ChoicesEditor choices={(el.choices as (string | { value: string; text: string })[]) || []} onChange={c => onChange(idx, "choices", c)} />
          </PropRow>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => onChange(idx, "hasOther", !el.hasOther)} style={toggleBtn(!!el.hasOther)}>Include "Other"</button>
            <button onClick={() => onChange(idx, "hasNone", !el.hasNone)} style={toggleBtn(!!el.hasNone)}>Include "None"</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────
interface EvalElementPickerProps {
  elements: Record<string, unknown>[];
  onChange: (elements: Record<string, unknown>[]) => void;
}

export default function EvalElementPicker({ elements, onChange }: EvalElementPickerProps) {
  const [showGrid, setShowGrid] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const filteredTypes = useMemo(() => {
    if (!searchQuery.trim()) return EVALUABLE_TYPES;
    const q = searchQuery.toLowerCase();
    return EVALUABLE_TYPES.filter(
      t => t.label.toLowerCase().includes(q) || t.type.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const addElement = (typeDef: typeof QUESTION_TYPES[number]) => {
    const name = `eval_${typeDef.type}_${elements.length + 1}`;
    const el: Record<string, unknown> = {
      type: typeDef.type,
      name,
      title: typeDef.label,
      isRequired: false,
      ...typeDef.defaultProps,
    };
    onChange([...elements, el]);
    setShowGrid(false);
    setSearchQuery("");
  };

  const removeElement = (idx: number) => {
    onChange(elements.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
  };

  const updateElement = (idx: number, key: string, value: unknown) => {
    onChange(elements.map((el, i) => (i === idx ? { ...el, [key]: value } : el)));
  };

  const getTypeIcon = (typeName: string): React.ReactNode => TYPE_ICONS[typeName] || <TextFieldsIcon sx={{ fontSize: 16 }} />;

  const getTypeLabel = (typeName: string): string => QUESTION_TYPES.find(t => t.type === typeName)?.label || typeName;

  return (
    <div>
      {/* ── Selected elements list ── */}
      {elements.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
            Evaluation Fields ({elements.length})
          </div>
          {elements.length > 0 && !elements.some(el => el.isRequired) && (
            <div style={{ fontSize: 10, color: C.red, background: C.redPale, borderRadius: 6, padding: "6px 8px", marginBottom: 8, lineHeight: 1.4 }}>
              <WarningIcon style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 4 }} /> At least one field must be marked as <strong>Required</strong> before this evaluation layer can be used.
            </div>
          )}
          {elements.map((el, i) => (
            <div key={i} style={{
              background: C.offWhite,
              border: `1px solid ${expandedIdx === i ? C.purple : C.border}`,
              borderRadius: 8,
              marginBottom: 6,
              overflow: "hidden",
            }}>
              {/* Header row */}
              <div
                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                style={{
                  display: "flex", gap: 6, alignItems: "center", padding: "8px 10px",
                  cursor: "pointer", background: expandedIdx === i ? `${C.purplePale}80` : "transparent",
                }}
              >
                <span style={{ fontSize: 16, display: "flex", alignItems: "center", flexShrink: 0, color: C.purple }}>
                  {getTypeIcon(el.type as string)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(el.title as string) || (el.name as string) || "Untitled"}
                  </div>
                  <div style={{ fontSize: 9, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {el.name as string} · {getTypeLabel(el.type as string)}
                  </div>
                </div>
                <span style={{ fontSize: 9, color: C.textMuted, background: `${C.purple}15`, padding: "1px 6px", borderRadius: 4, flexShrink: 0 }}>
                  {el.type as string}
                </span>
                <button onClick={e => { e.stopPropagation(); removeElement(i); }}
                  style={{ width: 22, height: 22, border: "none", background: "transparent", color: C.textMuted, borderRadius: 5, cursor: "pointer", fontSize: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DeleteIcon sx={{ fontSize: 14 }} />
                </button>
                <span style={{ color: C.textMuted, display: "flex", alignItems: "center" }}>
                  {expandedIdx === i ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                </span>
              </div>

              {/* Expanded property panel */}
              {expandedIdx === i && (
                <div style={{ padding: "0 10px 10px", borderTop: `1px solid ${C.border}` }}>
                  <EvalElementPropertyPanel el={el} idx={i} onChange={updateElement} allElements={elements} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Add field button / type grid ── */}
      {!showGrid ? (
        <button onClick={() => setShowGrid(true)}
          style={{ width: "100%", height: 30, border: `1px dashed ${C.purpleMid}`, borderRadius: 7, background: "none", color: C.purple, fontSize: 11, cursor: "pointer", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <AddIcon sx={{ fontSize: 14 }} /> Add evaluation field
        </button>
      ) : (
        <div>
          {/* Search */}
          <div style={{ position: "relative", marginBottom: 8 }}>
            <span style={{ position: "absolute", left: 8, top: 7, color: C.textMuted, display: "flex", alignItems: "center", pointerEvents: "none" }}>
              <SearchIcon sx={{ fontSize: 14 }} />
            </span>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search field types..." autoFocus
              style={{ ...inp, paddingLeft: 28, height: 28, fontSize: 11 }} />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")}
                style={{ position: "absolute", right: 6, top: 5, border: "none", background: "none", color: C.textMuted, cursor: "pointer", padding: 0, display: "flex" }}>
                <CloseIcon sx={{ fontSize: 14 }} />
              </button>
            )}
          </div>

          {/* Type grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginBottom: 8, maxHeight: 240, overflowY: "auto" }}>
            {filteredTypes.map(td => (
              <button key={td.type} onClick={() => addElement(td)}
                style={{ padding: "6px 4px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.white, cursor: "pointer", fontSize: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", color: C.textSecond, textAlign: "center" as const, transition: "all .1s", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.purpleMid; e.currentTarget.style.background = C.purplePale; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.white; }}>
                <span style={{ fontSize: 16, display: "flex", alignItems: "center", color: C.purple }}>{getTypeIcon(td.type)}</span>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>{td.label}</div>
              </button>
            ))}
            {filteredTypes.length === 0 && (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 12, color: C.textMuted, fontSize: 11 }}>No field types match</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => { setShowGrid(false); setSearchQuery(""); }}
              style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, color: C.textMuted, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
            <span style={{ fontSize: 9, color: C.textMuted }}>{filteredTypes.length} type{filteredTypes.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}

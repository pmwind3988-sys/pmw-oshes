import { useEffect, useState } from "react";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import type { FormBuilderField, SurveyJson } from "../../types";
import { C } from "./constants";
import { flattenQuestions } from "../../utils/FormBuilderEngine";
import {
  PREFILLED_QR_PARAM,
  encodePrefilledQrPayload,
  getPrefillEligibleFields,
  type PrefilledQrPayload,
} from "../../utils/prefilledQr";

type DraftValue = string | string[] | boolean;

interface PrefilledQrPanelProps {
  surveyJson: SurveyJson | null;
  slug: string;
  canGenerate: boolean;
}

interface ChoiceOption {
  value: string;
  text: string;
}

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function fieldLabel(field: FormBuilderField): string {
  return field.title || field.name;
}

function fieldTypeLabel(field: FormBuilderField): string {
  if (field.type === "text" && field.inputType) return field.inputType;
  return field.type;
}

function choiceOptions(field: FormBuilderField): ChoiceOption[] {
  if (!Array.isArray(field.choices)) return [];
  return field.choices.map(choice => {
    if (typeof choice === "string") return { value: choice, text: choice };
    return { value: String(choice.value), text: String(choice.text || choice.value) };
  });
}

function isEmptyDraftValue(value: DraftValue | undefined): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "boolean") return false;
  return value.trim() === "";
}

function normalizeDraftValue(field: FormBuilderField, value: DraftValue | undefined): unknown | undefined {
  if (value === undefined || isEmptyDraftValue(value)) return undefined;
  if (field.type === "checkbox") return Array.isArray(value) ? value : String(value).split(",").map(item => item.trim()).filter(Boolean);
  if (field.type === "boolean") return value === true || value === "true";
  if (field.inputType === "number" || ["number", "rating", "slider", "counter", "currency", "duration"].includes(field.type)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return value;
}

function inputTypeForField(field: FormBuilderField): string {
  if (field.inputType === "date") return "date";
  if (field.inputType === "datetime-local") return "datetime-local";
  if (field.inputType === "number") return "number";
  return "text";
}

export default function PrefilledQrPanel({ surveyJson, slug, canGenerate }: PrefilledQrPanelProps) {
  const fields = getPrefillEligibleFields(surveyJson, flattenQuestions);
  const [values, setValues] = useState<Record<string, DraftValue>>({});
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setValues({});
    setLocked({});
    setGeneratedUrl("");
    setQrDataUrl("");
    setCopied(false);
  }, [surveyJson, slug]);

  useEffect(() => {
    if (!generatedUrl) {
      setQrDataUrl("");
      return;
    }
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(generatedUrl, { width: 320, margin: 2, color: { dark: C.textPrimary, light: "#FFFFFF" } }),
      )
      .then(dataUrl => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [generatedUrl]);

  const setFieldValue = (name: string, value: DraftValue) => {
    setValues(current => ({ ...current, [name]: value }));
    setLocked(current => {
      if (isEmptyDraftValue(value)) {
        const next = { ...current };
        delete next[name];
        return next;
      }
      if (Object.hasOwn(current, name)) return current;
      return { ...current, [name]: true };
    });
    setGeneratedUrl("");
    setCopied(false);
  };

  const toggleChoice = (field: FormBuilderField, value: string, checked: boolean) => {
    const current = values[field.name];
    const selected = Array.isArray(current) ? current : [];
    setFieldValue(field.name, checked ? [...selected, value] : selected.filter(item => item !== value));
  };

  const generate = () => {
    const nextValues: Record<string, unknown> = {};
    const nextLocked: string[] = [];
    for (const field of fields) {
      const normalized = normalizeDraftValue(field, values[field.name]);
      if (normalized === undefined) continue;
      nextValues[field.name] = normalized;
      if (locked[field.name]) nextLocked.push(field.name);
    }
    if (Object.keys(nextValues).length === 0 || !slug) {
      setGeneratedUrl("");
      setQrDataUrl("");
      return;
    }
    const payload: PrefilledQrPayload = { v: 1, values: nextValues, locked: nextLocked };
    const url = new URL(`/form/${slug}`, window.location.origin);
    url.searchParams.set(PREFILLED_QR_PARAM, encodePrefilledQrPayload(payload));
    setGeneratedUrl(url.toString());
  };

  const copyLink = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  };

  const clear = () => {
    setValues({});
    setLocked({});
    setGeneratedUrl("");
    setQrDataUrl("");
    setCopied(false);
  };

  const hasValues = fields.some(field => !isEmptyDraftValue(values[field.name]));
  const disabled = !canGenerate || fields.length === 0;

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.borderLight}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: C.purplePale, color: C.purple, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <QrCode2Icon style={{ fontSize: 17 }} />
        </span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.textPrimary, fontFamily: font }}>Prefilled QR instance</div>
          <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.4, fontFamily: font }}>Set defaults for this QR only.</div>
        </div>
      </div>

      {!canGenerate && (
        <div style={{ background: C.amberPale, color: C.amber, borderRadius: 8, padding: "8px 10px", fontSize: 11, lineHeight: 1.45, marginBottom: 10, fontFamily: font }}>
          Publish this form first so the QR targets the live form route.
        </div>
      )}

      {canGenerate && fields.length === 0 && (
        <div style={{ background: C.offWhite, color: C.textMuted, borderRadius: 8, padding: "8px 10px", fontSize: 11, lineHeight: 1.45, marginBottom: 10, fontFamily: font }}>
          No fillable fields are available for prefill.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: disabled ? 0.55 : 1 }}>
        {fields.map(field => {
          const options = choiceOptions(field);
          const draftValue = values[field.name];
          const hasValue = !isEmptyDraftValue(draftValue);
          return (
            <div key={field.name} style={{ borderRadius: 8, background: C.white, boxShadow: "0 0 0 1px rgba(0,0,0,0.06), 0 6px 16px rgba(26,31,43,0.06)", padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textPrimary, lineHeight: 1.35, fontFamily: font, textWrap: "pretty" }}>{fieldLabel(field)}</div>
                  <div style={{ fontSize: 9, color: C.textMuted, fontFamily: font }}>{field.name} · {fieldTypeLabel(field)}</div>
                </div>
                <button
                  type="button"
                  disabled={!hasValue || disabled}
                  onClick={() => setLocked(current => ({ ...current, [field.name]: !current[field.name] }))}
                  title={locked[field.name] ? "Locked for scanner" : "Editable for scanner"}
                  style={{
                    minWidth: 40,
                    minHeight: 40,
                    border: "none",
                    borderRadius: 8,
                    background: locked[field.name] && hasValue ? C.purplePale : C.offWhite,
                    color: locked[field.name] && hasValue ? C.purple : C.textMuted,
                    cursor: !hasValue || disabled ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: !hasValue || disabled ? 0.5 : 1,
                    transitionProperty: "background-color, color, transform, opacity",
                    transitionDuration: "140ms",
                    transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)",
                  }}
                >
                  {locked[field.name] && hasValue ? <LockIcon style={{ fontSize: 16 }} /> : <LockOpenIcon style={{ fontSize: 16 }} />}
                </button>
              </div>

              {field.type === "checkbox" && options.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {options.map(option => {
                    const selected = Array.isArray(draftValue) ? draftValue.includes(option.value) : false;
                    return (
                      <label key={option.value} style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 28, fontSize: 11, color: C.textSecond, fontFamily: font }}>
                        <input type="checkbox" disabled={disabled} checked={selected} onChange={e => toggleChoice(field, option.value, e.target.checked)} />
                        <span>{option.text}</span>
                      </label>
                    );
                  })}
                </div>
              ) : options.length > 0 ? (
                <select
                  disabled={disabled}
                  value={typeof draftValue === "string" ? draftValue : ""}
                  onChange={e => setFieldValue(field.name, e.target.value)}
                  style={{ width: "100%", minHeight: 40, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 9px", color: C.textPrimary, fontSize: 12, fontFamily: font, background: C.white }}
                >
                  <option value="">Select value</option>
                  {options.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}
                </select>
              ) : field.type === "boolean" ? (
                <select
                  disabled={disabled}
                  value={typeof draftValue === "boolean" ? String(draftValue) : ""}
                  onChange={e => setFieldValue(field.name, e.target.value === "true")}
                  style={{ width: "100%", minHeight: 40, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 9px", color: C.textPrimary, fontSize: 12, fontFamily: font, background: C.white }}
                >
                  <option value="">Select value</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : field.type === "comment" ? (
                <textarea
                  disabled={disabled}
                  value={typeof draftValue === "string" ? draftValue : ""}
                  onChange={e => setFieldValue(field.name, e.target.value)}
                  rows={3}
                  style={{ width: "100%", minHeight: 72, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 9px", resize: "vertical", color: C.textPrimary, fontSize: 12, lineHeight: 1.45, fontFamily: font, background: C.white }}
                />
              ) : (
                <input
                  disabled={disabled}
                  type={inputTypeForField(field)}
                  value={typeof draftValue === "string" ? draftValue : ""}
                  onChange={e => setFieldValue(field.name, e.target.value)}
                  style={{ width: "100%", minHeight: 40, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 9px", color: C.textPrimary, fontSize: 12, fontFamily: font, background: C.white }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 40px", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          disabled={disabled || !hasValues}
          onClick={generate}
          style={{
            minHeight: 40,
            border: "none",
            borderRadius: 8,
            background: disabled || !hasValues ? C.border : `linear-gradient(135deg,${C.purple},${C.purpleLight})`,
            color: disabled || !hasValues ? C.textMuted : C.white,
            cursor: disabled || !hasValues ? "not-allowed" : "pointer",
            fontSize: 12,
            fontWeight: 800,
            fontFamily: font,
            transitionProperty: "transform, opacity",
            transitionDuration: "140ms",
            transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)",
          }}
        >
          Generate QR
        </button>
        <button
          type="button"
          disabled={!hasValues}
          onClick={clear}
          title="Clear prefilled values"
          style={{ minHeight: 40, border: "none", borderRadius: 8, background: C.offWhite, color: C.textSecond, cursor: hasValues ? "pointer" : "not-allowed", opacity: hasValues ? 1 : 0.45 }}
        >
          <RestartAltIcon style={{ fontSize: 17 }} />
        </button>
      </div>

      {generatedUrl && (
        <div style={{ marginTop: 12, borderRadius: 8, background: C.offWhite, padding: 10, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)" }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Prefilled QR code" style={{ width: 168, height: 168, display: "block", margin: "0 auto 10px", borderRadius: 8, outline: "1px solid rgba(0, 0, 0, 0.1)", background: C.white }} />
          ) : (
            <div style={{ width: 168, height: 168, margin: "0 auto 10px", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 11, fontFamily: font }}>Generating...</div>
          )}
          <div style={{ fontSize: 10, color: C.textMuted, wordBreak: "break-all", lineHeight: 1.45, fontFamily: font, marginBottom: 10 }}>{generatedUrl}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              type="button"
              onClick={copyLink}
              style={{ minHeight: 40, border: "none", borderRadius: 8, background: copied ? C.greenPale : C.white, color: copied ? C.green : C.textSecond, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: font, boxShadow: "0 0 0 1px rgba(0,0,0,0.06)" }}
            >
              <ContentCopyIcon style={{ fontSize: 14, verticalAlign: "middle", marginRight: 4 }} /> {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={qrDataUrl || generatedUrl}
              download={`${slug || "form"}-prefilled-qr.png`}
              style={{ minHeight: 40, borderRadius: 8, background: C.white, color: C.textSecond, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: font, boxShadow: "0 0 0 1px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
            >
              <DownloadIcon style={{ fontSize: 14, marginRight: 4 }} /> PNG
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * ApproverRow.tsx - Single approver input row with user search
 * Supports "Static" (email input) and "From Field" (dropdown) assignee modes
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { C } from "./constants";
import CheckIcon from "@mui/icons-material/Check";

interface ApproverRowProps {
  index: number;
  layer: { email: string; name: string };
  onChange: (i: number, k: string, v: string) => void;
  siteUsers: { email: string; name: string }[];
  /** When provided, enables "Static" / "From Field" toggle */
  formFieldNames?: string[];
  /** Current assignee mode: "static" (default) or "field" */
  assigneeMode?: "static" | "field";
  /** Callback when assignee mode changes */
  onAssigneeModeChange?: (mode: "static" | "field") => void;
}

const inp = {
  width: "100%",
  height: 34,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "0 11px",
  fontSize: 13,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  color: C.textPrimary,
  background: C.white,
  outline: "none",
};

const TOGGLE_BTN = (active: boolean): React.CSSProperties => ({
  height: 20,
  padding: "0 7px",
  border: `1px solid ${active ? C.purple : C.border}`,
  borderRadius: 5,
  background: active ? C.purplePale : C.white,
  color: active ? C.purple : C.textMuted,
  fontSize: 9,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  transition: "all .1s",
});

export default function ApproverRow({ index, layer, onChange, siteUsers, formFieldNames, assigneeMode = "static", onAssigneeModeChange }: ApproverRowProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const hasFieldMode = !!formFieldNames && formFieldNames.length > 0;
  const isFieldMode = hasFieldMode && assigneeMode === "field";

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const sugg = useMemo(() => {
    if (!q) return siteUsers.slice(0, 5);
    const lq = q.toLowerCase();
    return siteUsers.filter(u => u.email.toLowerCase().includes(lq) || u.name.toLowerCase().includes(lq)).slice(0, 5);
  }, [siteUsers, q]);

  return (
    <div style={{ marginBottom: 7 }}>
      {/* Toggle row (only when formFieldNames provided) */}
      {hasFieldMode && (
        <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
          <button onClick={() => onAssigneeModeChange?.("static")} style={TOGGLE_BTN(assigneeMode === "static")}>Static</button>
          <button onClick={() => onAssigneeModeChange?.("field")} style={TOGGLE_BTN(assigneeMode === "field")}>From Field</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
        <div style={{
          width: 26,
          height: 26,
          borderRadius: 7,
          flexShrink: 0,
          background: layer.email ? `linear-gradient(135deg,${C.green},#34D399)` : `linear-gradient(135deg,${C.purple},${C.purpleLight})`,
          color: C.white,
          fontSize: 11,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {layer.email ? <CheckIcon style={{ fontSize: 14 }} /> : `L${index + 1}`}
        </div>

        {isFieldMode ? (
          /* From Field mode: dropdown of form field names */
          <select
            value={layer.email}
            onChange={e => {
              onChange(index, "email", e.target.value);
              onChange(index, "name", e.target.value);
            }}
            style={{ ...inp, flex: 2, height: 30, fontSize: 12 }}
          >
            <option value="">— Select field —</option>
            {formFieldNames!.map(fn => (
              <option key={fn} value={fn}>{fn}</option>
            ))}
          </select>
        ) : (
          /* Static mode: original email input with search */
          <div ref={ref} style={{ flex: 2, position: "relative" }}>
            <input
              value={layer.email}
              onChange={e => {
                onChange(index, "email", e.target.value);
                setQ(e.target.value);
              }}
              onFocus={() => setOpen(true)}
              placeholder={`Layer ${index + 1} email`}
              style={{ ...inp, height: 30, fontSize: 12 }}
            />
            {open && sugg.length > 0 && (
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
                {sugg.map(u => (
                  <div
                    key={u.email}
                    onClick={() => {
                      onChange(index, "email", u.email);
                      onChange(index, "name", u.name);
                      setOpen(false);
                      setQ("");
                    }}
                    style={{ padding: "7px 11px", cursor: "pointer", borderBottom: `1px solid ${C.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = C.purplePale}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{u.name}</div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>{u.email}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!isFieldMode && (
          <input
            value={layer.name}
            onChange={e => onChange(index, "name", e.target.value)}
            placeholder="Name"
            style={{ ...inp, flex: 1, height: 30, fontSize: 12 }}
          />
        )}
      </div>
    </div>
  );
}

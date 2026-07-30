/**
 * AuditLog.tsx - Sidebar component showing audit log entries
 */
import { useState } from "react";
import { C } from "./constants";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

interface AuditLogProps {
  logs: { EventType: string; EventSummary?: string; BeforeJSON?: string; AfterJSON?: string; EventAt?: string }[];
}

const EC: Record<string, { color: string; bg: string }> = {
  FIELD_ADDED: { color: C.green, bg: C.greenPale },
  FIELD_REMOVED: { color: C.red, bg: C.redPale },
  FIELD_CHANGED: { color: C.amber, bg: C.amberPale },
  VERSION_BUMPED: { color: C.purple, bg: C.purplePale },
  PUBLISHED: { color: C.green, bg: C.greenPale },
  FORM_CREATED: { color: C.green, bg: C.greenPale },
};

export default function AuditLog({ logs }: AuditLogProps) {
  const [exp, setExp] = useState<number | null>(null);

  if (!logs.length) return <div style={{ fontSize: 11, color: C.textMuted, fontStyle: "italic" }}>No log entries yet.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {logs.map((l, i) => {
        const cfg = EC[l.EventType] || { color: C.textSecond, bg: C.offWhite };
        const isE = exp === i;
        let before: Record<string, unknown> | null = null;
        let after: Record<string, unknown> | null = null;
        try {
          before = l.BeforeJSON ? JSON.parse(l.BeforeJSON) : null;
        } catch { /* ignore */ }
        try {
          after = l.AfterJSON ? JSON.parse(l.AfterJSON) : null;
        } catch { /* ignore */ }
        const hasDiff = before || after;

        return (
          <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div
              onClick={() => hasDiff && setExp(isE ? null : i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                cursor: hasDiff ? "pointer" : "default",
                background: isE ? C.offWhite : C.white,
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 20, padding: "2px 7px", flexShrink: 0 }}>
                {l.EventType}
              </span>
              <span style={{ fontSize: 11, color: C.textPrimary, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.EventSummary}
              </span>
              <span style={{ fontSize: 9, color: C.textMuted, flexShrink: 0 }}>
                {l.EventAt ? new Date(l.EventAt).toLocaleString("en-MY", { dateStyle: "short", timeStyle: "short" }) : ""}
              </span>
              {hasDiff && <span style={{ fontSize: 10, color: C.textMuted }}>{isE ? <ExpandLessIcon style={{ fontSize: 14 }} /> : <ExpandMoreIcon style={{ fontSize: 14 }} />}</span>}
            </div>
            {isE && hasDiff && (
              <div style={{
                padding: "9px 10px",
                borderTop: `1px solid ${C.border}`,
                background: C.offWhite,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}>
                {before && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.red, textTransform: "uppercase", marginBottom: 3 }}>Before</div>
                    <pre style={{ fontSize: 10, color: C.textSecond, fontFamily: "monospace", whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0 }}>
                      {JSON.stringify(before, null, 2)}
                    </pre>
                  </div>
                )}
                {after && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.green, textTransform: "uppercase", marginBottom: 3 }}>After</div>
                    <pre style={{ fontSize: 10, color: C.textSecond, fontFamily: "monospace", whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0 }}>
                      {JSON.stringify(after, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
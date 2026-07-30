/**
 * VersionHistory.tsx - Sidebar component showing version history
 */
import { C } from "./constants";

interface VersionHistoryProps {
  history: { FormVersion: string; PublishedBy?: string; PublishedAt?: string }[];
  current: string;
  onView: (v: string) => void;
}

const Tag = ({ children, color = C.purple, bg = C.purplePale }: { children: React.ReactNode; color?: string; bg?: string }) => (
  <span style={{
    fontSize: 10,
    fontWeight: 700,
    color,
    background: bg,
    borderRadius: 20,
    padding: "2px 9px",
    textTransform: "uppercase",
    letterSpacing: ".04em",
  }}>{children}</span>
);

export default function VersionHistory({ history, current, onView }: VersionHistoryProps) {
  if (!history.length) return <div style={{ fontSize: 11, color: C.textMuted, fontStyle: "italic" }}>No history yet.</div>;

  return (
    <div>
      {history.map((v, i) => (
        <div key={i} style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          border: `1px solid ${v.FormVersion === current ? C.purple : C.border}`,
          borderRadius: 8,
          background: v.FormVersion === current ? C.purplePale : C.white,
          marginBottom: 6,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
              <Tag>v{v.FormVersion}</Tag>
              {v.FormVersion === current && <Tag color={C.green} bg={C.greenPale}>Current</Tag>}
            </div>
            <div style={{ fontSize: 10, color: C.textMuted }}>
              {v.PublishedBy?.split("@")[0]} · {v.PublishedAt ? new Date(v.PublishedAt).toLocaleString("en-MY", { dateStyle: "short", timeStyle: "short" }) : "—"}
            </div>
          </div>
          <button
            onClick={() => onView(v.FormVersion)}
            style={{
              fontSize: 11,
              color: v.FormVersion === current ? C.textMuted : C.purple,
              background: "none",
              border: `1px solid ${v.FormVersion === current ? C.border : C.purpleMid}`,
              borderRadius: 6,
              padding: "3px 10px",
              cursor: "pointer",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            }}
          >
            {v.FormVersion === current ? "Active" : "View"}
          </button>
        </div>
      ))}
    </div>
  );
}
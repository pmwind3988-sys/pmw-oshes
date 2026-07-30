/**
 * FormLibrary.tsx - Sidebar component showing list of forms
 */
import { C } from "./constants";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";

interface FormLibraryProps {
  forms: { Id?: string; Title: string; FormID?: string; CurrentVersion?: string; Slug?: string; IsPublished?: boolean }[];
  onEdit: (f: { Title: string }) => void;
  onNew: () => void;
  onDelete: (f: { Id?: string; Title: string; FormID?: string; CurrentVersion?: string; Slug?: string; IsPublished?: boolean }) => void;
  onHardDelete?: (f: { Id?: string; Title: string; FormID?: string; CurrentVersion?: string; Slug?: string; IsPublished?: boolean }) => void;
  current: string;
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

export default function FormLibrary({ forms, onEdit, onNew, onDelete, onHardDelete, current }: FormLibraryProps) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{
        padding: "11px 13px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: ".06em" }}>
          Forms ({forms.length})
        </div>
        <button
          onClick={onNew}
          style={{
            height: 23,
            padding: "0 10px",
            border: "none",
            borderRadius: 6,
            background: C.purple,
            color: C.white,
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <AddIcon style={{ fontSize: 14 }} /> New
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "7px 9px" }}>
        {forms.length === 0 && (
          <div style={{ textAlign: "center", padding: "20px 0", color: C.textMuted, fontSize: 11 }}>No forms yet.</div>
        )}
        {forms.map(f => (
          <div
            key={f.Id || f.Title}
            onClick={() => onEdit(f)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${f.Title === current ? C.purple : C.border}`,
              background: f.Title === current ? C.purplePale : C.white,
              marginBottom: 5,
              cursor: "pointer",
              transition: "all .13s",
              position: "relative",
              opacity: f.IsPublished === false && f.Title !== current ? 0.78 : 1,
            }}
            onMouseEnter={e => {
              if (f.Title !== current) e.currentTarget.style.background = C.offWhite;
            }}
            onMouseLeave={e => {
              if (f.Title !== current) e.currentTarget.style.background = C.white;
            }}
          >
            {/* Delete form (keeps submissions) */}
            <button
              onClick={e => {
                e.stopPropagation();
                onDelete(f);
              }}
              title="Delete form (keeps submission data)"
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 22,
                height: 22,
                border: "none",
                borderRadius: 5,
                background: "transparent",
                color: C.textMuted,
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                transition: "all .13s",
              }}
              onMouseEnter={e => {
                e.stopPropagation();
                e.currentTarget.style.background = C.redPale;
                e.currentTarget.style.color = C.red;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = C.textMuted;
              }}
            >
              <DeleteIcon style={{ fontSize: 14 }} />
            </button>
            {/* Delete ALL (including submissions) — destructive */}
            {onHardDelete && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onHardDelete(f);
                }}
                title="Delete ALL data including submissions (irreversible)"
                style={{
                  position: "absolute",
                  top: 6,
                  right: 30,
                  width: 22,
                  height: 22,
                  border: "none",
                  borderRadius: 5,
                  background: "transparent",
                  color: C.textMuted,
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                  transition: "all .13s",
                }}
                onMouseEnter={e => {
                  e.stopPropagation();
                  e.currentTarget.style.background = "#FEE2E2";
                  e.currentTarget.style.color = "#DC2626";
                }}
                onMouseLeave={e => {
                  e.stopPropagation();
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = C.textMuted;
                }}
              >
                <DeleteSweepIcon style={{ fontSize: 14 }} />
              </button>
            )}
            <div style={{ fontSize: 12, fontWeight: 600, color: f.Title === current ? C.purple : C.textPrimary, marginBottom: 2, paddingRight: 22 }}>
              {f.Title}
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace" }}>{f.FormID}</span>
              <Tag>v{f.CurrentVersion || "?"}</Tag>
              {f.IsPublished === false ? (
                <Tag color={C.amber} bg={C.amberPale}>Draft</Tag>
              ) : (
                <Tag color={C.green} bg={C.greenPale}>Published</Tag>
              )}
              {f.Slug && <span style={{ fontSize: 10, color: C.textMuted }}>/forms/{f.Slug}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
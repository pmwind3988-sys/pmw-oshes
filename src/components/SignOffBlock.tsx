/**
 * SignOffBlock — "Approved By / name / position / date", the way a paper
 * approval closes. Shared by the reviewer page (`/eval/...`) and My
 * Submissions, so the person who signed and the person who submitted read the
 * same record. The PDF prints the same block in `pdfSections/sections.tsx`;
 * the wording rules live in `utils/signOff.ts`.
 *
 * The signature space and the rule under it exist only when there is a drawn
 * signature to sit on them. A checkbox approval, an evaluation, or a signature
 * layer not yet signed would otherwise show an empty line that reads as a
 * signature missing from the record.
 */
import { editorial } from "../theme/editorial";
import type { SignOffVerdict } from "../utils/signOff";

/** A rejection's caption, in the danger ink rather than the red fill. */
const REJECTED_INK = "#8C1D18";

export default function SignOffBlock({
  verdict,
  label,
  name,
  position,
  date,
  signature,
  compact = false,
  align = "end",
}: {
  verdict: SignOffVerdict;
  label: string;
  name: string;
  position: string;
  date: string;
  signature?: string | null;
  /** The smaller variant, for a list of earlier layers rather than a page's close. */
  compact?: boolean;
  /** `end` sits the block at the right, as a form's signature does; `start` for lists. */
  align?: "start" | "end";
}) {
  return (
    <div style={{ width: compact ? 260 : 300, maxWidth: "100%", marginLeft: align === "end" ? "auto" : 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: verdict === "rejected" ? REJECTED_INK : editorial.muted, padding: "0 4px" }}>
        {label}
      </div>
      <div style={{ marginTop: 6, padding: compact ? "10px 14px" : "12px 16px", borderRadius: 14, background: editorial.panel }}>
        {signature ? (
          <div style={{ height: compact ? 36 : 52, display: "flex", alignItems: "flex-end" }}>
            <img
              src={signature}
              alt={`Signature of ${name || "the signer"}`}
              style={{ maxHeight: compact ? 34 : 50, maxWidth: 220, objectFit: "contain" }}
            />
          </div>
        ) : null}
        <div style={signature ? { borderTop: `1px solid ${editorial.border}`, paddingTop: 8, marginTop: 4 } : undefined}>
          <div style={{ fontSize: compact ? 15 : 16, fontWeight: 700, color: editorial.ink, overflowWrap: "anywhere" }}>
            {name || "—"}
          </div>
          {position && (
            <div style={{ fontSize: 13, color: editorial.muted, marginTop: 2 }}>{position}</div>
          )}
          <div style={{ fontSize: 13, color: editorial.softMuted, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
            Date: {date}
          </div>
        </div>
      </div>
    </div>
  );
}

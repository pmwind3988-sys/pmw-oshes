/**
 * PublicLinkDisplay.tsx - Copyable link display for public evaluation layers
 */
import { useState } from "react";
import { C } from "./constants";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningIcon from "@mui/icons-material/Warning";

interface PublicLinkDisplayProps {
  slug: string;
  publicToken: string;
  tokenExpiresAt: string;
  onTokenChange: (token: string) => void;
  onExpiryChange: (date: string) => void;
}

export default function PublicLinkDisplay({
  slug,
  publicToken,
  tokenExpiresAt,
  onTokenChange,
  onExpiryChange,
}: PublicLinkDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const url = `${window.location.origin}/form/${slug}?eval=${publicToken}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRegenerate = () => {
    if (!confirmRegen) {
      setConfirmRegen(true);
      setTimeout(() => setConfirmRegen(false), 3000);
      return;
    }
    const newToken = crypto.randomUUID();
    onTokenChange(newToken);
    setConfirmRegen(false);
  };

  return (
    <div
      style={{
        background: C.offWhite,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "9px 11px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.textMuted,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          marginBottom: 6,
        }}
      >
        Public Access Link
      </div>

      {/* URL display + copy */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
        <div
          style={{
            flex: 1,
            background: C.white,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: "5px 9px",
            fontSize: 11,
            color: C.textSecond,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "monospace",
          }}
        >
          {url}
        </div>
        <button
          onClick={handleCopy}
          style={{
            height: 28,
            padding: "0 10px",
            border: `1px solid ${copied ? C.green : C.border}`,
            borderRadius: 6,
            background: copied ? C.greenPale : C.white,
            color: copied ? C.green : C.purple,
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            flexShrink: 0,
            transition: "all .15s",
          }}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>

      {/* Token expiry */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <label style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>Token expires</label>
        <input
          type="date"
          value={tokenExpiresAt ? tokenExpiresAt.split("T")[0] : ""}
          onChange={e => onExpiryChange(e.target.value ? new Date(e.target.value).toISOString() : "")}
          style={{
            height: 26,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: "0 7px",
            fontSize: 11,
            color: C.textPrimary,
            background: C.white,
            outline: "none",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          }}
        />
      </div>

      {/* Regenerate token */}
      <button
        onClick={handleRegenerate}
        style={{
          fontSize: 10,
          color: confirmRegen ? C.red : C.amber,
          background: confirmRegen ? C.redPale : C.amberPale,
          border: `1px solid ${confirmRegen ? C.red : C.amber}`,
          borderRadius: 6,
          padding: "4px 9px",
          cursor: "pointer",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          fontWeight: 600,
          transition: "all .15s",
        }}
      >
        {confirmRegen ? <><WarningIcon style={{ fontSize: 12, marginRight: 4 }} /> Confirm: regenerate token?</> : <><RefreshIcon style={{ fontSize: 12, marginRight: 4 }} /> Regenerate token</>}
      </button>
    </div>
  );
}

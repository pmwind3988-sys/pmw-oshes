/**
 * signatureCapture.tsx — drawing a signature, with no SurveyJS behind it.
 *
 * This lived in `SignaturePad.tsx`, alongside a SurveyJS signature question that
 * pulled the whole SurveyJS renderer into the approval dashboard and the
 * evaluation page — for a canvas and two buttons. The question type is gone and
 * SurveyJS is uninstalled; this is the part that was actually being used.
 *
 * `SignatureModal` stays exported: the native engine's own signature field uses
 * the same dialog, and an approver signing off on a layer uses `SignatureCapture`
 * below it.
 */
import { useEffect, useRef, useState } from "react";

// -- Theme (inline, no MUI) --------------------------------------------
/** Local palette, matching the convention in `builder/constants`. */
export const C = {
  purple: "#5B21B6",
  purpleDark: "#3B0764",
  purplePale: "#EDE9FE",
  purpleMid: "#DDD6FE",
  white: "#FFFFFF",
  offWhite: "#F8F7FF",
  border: "#E5E3F0",
  textPrimary: "#1E1B4B",
  textSecond: "#6B7280",
  textMuted: "#9CA3AF",
  red: "#DC2626",
  redPale: "#FEE2E2",
  green: "#059669",
  greenPale: "#D1FAE5",
} as const;

function getPointerCoordinates(
  e: React.PointerEvent<HTMLElement>,
  canvas: HTMLCanvasElement,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}
// ── Signature Modal ────────────────────────────────────────────────────

export function SignatureModal({
  width,
  height,
  penColor: initialColor,
  backgroundColor,
  existingDataUrl,
  onSave,
  onCancel,
}: {
  width: number;
  height: number;
  penColor: string;
  backgroundColor: string;
  existingDataUrl?: string | null;
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [penColor, setPenColor] = useState(initialColor);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const scrollY = window.scrollY;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const previousOverflow = document.body.style.overflow;

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      document.body.style.overflow = previousOverflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = penColor;

    if (!existingDataUrl) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasContent(false);
      return;
    }

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setHasContent(true);
    };
    img.src = existingDataUrl;
  }, [existingDataUrl, height, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = penColor;
  }, [penColor]);

  // Update stroke color when penColor changes
  const updatePenColor = (color: string) => {
    setPenColor(color);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.strokeStyle = color;
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coords = getPointerCoordinates(e, canvas);
    if (!coords) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    isDrawing.current = true;
    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    if (e.pointerType === "mouse" && e.buttons === 0) {
      isDrawing.current = false;
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coords = getPointerCoordinates(e, canvas);
    if (!coords) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    setHasContent(true);
  };

  const stopDraw = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e?.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    isDrawing.current = false;
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
  };

  const colors = ["#000000", "#1E1B4B", "#5B21B6", "#DC2626", "#059669", "#D97706", "#2563EB"];

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 5000,
        background: "rgba(17,24,39,0.55)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px", animation: "fadeUp 0.2s ease",
        overscrollBehavior: "contain",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.white, borderRadius: 16, padding: "24px",
          maxWidth: Math.max(width + 80, 440), width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          border: `1px solid ${C.border}`,
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>
              {existingDataUrl ? "Edit Signature" : "Draw your signature"}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              Use mouse or touch to sign below
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: C.offWhite, border: `1px solid ${C.border}`,
              borderRadius: 8, width: 32, height: 32, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, color: C.textSecond,
            }}
          >
            ✕
          </button>
        </div>

        {/* Canvas */}
        <div
          style={{
            border: `2px solid ${C.purpleMid}`, borderRadius: 10,
            overflow: "hidden", background: backgroundColor,
            display: "flex", justifyContent: "center",
            touchAction: "none",
            overscrollBehavior: "contain",
          }}
        >
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            onPointerDown={startDraw}
            onPointerMove={draw}
            onPointerUp={stopDraw}
            onPointerCancel={stopDraw}
            onLostPointerCapture={() => { isDrawing.current = false; }}
            style={{
              display: "block",
              cursor: "crosshair",
              width: "100%",
              maxWidth: width,
              height: "auto",
              touchAction: "none",
              userSelect: "none",
            }}
          />
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: C.textSecond }}>Pen:</span>
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => updatePenColor(c)}
                style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: c, border: penColor === c ? `3px solid ${C.purple}` : "2px solid transparent",
                  cursor: "pointer", padding: 0,
                }}
              />
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <button
            onClick={handleClear}
            style={{
              height: 34, padding: "0 14px", borderRadius: 8,
              border: `1px solid ${C.border}`, background: C.offWhite,
              color: C.textSecond, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Clear
          </button>

          <button
            onClick={handleSave}
            style={{
              height: 34, padding: "0 18px", borderRadius: 8,
              border: "none", background: `linear-gradient(135deg,${C.purple},${C.purpleDark})`,
              color: C.white, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {hasContent || existingDataUrl ? "Save Signature" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SignatureCapture({
  value,
  onChange,
  disabled = false,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <div>
      {value ? (
        <div style={{ border: `1px solid ${C.purpleMid}`, borderRadius: 10, padding: 10, background: C.white }}>
          <img src={value} alt="Captured signature" style={{ display: "block", width: "100%", maxHeight: 150, objectFit: "contain" }} />
          {!disabled && (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" onClick={() => setModalOpen(true)} style={{ padding: "7px 12px", borderRadius: 7, border: `1px solid ${C.purpleMid}`, background: C.white, color: C.purple, cursor: "pointer", fontWeight: 600 }}>
                Edit signature
              </button>
              <button type="button" onClick={() => onChange(null)} style={{ padding: "7px 12px", borderRadius: 7, border: `1px solid ${C.red}`, background: C.white, color: C.red, cursor: "pointer", fontWeight: 600 }}>
                Clear
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setModalOpen(true)}
          style={{
            width: "100%", minHeight: 112, borderRadius: 10, border: `2px dashed ${C.purpleMid}`,
            background: C.purplePale, color: C.purple, cursor: disabled ? "not-allowed" : "pointer",
            fontSize: 13, fontWeight: 700,
          }}
        >
          Click to sign
        </button>
      )}
      {modalOpen && (
        <SignatureModal
          width={600}
          height={240}
          penColor="#000000"
          backgroundColor="#FFFFFF"
          existingDataUrl={value}
          onSave={(dataUrl) => {
            onChange(dataUrl);
            setModalOpen(false);
          }}
          onCancel={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

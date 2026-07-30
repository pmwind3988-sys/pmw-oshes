/**
 * SignaturePad.tsx — Custom SurveyJS signature widget with modal-based workflow.
 *
 * Replaces SurveyJS's native inline signaturepad renderer with a click-to-sign
 * modal that supports lock/unlock and clear after signing.
 *
 * Pattern follows DynamicMatrix.tsx: Serializer.addClass → ElementFactory → ReactQuestionFactory.
 */
import { useEffect, useRef, useState } from "react";
import { ElementFactory, Question, Serializer } from "survey-core";
import { ReactQuestionFactory } from "survey-react-ui";

// ── Theme (inline, no MUI) ────────────────────────────────────────────
const C = {
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

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

function toAbsoluteSignatureUrl(url: string): string {
  if (!url || url.startsWith("http") || url.startsWith("data:")) return url;
  if (!url.startsWith("/")) return url;
  try {
    return `${new URL(SP_SITE_URL).origin}${url}`;
  } catch {
    return url;
  }
}

function parseSignatureRecord(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function signatureValueToSrc(value: unknown): string {
  if (typeof value === "string") {
    const parsed = parseSignatureRecord(value);
    if (parsed) return signatureValueToSrc(parsed);
    return toAbsoluteSignatureUrl(value);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  for (const key of ["Url", "url", "serverRelativeUrl", "ServerRelativeUrl"]) {
    const next = record[key];
    if (typeof next === "string" && next.trim()) return toAbsoluteSignatureUrl(next.trim());
  }
  return "";
}

// ── Model ──────────────────────────────────────────────────────────────

class SignatureQuestionModel extends Question {
  getType() {
    return "signaturepad";
  }
  get signatureWidth() {
    return (this.getPropertyValue("signatureWidth") as number) ?? 400;
  }
  set signatureWidth(v: number) {
    this.setPropertyValue("signatureWidth", v);
  }
  get signatureHeight() {
    return (this.getPropertyValue("signatureHeight") as number) ?? 200;
  }
  set signatureHeight(v: number) {
    this.setPropertyValue("signatureHeight", v);
  }
  get penColor() {
    return (this.getPropertyValue("penColor") as string) ?? "#000000";
  }
  set penColor(v: string) {
    this.setPropertyValue("penColor", v);
  }
  get backgroundColor() {
    return (this.getPropertyValue("backgroundColor") as string) ?? "#FFFFFF";
  }
  set backgroundColor(v: string) {
    this.setPropertyValue("backgroundColor", v);
  }
  get exportFormat() {
    return (this.getPropertyValue("exportFormat") as string) ?? "PNG";
  }
  set exportFormat(v: string) {
    this.setPropertyValue("exportFormat", v);
  }
}

// ── Canvas Drawing Helpers ─────────────────────────────────────────────

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

function SignatureModal({
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

// ── Main Question Component ────────────────────────────────────────────

function SignatureQuestion({ question }: { question: SignatureQuestionModel }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const value = question.value as unknown;
  const signatureSrc = signatureValueToSrc(value);
  const readOnly = question.isReadOnly;

  const hasSignature = !!signatureSrc;

  const handleSave = (dataUrl: string) => {
    question.value = dataUrl;
    setModalOpen(false);
    setLocked(true);
  };

  const handleClear = () => {
    question.value = null;
    setLocked(false);
    setModalOpen(false);
  };

  // Empty state — click to sign
  if (!hasSignature) {
    if (readOnly) {
      return (
        <div
          style={{
            width: "100%",
            minHeight: 72,
            border: `1px dashed ${C.border}`,
            borderRadius: 12,
            background: C.offWhite,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.textMuted,
            fontSize: 12,
          }}
        >
          No signature captured
        </div>
      );
    }

    return (
      <div>
        <button
          onClick={() => setModalOpen(true)}
          type="button"
          style={{
            width: "100%", minHeight: 120,
            border: `2px dashed ${C.purpleMid}`,
            borderRadius: 12, background: C.purplePale,
            cursor: "pointer", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 8, padding: "24px", fontFamily: "'DM Sans', sans-serif",
            transition: "background-color .2s, border-color .2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = C.purple;
            e.currentTarget.style.background = C.white;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = C.purpleMid;
            e.currentTarget.style.background = C.purplePale;
          }}
        >
          <span style={{ fontSize: 32 }}>✍️</span>
          <span style={{ fontSize: 13, color: C.purple, fontWeight: 600 }}>
            Click to sign
          </span>
          <span style={{ fontSize: 11, color: C.textMuted }}>
            A signature box will open for you to draw your signature
          </span>
        </button>

        {modalOpen && (
          <SignatureModal
            width={question.signatureWidth}
            height={question.signatureHeight}
            penColor={question.penColor}
            backgroundColor={question.backgroundColor}
            onSave={handleSave}
            onCancel={() => setModalOpen(false)}
          />
        )}
      </div>
    );
  }

  // Signed state — show image + edit/clear controls
  return (
    <div>
      <div
        style={{
          border: `1px solid ${C.purpleMid}`, borderRadius: 12,
          overflow: "hidden", background: question.backgroundColor,
          position: "relative",
        }}
      >
        <img
          src={signatureSrc}
          alt="Signature"
          style={{
            width: "100%", maxHeight: question.signatureHeight,
            objectFit: "contain", display: "block",
          }}
        />

        {!readOnly && (
          <div
            style={{
              position: "absolute", inset: 0,
              background: "rgba(255,255,255,0.0)",
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 10, opacity: 0, transition: "opacity .2s, background-color .2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.background = "rgba(255,255,255,0.85)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "0";
              e.currentTarget.style.background = "rgba(255,255,255,0.0)";
            }}
          >
            {locked ? (
              <button
                onClick={() => setLocked(false)}
                type="button"
                style={{
                  height: 36, padding: "0 16px", borderRadius: 8,
                  border: `1px solid ${C.purpleMid}`, background: C.white,
                  color: C.purple, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <span>🔓</span> Unlock to Edit
              </button>
            ) : (
              <>
                <button
                  onClick={() => setModalOpen(true)}
                  type="button"
                  style={{
                    height: 36, padding: "0 16px", borderRadius: 8,
                    border: "none", background: `linear-gradient(135deg,${C.purple},${C.purpleDark})`,
                    color: C.white, fontSize: 12, fontWeight: 600,
                    cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span>✏️</span> Edit
                </button>
                <button
                  onClick={handleClear}
                  type="button"
                  style={{
                    height: 36, padding: "0 16px", borderRadius: 8,
                    border: `1px solid ${C.red}`, background: C.white,
                    color: C.red, fontSize: 12, fontWeight: 600,
                    cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span>🗑️</span> Clear
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Locked indicator */}
      {locked && !readOnly && (
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: C.green }}>🔒</span>
          <span style={{ fontSize: 10, color: C.textMuted }}>Signature locked — hover to unlock</span>
        </div>
      )}

      {modalOpen && (
        <SignatureModal
          width={question.signatureWidth}
          height={question.signatureHeight}
          penColor={question.penColor}
          backgroundColor={question.backgroundColor}
          existingDataUrl={signatureSrc}
          onSave={handleSave}
          onCancel={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

// ── Registration ───────────────────────────────────────────────────────

let _registered = false;

export function registerSignaturePad(): void {
  if (_registered) return;
  _registered = true;

  // Only add the class if SurveyJS doesn't already define it natively.
  // The native signaturepad is a built-in SurveyJS type — we only need to
  // override its React renderer.
  if (!Serializer.findClass("signaturepad")) {
    Serializer.addClass(
      "signaturepad",
      [
        { name: "signatureWidth:number", default: 400 },
        { name: "signatureHeight:number", default: 200 },
        { name: "penColor", default: "#000000" },
        { name: "backgroundColor", default: "#FFFFFF" },
        { name: "exportFormat", default: "PNG" },
      ],
      () => new SignatureQuestionModel(""),
      "question",
    );
    ElementFactory.Instance.registerElement("signaturepad", (name) => new SignatureQuestionModel(name));
  }

  interface ReactQuestionFactoryFixed {
    registerQuestion(
      questionType: string,
      questionCreator: (props: { question: SignatureQuestionModel }) => React.JSX.Element,
    ): void;
  }

  (ReactQuestionFactory.Instance as unknown as ReactQuestionFactoryFixed).registerQuestion(
    "signaturepad",
    (props) => <SignatureQuestion question={props.question} />,
  );
}

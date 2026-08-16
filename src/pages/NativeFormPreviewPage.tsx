/**
 * NativeFormPreviewPage.tsx — the native engine, rendering a real published form.
 * Route: /native/:formId
 *
 * This exists to be compared against `/form/:formId`, which is unchanged and
 * still the only route that submits anything. Both read the same published
 * SurveyJSON through the same public endpoint, so a difference on screen is a
 * difference in the renderer and nothing else.
 *
 * It deliberately stops at the point of submission and prints the payload it
 * would have sent instead. The real path from there — file uploads to document
 * libraries, SharePoint column mapping, approval-layer resolution, the
 * notification fan-out — is a thousand lines in `DynamicFormPage` that have
 * nothing to do with how a form looks, and duplicating them to evaluate a
 * renderer would risk the one path that people actually submit through.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import NativeFormView from "../native/NativeForm";
import { parseForm } from "../native/schema";
import { useNativeForm } from "../native/useNativeForm";
import { foldOtherAnswers } from "../utils/surveyOtherAnswers";
import { PDPA_CONSENT_LABEL, PDPA_SUMMARY } from "../utils/pdpa";
import { DEMO_FORM } from "../native/demoForm";
import type { DocumentControlHeader } from "../types";

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

/**
 * `/native/demo` renders a bundled sample instead of calling the API, so the
 * engine can be looked at without a SharePoint tenant or a `vercel dev`
 * process. Every other slug is a real published form.
 */
const DEMO_SLUG = "demo";

interface LoadedForm {
  formConfig: Record<string, unknown>;
  surveyJson: Record<string, unknown>;
  meta: Record<string, unknown>;
}

const EMPTY_HEADER: DocumentControlHeader = {
  documentNumber: "",
  issueNumber: "",
  effectiveDate: "",
  revisionNumber: "",
  revisionDate: "",
};

function readDocumentHeader(meta: Record<string, unknown>): DocumentControlHeader {
  const raw = meta.documentHeader;
  if (!raw || typeof raw !== "object") return EMPTY_HEADER;
  const o = raw as Record<string, unknown>;
  return {
    documentNumber: String(o.documentNumber ?? ""),
    issueNumber: String(o.issueNumber ?? ""),
    effectiveDate: String(o.effectiveDate ?? ""),
    revisionNumber: String(o.revisionNumber ?? ""),
    revisionDate: String(o.revisionDate ?? ""),
  };
}

async function loadPublishedForm(slug: string, version: string, publishKey: string): Promise<LoadedForm> {
  const params = new URLSearchParams({ slug });
  if (version) params.set("version", version);
  if (publishKey) params.set("publish", publishKey);

  const res = await fetch(`/api/form-config?${params.toString()}`, {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    },
  });

  const text = await res.text();
  if (text.trim().startsWith("<")) {
    throw new Error("The API returned HTML. Run `npm run dev:api` (vercel dev) so /api/* is served.");
  }
  if (!res.ok) {
    let detail = `Server error ${res.status}`;
    try {
      detail = (JSON.parse(text) as { error?: string }).error || detail;
    } catch {
      detail = `${detail}: ${text.slice(0, 160)}`;
    }
    throw new Error(detail);
  }

  const parsed = JSON.parse(text) as Partial<LoadedForm> & { error?: string };
  if (!parsed.formConfig) throw new Error("The response is missing formConfig.");
  if (!parsed.surveyJson) throw new Error(`Form "${slug}" has no published content on this link.`);

  return {
    formConfig: parsed.formConfig,
    surveyJson: parsed.surveyJson,
    meta: parsed.meta ?? {},
  };
}

export default function NativeFormPreviewPage() {
  const { formId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const pinVersion = searchParams.get("v") || searchParams.get("version") || "";
  const publishKey = searchParams.get("publish") || "";
  const dark = searchParams.get("theme") === "dark";
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);

  // The two cases that need no network call are resolved during render. Only
  // the third — a real published form — reaches the effect, and it writes state
  // exclusively from the promise's callbacks, never synchronously.
  const immediate = useMemo((): { data?: LoadedForm; error?: string } | null => {
    if (!formId) return { error: "No form slug in the URL. Try /native/<slug>." };
    if (formId !== DEMO_SLUG) return null;
    return {
      data: {
        formConfig: { Title: "Training Requisition", CurrentVersion: "demo" },
        surveyJson: DEMO_FORM,
        meta: {
          documentHeader: {
            documentNumber: "PMW-HR-F-014",
            issueNumber: "03",
            effectiveDate: "01 Jan 2026",
            revisionNumber: "02",
            revisionDate: "14 Aug 2026",
          },
        },
      },
    };
  }, [formId]);

  // Tagged with the slug it belongs to, so switching forms invalidates the
  // previous result by comparison rather than by a reset that would have to run
  // inside the effect.
  const [fetched, setFetched] = useState<{ slug: string; data?: LoadedForm; error?: string } | null>(null);

  useEffect(() => {
    if (immediate) return;
    let cancelled = false;
    loadPublishedForm(formId, pinVersion, publishKey)
      .then((data) => {
        if (!cancelled) setFetched({ slug: formId, data });
      })
      .catch((e: unknown) => {
        if (!cancelled) setFetched({ slug: formId, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [immediate, formId, pinVersion, publishKey]);

  const result = immediate ?? (fetched?.slug === formId ? fetched : null);
  const loaded = result?.data ?? null;
  const error = result?.error ?? "";
  const loading = !result;

  // Parsing is memoised on the loaded document, and the runtime reseeds itself
  // whenever that identity changes — so the form is never reparsed on a
  // keystroke, and a genuinely new form never inherits the old answers.
  const form = useMemo(() => parseForm(loaded?.surveyJson ?? {}), [loaded]);
  const runtime = useNativeForm(form);

  const meta = loaded?.meta ?? {};
  const documentHeader = readDocumentHeader(meta);
  const showBanner = meta.showBanner !== false;
  const isoStandards = String(meta.isoStandards || "ISO 9001 · ISO 14001 · ISO 45001");
  const logoUrl = String(meta.logoUrl || "");
  const title = String(loaded?.formConfig?.Title || form.title || "Form");
  const version = String(loaded?.formConfig?.CurrentVersion || "1.0");

  const handleSubmit = () => {
    const { ok } = runtime.validateAll();
    if (!consent) {
      setConsentError("Accept the Privacy Notice before submitting.");
      if (ok) document.querySelector(".nf-consent")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setConsentError("");
    if (!ok) return;
    // `foldOtherAnswers` mutates, and `collect` already returns a fresh object.
    setPayload(foldOtherAnswers(runtime.collect()));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="nf" data-theme={dark ? "dark" : "light"}>
        <div className="nf-shell">
          <p className="nf-hint">Loading form…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="nf" data-theme={dark ? "dark" : "light"}>
        <div className="nf-shell">
          <div className="nf-note" data-tone="error">
            <div>
              <div className="nf-note-title">This form could not be loaded</div>
              <div>{error}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nf" data-theme={dark ? "dark" : "light"} style={{ background: "var(--nf-canvas)", minHeight: "100vh" }}>
      <PreviewBar formId={formId} version={version} />

      {showBanner && (
        <FormBanner title={title} isoStandards={isoStandards} logoUrl={logoUrl} header={documentHeader} />
      )}

      {payload ? (
        <div className="nf-shell">
          <section className="nf-section">
            <div className="nf-section-head">
              <span className="nf-section-index">✓</span>
              <div className="nf-section-heading">
                <h2 className="nf-section-title">Validated — this is what would be submitted</h2>
                <p className="nf-section-desc">
                  Nothing was written to SharePoint. This route renders the form; <code>/form/{formId}</code> is the
                  one that submits.
                </p>
              </div>
            </div>
            <div className="nf-section-body">
              <pre
                style={{
                  margin: 0,
                  padding: 14,
                  borderRadius: 8,
                  background: "var(--nf-sunken)",
                  border: "1px solid var(--nf-line)",
                  fontSize: 12,
                  lineHeight: 1.6,
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(payload, null, 2)}
              </pre>
              <div style={{ marginTop: 14 }}>
                <button type="button" className="nf-btn" data-variant="ghost" onClick={() => setPayload(null)}>
                  Back to the form
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <NativeFormView
          runtime={runtime}
          dark={dark}
          submitLabel="Submit"
          onSubmit={handleSubmit}
          footer={
            <label className="nf-consent" data-invalid={!!consentError}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  if (e.target.checked) setConsentError("");
                }}
              />
              <span>
                <strong>{PDPA_CONSENT_LABEL}</strong>
                <br />
                {PDPA_SUMMARY}{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer">
                  View Privacy Notice
                </a>
                {consentError && (
                  <span className="nf-error" style={{ marginTop: 6 }}>
                    {consentError}
                  </span>
                )}
              </span>
            </label>
          }
        />
      )}
    </div>
  );
}

/** Names the route for what it is, and links straight to the form it mirrors. */
function PreviewBar({ formId, version }: { formId: string; version: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        padding: "9px 20px",
        borderBottom: "1px solid var(--nf-line)",
        background: "var(--nf-panel)",
        fontSize: 12,
      }}
    >
      <span
        style={{
          padding: "3px 9px",
          borderRadius: 999,
          background: "var(--nf-brand-wash)",
          color: "var(--nf-brand-ink)",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          fontSize: 10,
        }}
      >
        Native engine
      </span>
      <span style={{ color: "var(--nf-ink-soft)" }}>
        {formId} · v{version} · nothing is submitted from this route
      </span>
      <span style={{ marginLeft: "auto", display: "flex", gap: 14 }}>
        {formId !== DEMO_SLUG && (
          <Link to={`/form/${formId}`} style={{ color: "var(--nf-ink-soft)", textDecoration: "none" }}>
            Open the live form
          </Link>
        )}
      </span>
    </div>
  );
}

/**
 * The document-control header, reproduced from `DynamicFormPage` so the two
 * routes differ only below it. It is a controlled document's masthead — the
 * numbers are what an auditor looks for — so it stays a rigid grid rather than
 * becoming part of the form's own visual system.
 */
function FormBanner({
  title,
  isoStandards,
  logoUrl,
  header,
}: {
  title: string;
  isoStandards: string;
  logoUrl: string;
  header: DocumentControlHeader;
}) {
  const cells: [string, string][] = [
    ["Document Number", header.documentNumber ?? ""],
    ["Issue Number", header.issueNumber ?? ""],
    ["Effective Date", header.effectiveDate ?? ""],
    ["Revision Number", header.revisionNumber ?? ""],
    ["Revision Date", header.revisionDate ?? ""],
  ];

  return (
    <div style={{ background: "var(--nf-panel)", borderBottom: "1px solid var(--nf-line)" }}>
      <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
        <div
          style={{
            width: 132,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            padding: "12px 16px",
            borderRight: "1px solid var(--nf-line)",
            background: "var(--nf-sunken)",
          }}
        >
          <img src={logoUrl || "/logo-128.png"} alt="" style={{ maxWidth: "100%", maxHeight: 40, objectFit: "contain" }} />
        </div>
        <div style={{ flex: 1, minWidth: 240, padding: "12px 18px" }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--nf-ink-faint)",
            }}
          >
            {isoStandards}
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>{title}</h1>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          borderTop: "1px solid var(--nf-line)",
        }}
      >
        {cells.map(([label, value]) => (
          <div
            key={label}
            style={{
              padding: "8px 14px",
              borderRight: "1px solid var(--nf-line)",
              fontSize: 11,
              display: "flex",
              gap: 6,
              alignItems: "baseline",
              minWidth: 0,
            }}
          >
            <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span>
            <span style={{ color: "var(--nf-ink-soft)", overflow: "hidden", textOverflow: "ellipsis" }}>
              {value || "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

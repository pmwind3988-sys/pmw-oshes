/**
 * testRunLaunch.ts — the pure, easily-tested half of "launch a test run"
 * from the form builder.
 *
 * `sampleAnswersFor` fills a survey with recognisably-fake answers so a
 * tester rehearsing a workflow does not have to type through every field by
 * hand; it deliberately leaves anything it cannot confidently guess (a
 * signature, a file upload) blank rather than risk submitting garbage.
 *
 * A *simulated* run (the builder's "Simulate submission") also signs every
 * signature pad with `SAMPLE_SIGNATURE`, because it submits without the
 * tester touching the form and a required signature would otherwise stop it.
 * A file upload is still left blank: there is no honest sample file, so a
 * form that requires one stops and asks the tester for it.
 *
 * `testRunFormUrl` builds the link the dashboard's "Test workflow" opens. This app
 * has exactly one form route — `/form/:formId` (see `src/App.tsx`) — so
 * there is no public/signed-in split to encode here.
 */

type SurveyElement = {
  type?: string;
  name?: string;
  inputType?: string;
  choices?: (string | { value?: unknown; text?: unknown })[];
  elements?: SurveyElement[];
  rateMin?: number;
  rateMax?: number;
};

type SurveyPage = { elements?: SurveyElement[] };

/** A scribbled line, as a PNG data URL — obviously a sample, never a real signature. */
export const SAMPLE_SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAAAyCAAAAAA8Oss9AAABH0lEQVR42u2YURLDIAhEuQv3P2M7048mRsRFpJO262cMu76AhkQePzKEIAQhCEEIQhCCEIQgBCHIv4Loa3w7iB4jHnQfEG3GQtBNQM6LgZelKD2sKKgrOIf5noPGKKGkSaoGjKuI6+UeRxsnkVAJKJCquWt/hxqJPa5BKILWf8cylJ+ZmvNqWIW2ikT2hiq0SX3T+YYYJX8VZFA3QOF6pn6YozwhkfDBh2w/95RLHJArILkX1Sg6peoGSwnHKD6p6hWC1HDYCmlVh0RSfUH4bbGjH8JBNjVyV5USVe1A3vP7GtKVLiyYFLVANvfVredG2bZ18UD2fbZpxeOxn7nY7U6BZ4nsB38+aM3XfKfJvygEIQhBCEIQghCEIASZgjwBh+0QvNFBf8IAAAAASUVORK5CYII=";

export interface SampleAnswerOptions {
  /** Sign every signature pad with `SAMPLE_SIGNATURE` (simulated runs only). */
  signatures?: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sample values for the `<input type>`s that cannot hold a sentence.
 *
 * A text question is only textual when its input type is. Anything temporal,
 * numeric or a colour has a format SharePoint parses, and handing it
 * "Test answer — dateTime" fails the whole submission with "Cannot convert a
 * primitive value to the expected type 'Edm.DateTime'" — which reads as a
 * broken form rather than a broken rehearsal.
 */
function typedInputSample(inputType: string): unknown {
  const now = new Date();
  switch (inputType) {
    case "number":
    case "range":
      return 1;
    case "date":
      return todayIso();
    case "datetime-local":
    case "datetime":
      return now.toISOString().slice(0, 16);
    case "time":
      return now.toISOString().slice(11, 16);
    case "month":
      return now.toISOString().slice(0, 7);
    case "week": {
      // ISO week, from the Thursday of the current week.
      const thursday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
      const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
      const week = 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7);
      return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
    }
    case "color":
      return "#0F3D91";
    default:
      return undefined;
  }
}

function firstChoiceValue(choices: SurveyElement["choices"]): unknown {
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first = choices[0];
  if (first && typeof first === "object") {
    return (first as { value?: unknown; text?: unknown }).value ?? (first as { value?: unknown; text?: unknown }).text;
  }
  return first;
}

function sampleValueFor(el: SurveyElement, options: SampleAnswerOptions): unknown {
  const type = el.type;
  const name = el.name || "";

  if (type === "signaturepad") return options.signatures ? SAMPLE_SIGNATURE : undefined;

  if (type === "text") {
    const typed = typedInputSample(el.inputType || "");
    if (typed !== undefined) return typed;
    return `Test answer — ${name}`;
  }
  if (type === "comment") {
    return `This is a test answer submitted during a rehearsal of the ${name || "form"} question.`;
  }
  if (type === "dropdown" || type === "radiogroup" || type === "checkbox") {
    const value = firstChoiceValue(el.choices);
    if (value === undefined) return undefined;
    return type === "checkbox" ? [value] : value;
  }
  if (type === "boolean") return true;
  if (type === "rating") {
    const min = typeof el.rateMin === "number" ? el.rateMin : 1;
    const max = typeof el.rateMax === "number" ? el.rateMax : 5;
    return Math.round((min + max) / 2);
  }
  return undefined;
}

/**
 * Walks every page/element of a published SurveyJSON document and returns
 * sample answers for the question types it confidently understands. Any
 * other type — signature pads, file uploads, matrices — is left out of the
 * result entirely, so the tester fills it in themselves rather than
 * submitting a guess that looks real but is not.
 */
export function sampleAnswersFor(
  surveyJson: Record<string, unknown>,
  options: SampleAnswerOptions = {},
): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  const pages = (surveyJson as { pages?: SurveyPage[] })?.pages;
  if (!Array.isArray(pages)) return answers;

  const walk = (elements: SurveyElement[] | undefined) => {
    if (!Array.isArray(elements)) return;
    for (const el of elements) {
      if (el.name) {
        const value = sampleValueFor(el, options);
        if (value !== undefined) answers[el.name] = value;
      }
      if (Array.isArray(el.elements)) walk(el.elements);
    }
  };

  for (const page of pages) walk(page?.elements);
  return answers;
}

/**
 * The link a "Start test run" action opens. There is only one form route in
 * this app, so this always builds `/form/{slug}` with the signed ticket
 * carried in the query string — the server reads the authoritative test
 * address out of that ticket, never out of anything else in the URL.
 */
export function testRunFormUrl(params: { slug: string; ticket: string; simulate?: boolean }): string {
  const query = new URLSearchParams({ testTicket: params.ticket });
  // Asks the form to fill itself with sample answers and submit once loaded.
  // Only honoured alongside a test ticket, so it cannot submit a real request.
  if (params.simulate) query.set("simulate", "1");
  return `/form/${encodeURIComponent(params.slug)}?${query.toString()}`;
}

/**
 * The delegated scope a test-run call asks for. It must name SharePoint's
 * origin, never the app's own — Azure answers AADSTS500011 for a resource that
 * does not exist in the tenant.
 */
export function testRunSharePointScope(siteUrl: string = import.meta.env.VITE_SP_SITE_URL || ""): string {
  const origin = new URL(siteUrl || "https://placeholder.sharepoint.com").origin;
  return `${origin}/AllSites.Manage`;
}

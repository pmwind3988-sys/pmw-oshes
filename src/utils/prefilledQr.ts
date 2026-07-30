import type { FormBuilderField, SurveyJson } from "../types";

export const PREFILLED_QR_PARAM = "prefill";

export interface PrefilledQrPayload {
  v: 1;
  values: Record<string, unknown>;
  locked: string[];
}

const BLOCKED_PREFILL_TYPES = new Set([
  "file",
  "html",
  "image",
  "imageupload",
  "signaturepad",
  "expression",
  "matrixdynamic",
  "dynamicmatrix",
  "tableinput",
]);

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrefillValue(value: unknown): boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) {
    return value.every(item => typeof item === "string" || typeof item === "number" || typeof item === "boolean");
  }
  return false;
}

function walkElements(elements: Record<string, unknown>[], visit: (element: Record<string, unknown>) => void): void {
  for (const element of elements) {
    visit(element);
    if (Array.isArray(element.elements)) {
      walkElements(element.elements as Record<string, unknown>[], visit);
    }
  }
}

export function encodePrefilledQrPayload(payload: PrefilledQrPayload): string {
  return encodeBase64Url(JSON.stringify(payload));
}

export function decodePrefilledQrPayload(raw: string | null): PrefilledQrPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(raw)) as unknown;
    if (!isRecord(parsed) || parsed.v !== 1 || !isRecord(parsed.values) || !Array.isArray(parsed.locked)) return null;
    const values: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.values)) {
      if (typeof key !== "string" || !key || !isPrefillValue(value)) continue;
      values[key] = value;
    }
    const locked = parsed.locked.filter((name): name is string => typeof name === "string" && Object.hasOwn(values, name));
    if (Object.keys(values).length === 0) return null;
    return { v: 1, values, locked };
  } catch {
    return null;
  }
}

export function applyPrefilledQrToSurveyJson(json: Record<string, unknown>, payload: PrefilledQrPayload | null): Record<string, unknown> {
  if (!payload) return json;
  const locked = new Set(payload.locked);
  const pages = json.pages as { elements?: Record<string, unknown>[] }[] | undefined;
  if (!Array.isArray(pages)) return json;

  for (const page of pages) {
    if (!Array.isArray(page.elements)) continue;
    walkElements(page.elements, element => {
      const name = typeof element.name === "string" ? element.name : "";
      if (!name || !Object.hasOwn(payload.values, name)) return;
      element.defaultValue = payload.values[name];
      if (locked.has(name)) {
        element.readOnly = true;
        element.enableIf = "false";
      }
    });
  }

  return json;
}

export function cloneAndApplyPrefilledQr(json: Record<string, unknown>, payload: PrefilledQrPayload | null): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(json)) as Record<string, unknown>;
  return applyPrefilledQrToSurveyJson(clone, payload);
}

export function getPrefillEligibleFields(json: SurveyJson | null | undefined, flatten: (json: SurveyJson) => FormBuilderField[]): FormBuilderField[] {
  if (!json) return [];
  return flatten(json).filter(field => {
    if (!field.name || BLOCKED_PREFILL_TYPES.has(field.type)) return false;
    const expression = (field as unknown as Record<string, unknown>)._expression || (field as unknown as Record<string, unknown>).expression;
    return !expression;
  });
}

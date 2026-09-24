/**
 * fileAttachments.ts — the files somebody attached to a form, read back out of
 * the stored answer.
 *
 * A file question is stored as the address of each uploaded file: one URL for a
 * single file, a JSON array of URLs for several. Everything that shows those
 * files — the review pages, the PDF's links, the "with attachments" download —
 * has to agree on which answers are attachments and what each one is called,
 * so that agreement lives here. Pure: nothing in this file fetches.
 */
import { createResponseKeyResolver } from "./responseKeys";
import { isRecord, parseMaybeJson } from "./pdfImageSources";

type SurveyElement = Record<string, unknown>;

/** Question types whose answer is one or more uploaded files. */
export const FILE_QUESTION_TYPES: ReadonlySet<string> = new Set(["file", "imageupload"]);

export function isFileQuestionType(type: string | undefined | null): boolean {
  return FILE_QUESTION_TYPES.has(String(type ?? "").toLowerCase());
}

/** One file attached to a record. */
export interface RecordAttachment {
  /** The question it was attached to. */
  fieldLabel: string;
  /** The stored key the answer lives under. */
  fieldKey: string;
  /** What to call the file: its name, decoded, without the folder path. */
  name: string;
  /** Where it is stored. A SharePoint address, absolute or server-relative. */
  url: string;
}

interface FileQuestion {
  name: string;
  title: string;
}

function childElements(element: SurveyElement): SurveyElement[] {
  const children: SurveyElement[] = [];
  for (const key of ["elements", "templateElements", "questions"]) {
    const value = element[key];
    if (Array.isArray(value)) children.push(...value.filter(isRecord));
  }
  // A "columns" layout holds questions; a matrix's columns are cell definitions.
  const type = String(element.type ?? "").toLowerCase();
  if (!["matrixdynamic", "dynamicmatrix", "tableinput", "matrixdropdown"].includes(type) && Array.isArray(element.columns)) {
    for (const column of element.columns) {
      if (isRecord(column) && Array.isArray(column.elements)) children.push(...column.elements.filter(isRecord));
    }
  }
  return children;
}

/** Every file question on the form, in the order the form asks them. */
export function fileQuestions(surveyJson: unknown): FileQuestion[] {
  const found: FileQuestion[] = [];
  const seen = new Set<string>();
  const visit = (element: SurveyElement): void => {
    const name = typeof element.name === "string" ? element.name.trim() : "";
    if (name && isFileQuestionType(element.type as string) && !seen.has(name)) {
      seen.add(name);
      const title = typeof element.title === "string" && element.title.trim() ? element.title.trim() : name;
      found.push({ name, title });
    }
    for (const child of childElements(element)) visit(child);
  };
  const pages = isRecord(surveyJson) && Array.isArray(surveyJson.pages) ? surveyJson.pages : [];
  for (const page of pages) {
    if (isRecord(page)) visit(page);
  }
  return found;
}

/**
 * The stored keys that hold file answers.
 *
 * Stored keys are not always the question's name — SharePoint cuts an internal
 * name at 32 characters — so each question is looked up through the same
 * resolver the rest of the record uses.
 */
export function fileAnswerKeys(surveyJson: unknown, responseData: Record<string, unknown>): Set<string> {
  const resolve = createResponseKeyResolver(responseData);
  const keys = new Set<string>();
  for (const question of fileQuestions(surveyJson)) {
    const key = resolve(question.name);
    if (key) keys.add(key);
  }
  return keys;
}

/** A SharePoint URL column stores `"<url>, <description>"` in one string. */
function stripUrlDescription(value: string): string {
  const separatorIndex = value.search(/,\s+/);
  return separatorIndex === -1 ? value : value.slice(0, separatorIndex).trim();
}

const LINK_KEYS = ["Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl"];

/**
 * The addresses in a file answer, in the order they were attached.
 *
 * `data:` URIs are left out: they are a file that was never uploaded (a draft
 * in the browser), and a link to one opens nothing a reader can use.
 */
export function attachmentUrls(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(attachmentUrls);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const parsed = parseMaybeJson(trimmed);
    if (parsed !== null) return attachmentUrls(parsed);
    const candidate = stripUrlDescription(trimmed);
    return /^(https?:\/\/|\/)/i.test(candidate) ? [candidate] : [];
  }
  if (isRecord(value)) {
    for (const key of LINK_KEYS) {
      const next = value[key];
      if (typeof next === "string" && next.trim()) return attachmentUrls(next);
    }
  }
  return [];
}

/** The file's own name, from the tail of its address. */
export function attachmentName(url: string): string {
  const path = (url.trim().split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
  const tail = path.split("/").pop() ?? "";
  try {
    return decodeURIComponent(tail) || "Attached file";
  } catch {
    return tail || "Attached file";
  }
}

const SP_SITE_URL = (import.meta.env?.VITE_SP_SITE_URL || "").replace(/\/$/, "");

/**
 * An address a reader can click from anywhere — a saved PDF included. Uploads
 * are stored server-relative (`/sites/…/Form Files/quote.pdf`), which only
 * resolves inside the site.
 */
export function absoluteAttachmentUrl(url: string, siteUrl = SP_SITE_URL): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return trimmed;
  try {
    return new URL(encodeURI(decodeURI(trimmed)), new URL(siteUrl).origin).toString();
  } catch {
    return trimmed;
  }
}

/** Every file attached to the record, question by question, in form order. */
export function collectRecordAttachments(
  surveyJson: unknown,
  responseData: Record<string, unknown>,
): RecordAttachment[] {
  const resolve = createResponseKeyResolver(responseData);
  const attachments: RecordAttachment[] = [];
  const seenUrls = new Set<string>();
  for (const question of fileQuestions(surveyJson)) {
    const key = resolve(question.name);
    if (!key) continue;
    for (const url of attachmentUrls(responseData[key])) {
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      attachments.push({ fieldLabel: question.title, fieldKey: key, name: attachmentName(url), url });
    }
  }
  return attachments;
}

/** A PDF, by its first bytes. SharePoint's declared content type is not trusted. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  // `%PDF-`, allowing for a little junk before it, which readers tolerate.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

/**
 * The name a file is stored under, made unique for this upload.
 *
 * Uploads land in one library per form, and a second file with the same name
 * replaced the first — so the link on an earlier record silently started opening
 * somebody else's attachment. The stamp goes before the extension so the file
 * still opens with the right program.
 */
export function uniqueUploadFileName(originalName: string, stamp: string): string {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 80);
  const dot = safe.lastIndexOf(".");
  const hasExtension = dot > 0 && dot < safe.length - 1;
  const base = (hasExtension ? safe.slice(0, dot) : safe).replace(/^[._]+|[._]+$/g, "") || "file";
  const extension = hasExtension ? safe.slice(dot) : "";
  return `${base}_${stamp}${extension}`;
}

/** A short stamp that will not repeat between two uploads of the same name. */
export function uploadStamp(now = Date.now(), index = 0, random = Math.random()): string {
  return `${now.toString(36)}${index.toString(36)}${Math.floor(random * 36 ** 3).toString(36).padStart(3, "0")}`;
}

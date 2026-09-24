/**
 * publicFileUpload.ts — sending a public form's attachments ahead of it.
 *
 * A public submission goes through our serverless API, and a serverless
 * request is capped at about 4.5 MB. With every file inside the submission as
 * base64, two phone photos or one scanned PDF were enough to fail the form. So
 * each attached file is uploaded first, a piece at a time, through
 * `/api/submit-form`'s `upload-start` / `upload-chunk` actions, and the
 * submission carries only the addresses the files were stored at.
 */
import { fileQuestions } from "./fileAttachments";

export interface PublicUploadTarget {
  listTitle: string;
  formVersion?: string;
  publishKey?: string;
}

/** Posts one JSON request to the upload API and returns its parsed reply. */
export type UploadPost = (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;

interface PendingFile {
  name: string;
  content: string;
}

function pendingFile(value: unknown): PendingFile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const content = record.content ?? record.data ?? record.fileContent;
  if (typeof content !== "string" || !content.startsWith("data:")) return null;
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "attachment";
  return { name, content };
}

function base64Payload(dataUri: string): string {
  const comma = dataUri.indexOf(",");
  return comma >= 0 ? dataUri.slice(comma + 1) : "";
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function uploadOne(
  target: PublicUploadTarget,
  fieldName: string,
  file: PendingFile,
  post: UploadPost,
): Promise<string> {
  const bytes = base64ToBytes(base64Payload(file.content));
  const started = await post({
    action: "upload-start",
    listTitle: target.listTitle,
    formVersion: target.formVersion,
    publishKey: target.publishKey,
    fieldName,
    fileName: file.name,
    size: bytes.length,
  });
  const uploadUrl = typeof started.uploadUrl === "string" ? started.uploadUrl : "";
  const chunkBytes = Number(started.chunkBytes);
  if (!uploadUrl || !Number.isInteger(chunkBytes) || chunkBytes <= 0) {
    throw new Error(`"${file.name}" could not be uploaded.`);
  }

  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    const piece = bytes.subarray(offset, Math.min(offset + chunkBytes, bytes.length));
    const reply = await post({
      action: "upload-chunk",
      uploadUrl,
      offset,
      size: bytes.length,
      data: bytesToBase64(piece),
    });
    if (reply.done === true) {
      if (typeof reply.url !== "string" || !reply.url) throw new Error(`"${file.name}" could not be uploaded.`);
      return reply.url;
    }
  }
  throw new Error(`"${file.name}" did not finish uploading.`);
}

/**
 * Upload every attached file in `body` and replace each file answer with the
 * list of addresses it was stored at. Answers with nothing waiting to upload
 * are left as they are. Mutates `body`.
 */
export async function uploadPublicAttachments(
  body: Record<string, unknown>,
  surveyJson: unknown,
  target: PublicUploadTarget,
  post: UploadPost,
): Promise<void> {
  for (const question of fileQuestions(surveyJson)) {
    const value = body[question.name];
    const entries = Array.isArray(value) ? value : value ? [value] : [];
    const files = entries.map(pendingFile);
    if (!files.some(Boolean)) continue;
    const urls: string[] = [];
    for (const [index, file] of files.entries()) {
      if (file) {
        urls.push(await uploadOne(target, question.name, file, post));
      } else if (typeof entries[index] === "string" && entries[index]) {
        urls.push(entries[index] as string);
      }
    }
    body[question.name] = urls;
  }
}

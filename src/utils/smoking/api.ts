import type { SmokingProfile } from "./schema";

const PASS_KEY = "oshes.smokingPass";
const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

export type ScanOutcome =
  | { result: "in"; timeIn: string; areaName: string; previousMissedScanOut?: true }
  | { result: "out"; timeIn: string; timeOut: string; areaName: string; durationMinutes: number; flagged: boolean }
  | { result: "already-in"; timeIn: string; areaName: string }
  | { result: "already-out"; timeOut: string; areaName: string }
  | { result: "retired-area" }
  | { result: "no-profile" }
  | { result: "blocked" };

export interface SignInResult {
  pass: string;
  email: string;
  name: string;
  profile: SmokingProfile | null;
}

export class SmokingApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function readStoredPass(): string {
  try {
    return localStorage.getItem(PASS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storePass(pass: string): void {
  try {
    localStorage.setItem(PASS_KEY, pass);
  } catch {
    // Private window: the smoker signs in again next scan, nothing is lost.
  }
}

export function clearStoredPass(): void {
  try {
    localStorage.removeItem(PASS_KEY);
  } catch {
    // As above.
  }
}

export async function callSmoking<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const pass = readStoredPass();
  let res: Response;
  try {
    res = await fetch("/api/smoking", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
        ...(pass ? { Authorization: `Bearer ${pass}` } : {}),
      },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new SmokingApiError("Not recorded — no connection. Tap to try again.", 0, "network");
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof data.error === "string" ? data.error : "error";
    if (res.status === 401 && code === "signin-required") clearStoredPass();
    const message = typeof data.detail === "string" ? data.detail : code;
    throw new SmokingApiError(message, res.status, code);
  }
  return data as T;
}

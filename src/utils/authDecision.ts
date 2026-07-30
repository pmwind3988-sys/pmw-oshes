import type { AuthDecision } from "../types";

const STORAGE_KEY = "pmw_hr_auth_decision";

export function getStoredAuthDecision(): AuthDecision | null {
  try {
    return localStorage.getItem(STORAGE_KEY) as AuthDecision | null;
  } catch {
    // localStorage not available
    return null;
  }
}

export function setStoredAuthDecision(value: AuthDecision): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage not available
  }
}

export function clearStoredAuthDecision(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage not available
  }
}

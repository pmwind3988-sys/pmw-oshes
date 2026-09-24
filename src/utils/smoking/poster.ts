import { callSmoking, SmokingApiError } from "./api";

export type PosterCheck = { kind: "open"; name: string } | { kind: "retired" };

/**
 * Look a scanned poster up before asking anyone to sign in. A switched-off area
 * and a code no area answers to read the same to the smoker: the poster is not
 * in use. Anything else — no connection, a server fault — is not the poster's
 * fault and is thrown for the page to offer a retry.
 */
export async function checkPoster(code: string, call: typeof callSmoking = callSmoking): Promise<PosterCheck> {
  try {
    const area = await call<{ name: string; active: boolean }>("area", { code });
    return area.active ? { kind: "open", name: area.name } : { kind: "retired" };
  } catch (e) {
    if (e instanceof SmokingApiError && e.code === "unknown-area") return { kind: "retired" };
    throw e;
  }
}

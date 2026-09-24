import type { DepartmentList } from "./departments.js";
import { IdTokenError, type VerifiedIdentity } from "./idToken.js";
import { issuePass, readPass } from "./pass.js";
import { recordScan } from "./scan.js";
import type { SmokingProfile, StoredProfile } from "./schema.js";
import type { SmokingStore } from "./store.js";

export interface SmokingDeps {
  store: SmokingStore;
  verifyGoogle(idToken: string): Promise<VerifiedIdentity>;
  verifyMicrosoft(idToken: string): Promise<VerifiedIdentity>;
  departments(): Promise<DepartmentList>;
  passSecret: string;
  now(): Date;
}

export interface SmokingRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface SmokingResponse {
  status: number;
  body: Record<string, unknown>;
}

const ok = (body: Record<string, unknown>): SmokingResponse => ({ status: 200, body });
const fail = (status: number, error: string): SmokingResponse => ({ status, body: { error } });

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function bearer(headers: SmokingRequest["headers"]): string {
  const raw = headers.authorization ?? headers.Authorization;
  const value = Array.isArray(raw) ? raw[0] : raw ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

/** The profile as the smoker sees it — never the SharePoint item id or the blocked flag. */
function publicProfile(profile: StoredProfile | null): SmokingProfile | null {
  if (!profile) return null;
  const { id: _id, blocked: _blocked, ...rest } = profile;
  return rest;
}

export async function handleSmoking(req: SmokingRequest, deps: SmokingDeps): Promise<SmokingResponse> {
  if (req.method !== "POST") return fail(405, "Method not allowed");
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const action = text(body.action);
  const now = deps.now();

  if (action === "signin") {
    const provider = text(body.provider);
    const idToken = text(body.idToken, 8192);
    if (!idToken || (provider !== "google" && provider !== "microsoft")) return fail(400, "Missing sign-in");
    let identity: VerifiedIdentity;
    try {
      identity = provider === "google" ? await deps.verifyGoogle(idToken) : await deps.verifyMicrosoft(idToken);
    } catch (error) {
      if (error instanceof IdTokenError) return { status: 401, body: { error: "signin-failed", detail: error.message } };
      throw error;
    }
    const profile = await deps.store.findProfile(identity.email);
    if (profile?.blocked) return fail(403, "blocked");
    if (profile) await deps.store.touchProfile(profile.id, now);
    return ok({
      pass: issuePass(identity.email, identity.method, deps.passSecret, now),
      email: identity.email,
      name: identity.name,
      profile: publicProfile(profile),
    });
  }

  if (action === "area") {
    const area = await deps.store.findArea(text(body.code, 20).toUpperCase());
    return area ? ok({ name: area.name, active: area.active }) : fail(404, "unknown-area");
  }

  // Check for valid protected actions before checking pass
  const validActions = ["profile-get", "profile-save", "departments", "scan"];
  if (!validActions.includes(action)) return fail(400, "Unknown action");

  const holder = readPass(bearer(req.headers), deps.passSecret, now);
  if (!holder) return fail(401, "signin-required");

  switch (action) {
    case "profile-get": {
      const profile = await deps.store.findProfile(holder.email);
      if (profile?.blocked) return fail(403, "blocked");
      return ok({ profile: publicProfile(profile) });
    }

    case "profile-save": {
      const existing = await deps.store.findProfile(holder.email);
      if (existing?.blocked) return fail(403, "blocked");
      const profile: SmokingProfile = {
        email: holder.email,
        fullName: text(body.fullName),
        department: text(body.department),
        departmentFromList: body.departmentFromList !== false,
        position: text(body.position),
        staffId: text(body.staffId, 50),
        company: text(body.company) || "PMW",
        signInMethod: holder.method,
      };
      if (!profile.fullName) return fail(400, "Full name is required.");
      if (!profile.department) return fail(400, "Department is required.");
      if (!profile.position) return fail(400, "Position is required.");
      await deps.store.saveProfile(profile, now);
      return ok({ profile });
    }

    case "departments": {
      const list = await deps.departments();
      return ok({ departments: list.departments, fromList: list.fromList });
    }

    case "scan": {
      const outcome = await recordScan(deps.store, { email: holder.email, areaCode: text(body.areaCode, 20), now });
      if (outcome.result === "blocked") return fail(403, "blocked");
      return ok(outcome);
    }

    default:
      // This should never be reached since we validated above, but TypeScript wants it
      return fail(400, "Unknown action");
  }
}

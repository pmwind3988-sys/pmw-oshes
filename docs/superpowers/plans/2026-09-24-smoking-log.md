# Smoking Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A QR-driven smoking break log — smokers sign in with Google (or a PMW Microsoft account), register a profile once, scan an area poster to clock IN and the same poster to clock OUT — plus an OSHES admin page to review, edit, delete, total and export the breaks.

**Architecture:** One Vercel function (`api/smoking.ts`) serves every smoker action; all of its logic lives in small pure/injectable modules under `api/_utils/smoking/` so Vitest can cover it. The server verifies Google/Microsoft ID tokens itself, then hands the phone an HMAC-signed 90-day "smoking pass"; IN/OUT is decided server-side on the server's clock. The admin page is a new portal screen that reads and writes the three SharePoint lists with the admin's own delegated token (the same way the rest of the portal does) and writes every edit/delete to the existing Audit Trail.

**Tech Stack:** React 19 + MUI 9 + react-router 7 (Vite 8), TypeScript 6, Vercel serverless functions, Microsoft Graph (app-only) on the server, SharePoint REST (delegated) in the browser, Google Identity Services, MSAL browser 5, Node `crypto` (no new npm dependencies), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-24-smoking-log-design.md` — read it before starting any task.

## Global Constraints

- **No new npm dependencies.** JWT verification uses Node `crypto`; QR uses the existing `qrcode` + `src/utils/qrWithLogo.ts`; CSV uses `src/utils/csv.ts`.
- **Exactly one new Vercel function:** `api/smoking.ts`. The deployment already has 10. All logic goes in `api/_utils/smoking/` (that path is inside Vitest's `include`; `api/*.ts` is not).
- Server imports use the `.js` suffix (`import { x } from "./scanRules.js"`), matching the rest of `api/`. Browser imports have no suffix.
- Tests run with `npx vitest run <path>`. The worktree resolves `node_modules` from the parent checkout; if a run fails with "Cannot find module", run `npm ci` once in the worktree.
- List names (fixed, not configurable): `Smoking Profiles`, `Smoking Log`, `Smoking Areas`. Column internal names are PascalCase with no spaces, identical on server and browser (a parity test enforces this).
- Department name is always spelled out in UI copy as **OSHES** — never "OSHE".
- Rules (verbatim from spec): double-scan window **1 minute**; long-break flag **12 hours**; pass lifetime **90 days**; HR departments cache **24 h**; company default **"PMW"**.
- Flag strings (exact): `Open over 12 hours`, `Lasted over 12 hours`.
- Times are stored as ISO-8601 UTC strings; shown to people in Malaysian time (`Asia/Kuala_Lumpur`).
- Delete is **permanent**, behind a Yes/No dialog whose default focus is **No**. Every admin edit, delete, flag resolution and area change calls `writeAuditEntry` (`src/utils/portalAudit.ts`).
- Visibility: the Smoking log nav item shows for `access.isAdmin || access.isAuditor`. Writes require `access.isAdmin && !access.readOnly`.
- Commit messages follow the repo's style (plain sentence describing the user-visible effect) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

Server (`api/`):
- `api/_utils/smoking/schema.ts` — list/column names, types, flag constants.
- `api/_utils/smoking/scanRules.ts` — pure IN/OUT/flag decisions.
- `api/_utils/smoking/pass.ts` — issue/read the HMAC smoking pass.
- `api/_utils/smoking/idToken.ts` — RS256 JWT verification for Google and Microsoft ID tokens.
- `api/_utils/smoking/departments.ts` — HR Departments list reader + 24 h cache with last-good fallback.
- `api/_utils/smoking/store.ts` — `SmokingStore` interface + Graph implementation.
- `api/_utils/smoking/scan.ts` — `recordScan` (rules + store + concurrency guard).
- `api/_utils/smoking/handler.ts` — request routing/validation with injected deps.
- `api/smoking.ts` — thin Vercel wrapper wiring real deps.

Browser (`src/`):
- `src/utils/smoking/schema.ts` — browser mirror of names, SP column specs, flag rule.
- `src/utils/smoking/api.ts` — pass storage + `callSmoking`.
- `src/utils/smoking/googleSignIn.ts` — load GIS script, render button.
- `src/utils/smoking/outcome.ts` — scan outcome → screen text; MYT formatting.
- `src/pages/SmokingScanPage.tsx` — the `/smoke` page.
- `src/utils/smoking/adminData.ts` — pure filtering, totals, edit recompute, CSV, audit text.
- `src/utils/smoking/adminStore.ts` — SharePoint REST reads/writes + provisioning.
- `src/pages/portal/SmokingLogScreen.tsx` — the admin screen (tabs).
- `src/components/smoking/BreakEditDialog.tsx`, `DeleteBreakDialog.tsx`, `ResolveFlagDialog.tsx`, `AreaDialog.tsx`, `printSmokingPoster.ts`.

Modified: `src/App.tsx`, `src/types/portal.ts`, `src/utils/portalRole.ts` (+ its test), `src/pages/PortalPage.tsx`, `src/components/portal/PortalShell.tsx`, `src/utils/formBuilderSP.ts` (indexes), `vercel.json` (CSP), `.env.example`, `scripts/check-env.mjs`, `SETUP.md`.

---

### Task 1: Server schema and scan rules

**Files:**
- Create: `api/_utils/smoking/schema.ts`
- Create: `api/_utils/smoking/scanRules.ts`
- Test: `api/_utils/smoking/scanRules.test.ts`

**Interfaces:**
- Produces: `SMOKING_LISTS`, `PROFILE_COLUMNS`, `LOG_COLUMNS`, `AREA_COLUMNS`, `FLAG_OPEN_LONG`, `FLAG_LASTED_LONG`, types `SignInMethod`, `SmokingProfile`, `SmokingArea`, `SmokingBreak`; `DOUBLE_SCAN_WINDOW_MS`, `LONG_BREAK_MS`, `durationMinutes(timeIn: Date, timeOut: Date): number`, `flagReasonFor(timeIn: Date, timeOut: Date | null, now: Date): string`, `decideScan(openBreak: SmokingBreak | null, now: Date): ScanDecision`.

- [ ] **Step 1: Write the schema module** (no test of its own — it is data, exercised by every later test)

```ts
// api/_utils/smoking/schema.ts
/**
 * Smoking log lists and their columns.
 *
 * Mirrored in `src/utils/smoking/schema.ts` — the browser provisions these lists
 * and the server writes to them, so both halves must name every column the same.
 * `src/utils/smoking/schema.parity.test.ts` fails if they drift.
 */
export const SMOKING_LISTS = {
  profiles: "Smoking Profiles",
  log: "Smoking Log",
  areas: "Smoking Areas",
} as const;

/** Title on Smoking Profiles holds the email too, so the list reads sensibly in SharePoint. */
export const PROFILE_COLUMNS = [
  "Email", "FullName", "Department", "DepartmentFromList", "Position",
  "StaffId", "Company", "SignInMethod", "FirstSeen", "LastSeen",
] as const;

export const LOG_COLUMNS = [
  "Email", "FullName", "Department", "Position", "Company", "Status",
  "AreaInCode", "AreaInName", "AreaOutCode", "AreaOutName",
  "TimeIn", "TimeOut", "DurationMinutes",
  "FlagReason", "ResolutionNote", "ResolvedBy", "ResolvedAt",
] as const;

/** Title on Smoking Areas is the area's name. */
export const AREA_COLUMNS = ["Code", "Active"] as const;

export const FLAG_OPEN_LONG = "Open over 12 hours";
export const FLAG_LASTED_LONG = "Lasted over 12 hours";

export type SignInMethod = "google" | "microsoft";

export interface SmokingProfile {
  email: string;
  fullName: string;
  department: string;
  /** False when HR's list was unreachable and the person typed the department. */
  departmentFromList: boolean;
  position: string;
  staffId: string;
  company: string;
  signInMethod: SignInMethod;
}

export interface SmokingArea {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface SmokingBreak {
  id: string;
  email: string;
  fullName: string;
  department: string;
  position: string;
  company: string;
  areaInCode: string;
  areaInName: string;
  areaOutCode: string;
  areaOutName: string;
  timeIn: string;
  timeOut: string | null;
  durationMinutes: number | null;
  flagReason: string;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// api/_utils/smoking/scanRules.test.ts
import { describe, expect, it } from "vitest";
import { decideScan, durationMinutes, flagReasonFor } from "./scanRules.js";
import { FLAG_LASTED_LONG, FLAG_OPEN_LONG, type SmokingBreak } from "./schema.js";

const at = (iso: string) => new Date(iso);

function openBreak(timeIn: string): SmokingBreak {
  return {
    id: "7", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", position: "Tech",
    company: "PMW", areaInCode: "A1", areaInName: "Block A", areaOutCode: "", areaOutName: "",
    timeIn, timeOut: null, durationMinutes: null, flagReason: "",
  };
}

describe("durationMinutes", () => {
  it("rounds to whole minutes", () => {
    expect(durationMinutes(at("2026-09-24T02:42:00Z"), at("2026-09-24T02:49:29Z"))).toBe(7);
    expect(durationMinutes(at("2026-09-24T02:42:00Z"), at("2026-09-24T02:49:31Z"))).toBe(8);
  });
});

describe("flagReasonFor", () => {
  const timeIn = at("2026-09-24T00:00:00Z");
  it("flags an entry still open after 12 hours", () => {
    expect(flagReasonFor(timeIn, null, at("2026-09-24T12:00:01Z"))).toBe(FLAG_OPEN_LONG);
    expect(flagReasonFor(timeIn, null, at("2026-09-24T11:59:59Z"))).toBe("");
  });
  it("flags a closed break that lasted over 12 hours", () => {
    expect(flagReasonFor(timeIn, at("2026-09-24T12:00:01Z"), at("2026-09-25T00:00:00Z"))).toBe(FLAG_LASTED_LONG);
    expect(flagReasonFor(timeIn, at("2026-09-24T12:00:00Z"), at("2026-09-25T00:00:00Z"))).toBe("");
  });
});

describe("decideScan", () => {
  it("opens a break when none is open", () => {
    expect(decideScan(null, at("2026-09-24T02:42:00Z"))).toEqual({ kind: "open" });
  });

  it("ignores a re-scan inside one minute", () => {
    const open = openBreak("2026-09-24T02:42:00Z");
    expect(decideScan(open, at("2026-09-24T02:42:59Z"))).toEqual({ kind: "already-in", openBreak: open });
  });

  it("closes a break at one minute or later", () => {
    const open = openBreak("2026-09-24T02:42:00Z");
    expect(decideScan(open, at("2026-09-24T02:49:00Z"))).toEqual({
      kind: "close", openBreak: open, durationMinutes: 7, flagReason: "",
    });
  });

  it("closes a break left open overnight and flags it", () => {
    const open = openBreak("2026-09-23T02:00:00Z");
    const decision = decideScan(open, at("2026-09-24T02:00:00Z"));
    expect(decision).toMatchObject({ kind: "close", durationMinutes: 1440, flagReason: FLAG_LASTED_LONG });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run api/_utils/smoking/scanRules.test.ts`
Expected: FAIL — cannot resolve `./scanRules.js`.

- [ ] **Step 4: Write the implementation**

```ts
// api/_utils/smoking/scanRules.ts
import { FLAG_LASTED_LONG, FLAG_OPEN_LONG, type SmokingBreak } from "./schema.js";

/** A second scan this soon after scanning in is a shaky hand, not a break ending. */
export const DOUBLE_SCAN_WINDOW_MS = 60_000;
export const LONG_BREAK_MS = 12 * 60 * 60 * 1000;

export type ScanDecision =
  | { kind: "open" }
  | { kind: "already-in"; openBreak: SmokingBreak }
  | { kind: "close"; openBreak: SmokingBreak; durationMinutes: number; flagReason: string };

export function durationMinutes(timeIn: Date, timeOut: Date): number {
  return Math.round((timeOut.getTime() - timeIn.getTime()) / 60_000);
}

/** Mirrored in `src/utils/smoking/schema.ts`; the parity test runs both. */
export function flagReasonFor(timeIn: Date, timeOut: Date | null, now: Date): string {
  if (timeOut) return timeOut.getTime() - timeIn.getTime() > LONG_BREAK_MS ? FLAG_LASTED_LONG : "";
  return now.getTime() - timeIn.getTime() > LONG_BREAK_MS ? FLAG_OPEN_LONG : "";
}

export function decideScan(openBreak: SmokingBreak | null, now: Date): ScanDecision {
  if (!openBreak) return { kind: "open" };
  const timeIn = new Date(openBreak.timeIn);
  if (now.getTime() - timeIn.getTime() < DOUBLE_SCAN_WINDOW_MS) return { kind: "already-in", openBreak };
  return {
    kind: "close",
    openBreak,
    durationMinutes: durationMinutes(timeIn, now),
    flagReason: flagReasonFor(timeIn, now, now),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run api/_utils/smoking/scanRules.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add api/_utils/smoking/schema.ts api/_utils/smoking/scanRules.ts api/_utils/smoking/scanRules.test.ts
git commit -m "Decide a smoking scan's IN or OUT from the open break and the clock"
```

---

### Task 2: Smoking pass

**Files:**
- Create: `api/_utils/smoking/pass.ts`
- Test: `api/_utils/smoking/pass.test.ts`

**Interfaces:**
- Consumes: `SignInMethod` from `./schema.js`.
- Produces: `PASS_LIFETIME_MS`, `issuePass(email: string, method: SignInMethod, secret: string, now?: Date): string`, `readPass(token: string, secret: string, now?: Date): { email: string; method: SignInMethod } | null`.

- [ ] **Step 1: Write the failing test**

```ts
// api/_utils/smoking/pass.test.ts
import { describe, expect, it } from "vitest";
import { PASS_LIFETIME_MS, issuePass, readPass } from "./pass.js";

const SECRET = "test-secret-at-least-32-characters-long";
const now = new Date("2026-09-24T02:00:00Z");

describe("smoking pass", () => {
  it("round-trips the email and sign-in method", () => {
    const pass = issuePass("Ali@Gmail.com", "google", SECRET, now);
    expect(readPass(pass, SECRET, now)).toEqual({ email: "ali@gmail.com", method: "google" });
  });

  it("expires after 90 days", () => {
    const pass = issuePass("ali@gmail.com", "google", SECRET, now);
    expect(readPass(pass, SECRET, new Date(now.getTime() + PASS_LIFETIME_MS - 1))).not.toBeNull();
    expect(readPass(pass, SECRET, new Date(now.getTime() + PASS_LIFETIME_MS + 1))).toBeNull();
  });

  it("rejects a pass signed with another secret", () => {
    const pass = issuePass("ali@gmail.com", "google", "some-other-secret-that-is-also-long", now);
    expect(readPass(pass, SECRET, now)).toBeNull();
  });

  it("rejects a pass whose email was edited", () => {
    const [body, sig] = issuePass("ali@gmail.com", "google", SECRET, now).split(".");
    const forged = Buffer.from(
      Buffer.from(body, "base64url").toString("utf8").replace("ali@", "abu@"),
    ).toString("base64url");
    expect(readPass(`${forged}.${sig}`, SECRET, now)).toBeNull();
  });

  it("rejects garbage without throwing", () => {
    expect(readPass("", SECRET, now)).toBeNull();
    expect(readPass("abc", SECRET, now)).toBeNull();
    expect(readPass("a.b.c", SECRET, now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_utils/smoking/pass.test.ts`
Expected: FAIL — cannot resolve `./pass.js`.

- [ ] **Step 3: Write the implementation**

```ts
// api/_utils/smoking/pass.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SignInMethod } from "./schema.js";

/**
 * The phone's proof of who scanned, so a scan need not go back to Google or
 * Microsoft. It carries a purpose string so it can never be mistaken for any
 * other token this app signs.
 */
const PURPOSE = "oshes-smoking-pass";
export const PASS_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;

interface PassBody {
  p: string;
  e: string;
  m: SignInMethod;
  x: number;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function issuePass(email: string, method: SignInMethod, secret: string, now: Date = new Date()): string {
  const body: PassBody = { p: PURPOSE, e: email.trim().toLowerCase(), m: method, x: now.getTime() + PASS_LIFETIME_MS };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function readPass(
  token: string,
  secret: string,
  now: Date = new Date(),
): { email: string; method: SignInMethod } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;

  const expected = Buffer.from(sign(encoded, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PassBody;
    if (body.p !== PURPOSE || typeof body.e !== "string" || !body.e) return null;
    if (body.m !== "google" && body.m !== "microsoft") return null;
    if (typeof body.x !== "number" || body.x < now.getTime()) return null;
    return { email: body.e, method: body.m };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_utils/smoking/pass.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add api/_utils/smoking/pass.ts api/_utils/smoking/pass.test.ts
git commit -m "Give a signed-in smoker a 90-day pass so later scans skip sign-in"
```

---

### Task 3: Google and Microsoft ID token verification

**Files:**
- Create: `api/_utils/smoking/idToken.ts`
- Test: `api/_utils/smoking/idToken.test.ts`

**Interfaces:**
- Consumes: `SignInMethod` from `./schema.js`.
- Produces: `Jwk`, `JwksFetcher = (url: string) => Promise<Jwk[]>`, `VerifiedIdentity { email: string; name: string; method: SignInMethod }`, `IdTokenError extends Error`, `verifyGoogleIdToken(token: string, opts: { clientId: string; fetchJwks: JwksFetcher; now?: Date }): Promise<VerifiedIdentity>`, `verifyMicrosoftIdToken(token: string, opts: { clientId: string; tenantId: string; fetchJwks: JwksFetcher; now?: Date }): Promise<VerifiedIdentity>`, `createCachedJwksFetcher(fetchImpl?: typeof fetch, ttlMs?: number): JwksFetcher`, `GOOGLE_JWKS_URL`, `microsoftJwksUrl(tenantId: string): string`.

- [ ] **Step 1: Write the failing test** (signs real RS256 tokens with a throwaway key)

```ts
// api/_utils/smoking/idToken.test.ts
import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GOOGLE_JWKS_URL,
  IdTokenError,
  microsoftJwksUrl,
  verifyGoogleIdToken,
  verifyMicrosoftIdToken,
  type Jwk,
} from "./idToken.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as Jwk), kid: "k1", alg: "RS256" };
const now = new Date("2026-09-24T02:00:00Z");
const nowSec = Math.floor(now.getTime() / 1000);

function jwt(payload: Record<string, unknown>, kid = "k1"): string {
  const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = enc({ alg: "RS256", typ: "JWT", kid });
  const body = enc(payload);
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey).toString("base64url");
  return `${head}.${body}.${signature}`;
}

const fetchedUrls: string[] = [];
const fetchJwks = async (url: string) => {
  fetchedUrls.push(url);
  return [jwk];
};

const google = (overrides: Record<string, unknown> = {}) => jwt({
  iss: "https://accounts.google.com", aud: "g-client", exp: nowSec + 600, iat: nowSec,
  email: "Ali@Gmail.com", email_verified: true, name: "Ali Bin Abu", ...overrides,
});

describe("verifyGoogleIdToken", () => {
  const opts = { clientId: "g-client", fetchJwks, now };

  it("accepts a genuine token and lower-cases the email", async () => {
    await expect(verifyGoogleIdToken(google(), opts)).resolves.toEqual({
      email: "ali@gmail.com", name: "Ali Bin Abu", method: "google",
    });
    expect(fetchedUrls).toContain(GOOGLE_JWKS_URL);
  });

  it("rejects another app's token", async () => {
    await expect(verifyGoogleIdToken(google({ aud: "someone-else" }), opts)).rejects.toThrow(IdTokenError);
  });

  it("rejects an expired token", async () => {
    await expect(verifyGoogleIdToken(google({ exp: nowSec - 1 }), opts)).rejects.toThrow(IdTokenError);
  });

  it("rejects an unverified email", async () => {
    await expect(verifyGoogleIdToken(google({ email_verified: false }), opts)).rejects.toThrow(IdTokenError);
  });

  it("rejects a tampered token", async () => {
    const [h, , s] = google().split(".");
    const forgedBody = Buffer.from(JSON.stringify({
      iss: "https://accounts.google.com", aud: "g-client", exp: nowSec + 600, email: "boss@pmw-group.com", email_verified: true,
    })).toString("base64url");
    await expect(verifyGoogleIdToken(`${h}.${forgedBody}.${s}`, opts)).rejects.toThrow(IdTokenError);
  });

  it("rejects an unknown signing key", async () => {
    await expect(verifyGoogleIdToken(jwt({ aud: "g-client" }, "other-kid"), opts)).rejects.toThrow(IdTokenError);
  });
});

describe("verifyMicrosoftIdToken", () => {
  const opts = { clientId: "ms-client", tenantId: "tenant-1", fetchJwks, now };
  const ms = (overrides: Record<string, unknown> = {}) => jwt({
    iss: "https://login.microsoftonline.com/tenant-1/v2.0", aud: "ms-client", exp: nowSec + 600,
    preferred_username: "Siti@PMW-Group.com", name: "Siti", tid: "tenant-1", ...overrides,
  });

  it("accepts a PMW tenant token", async () => {
    await expect(verifyMicrosoftIdToken(ms(), opts)).resolves.toEqual({
      email: "siti@pmw-group.com", name: "Siti", method: "microsoft",
    });
    expect(fetchedUrls).toContain(microsoftJwksUrl("tenant-1"));
  });

  it("rejects a token from another organisation", async () => {
    await expect(verifyMicrosoftIdToken(ms({ iss: "https://login.microsoftonline.com/other/v2.0" }), opts))
      .rejects.toThrow(IdTokenError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_utils/smoking/idToken.test.ts`
Expected: FAIL — cannot resolve `./idToken.js`.

- [ ] **Step 3: Write the implementation**

```ts
// api/_utils/smoking/idToken.ts
import { createPublicKey, createVerify, type JsonWebKey } from "node:crypto";
import type { SignInMethod } from "./schema.js";

/**
 * Checks a Google or Microsoft ID token ourselves, so the email written into
 * the smoking log is one the provider vouched for — not one typed into the page.
 */
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export function microsoftJwksUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
}

export interface Jwk extends JsonWebKey {
  kid: string;
  alg?: string;
}

export type JwksFetcher = (url: string) => Promise<Jwk[]>;

export interface VerifiedIdentity {
  email: string;
  name: string;
  method: SignInMethod;
}

export class IdTokenError extends Error {}

function decodePart(part: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new IdTokenError("Malformed token");
  }
}

async function verifyRs256(
  token: string,
  jwksUrl: string,
  fetchJwks: JwksFetcher,
  now: Date,
): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new IdTokenError("Malformed token");
  const [head, body, signature] = parts;

  const header = decodePart(head);
  if (header.alg !== "RS256") throw new IdTokenError("Unexpected signing algorithm");

  const keys = await fetchJwks(jwksUrl);
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new IdTokenError("Unknown signing key");

  const verified = createVerify("RSA-SHA256")
    .update(`${head}.${body}`)
    .verify(createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(signature, "base64url"));
  if (!verified) throw new IdTokenError("Bad signature");

  const claims = decodePart(body);
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now.getTime()) {
    throw new IdTokenError("Token expired");
  }
  return claims;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function verifyGoogleIdToken(
  token: string,
  opts: { clientId: string; fetchJwks: JwksFetcher; now?: Date },
): Promise<VerifiedIdentity> {
  const claims = await verifyRs256(token, GOOGLE_JWKS_URL, opts.fetchJwks, opts.now ?? new Date());
  if (!GOOGLE_ISSUERS.has(text(claims.iss))) throw new IdTokenError("Not issued by Google");
  if (claims.aud !== opts.clientId) throw new IdTokenError("Issued to another app");
  if (claims.email_verified !== true) throw new IdTokenError("Google has not verified this email");
  const email = text(claims.email).toLowerCase();
  if (!email) throw new IdTokenError("No email in token");
  return { email, name: text(claims.name), method: "google" };
}

export async function verifyMicrosoftIdToken(
  token: string,
  opts: { clientId: string; tenantId: string; fetchJwks: JwksFetcher; now?: Date },
): Promise<VerifiedIdentity> {
  const claims = await verifyRs256(token, microsoftJwksUrl(opts.tenantId), opts.fetchJwks, opts.now ?? new Date());
  if (claims.iss !== `https://login.microsoftonline.com/${opts.tenantId}/v2.0`) {
    throw new IdTokenError("Not a PMW Microsoft account");
  }
  if (claims.aud !== opts.clientId) throw new IdTokenError("Issued to another app");
  const email = (text(claims.email) || text(claims.preferred_username)).toLowerCase();
  if (!email.includes("@")) throw new IdTokenError("No email in token");
  return { email, name: text(claims.name), method: "microsoft" };
}

/** Signing keys rotate rarely; an hour's cache keeps a scan from waiting on Google. */
export function createCachedJwksFetcher(fetchImpl: typeof fetch = fetch, ttlMs = 60 * 60 * 1000): JwksFetcher {
  const cache = new Map<string, { keys: Jwk[]; until: number }>();
  return async (url) => {
    const hit = cache.get(url);
    if (hit && hit.until > Date.now()) return hit.keys;
    const res = await fetchImpl(url);
    if (!res.ok) throw new IdTokenError(`Could not fetch signing keys (${res.status})`);
    const data = (await res.json()) as { keys?: Jwk[] };
    const keys = data.keys ?? [];
    cache.set(url, { keys, until: Date.now() + ttlMs });
    return keys;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_utils/smoking/idToken.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add api/_utils/smoking/idToken.ts api/_utils/smoking/idToken.test.ts
git commit -m "Check Google and Microsoft sign-ins on the server before trusting the email"
```

---

### Task 4: HR departments with a 24-hour cache

**Files:**
- Create: `api/_utils/smoking/departments.ts`
- Test: `api/_utils/smoking/departments.test.ts`

**Interfaces:**
- Consumes: `graphGet(token, path)` from `../graphClient.js`.
- Produces: `DepartmentSource { hostname: string; sitePath: string; listName: string; column: string }`, `departmentSourceFromEnv(env?: Record<string, string | undefined>): DepartmentSource`, `departmentsPath(source: DepartmentSource): string`, `parseDepartments(data: unknown, column: string): string[]`, `DepartmentList { departments: string[]; fromList: boolean }`, `createDepartmentCache(load: () => Promise<string[]>, ttlMs?: number): { get(now?: Date): Promise<DepartmentList> }`.

- [ ] **Step 1: Write the failing test**

```ts
// api/_utils/smoking/departments.test.ts
import { describe, expect, it, vi } from "vitest";
import { createDepartmentCache, departmentSourceFromEnv, departmentsPath, parseDepartments } from "./departments.js";

describe("department source", () => {
  it("defaults to HR's Departments list on the tenant's SharePoint host", () => {
    const source = departmentSourceFromEnv({ VITE_SP_SITE_URL: "https://pmwgroupcom.sharepoint.com/sites/OSHES" });
    expect(source).toEqual({
      hostname: "pmwgroupcom.sharepoint.com", sitePath: "/sites/PMWHRDocs", listName: "Departments", column: "Title",
    });
    expect(departmentsPath(source)).toBe(
      "/sites/pmwgroupcom.sharepoint.com:/sites/PMWHRDocs:/lists/Departments/items?$expand=fields($select=Title)&$top=999",
    );
  });
});

describe("parseDepartments", () => {
  it("trims, de-duplicates case-insensitively and sorts", () => {
    const data = { value: [
      { fields: { Title: " QA/QC " } }, { fields: { Title: "OSHES" } },
      { fields: { Title: "qa/qc" } }, { fields: { Title: "" } }, { fields: {} },
    ] };
    expect(parseDepartments(data, "Title")).toEqual(["OSHES", "QA/QC"]);
  });
});

describe("createDepartmentCache", () => {
  const t0 = new Date("2026-09-24T00:00:00Z");
  const later = (hours: number) => new Date(t0.getTime() + hours * 3600_000);

  it("loads once per day", async () => {
    const load = vi.fn().mockResolvedValue(["OSHES"]);
    const cache = createDepartmentCache(load);
    await cache.get(t0);
    await cache.get(later(23));
    expect(load).toHaveBeenCalledTimes(1);
    await cache.get(later(25));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("serves the last good copy when HR is unreachable", async () => {
    const load = vi.fn().mockResolvedValueOnce(["OSHES"]).mockRejectedValue(new Error("403"));
    const cache = createDepartmentCache(load);
    await cache.get(t0);
    await expect(cache.get(later(25))).resolves.toEqual({ departments: ["OSHES"], fromList: true });
  });

  it("says the list is unavailable when it has never loaded", async () => {
    const cache = createDepartmentCache(vi.fn().mockRejectedValue(new Error("403")));
    await expect(cache.get(t0)).resolves.toEqual({ departments: [], fromList: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_utils/smoking/departments.test.ts`
Expected: FAIL — cannot resolve `./departments.js`.

- [ ] **Step 3: Write the implementation**

```ts
// api/_utils/smoking/departments.ts
/**
 * Department names come from HR's own list, so the smoking log and HR never
 * disagree on what a department is called. HR's site is a different site on
 * the same SharePoint host; the app-only identity needs read on it (SETUP.md).
 */
export interface DepartmentSource {
  hostname: string;
  sitePath: string;
  listName: string;
  column: string;
}

export interface DepartmentList {
  departments: string[];
  /** False only when HR's list has never been reachable from this instance. */
  fromList: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function departmentSourceFromEnv(env: Record<string, string | undefined> = process.env): DepartmentSource {
  const siteUrl = env.VITE_SP_SITE_URL || env.SP_SITE_URL || "";
  return {
    hostname: siteUrl ? new URL(siteUrl).hostname : "",
    sitePath: env.HR_DEPARTMENTS_SITE_PATH || "/sites/PMWHRDocs",
    listName: env.HR_DEPARTMENTS_LIST || "Departments",
    column: env.HR_DEPARTMENTS_COLUMN || "Title",
  };
}

export function departmentsPath(source: DepartmentSource): string {
  return `/sites/${source.hostname}:${source.sitePath}:/lists/${encodeURIComponent(source.listName)}`
    + `/items?$expand=fields($select=${source.column})&$top=999`;
}

export function parseDepartments(data: unknown, column: string): string[] {
  const rows = (data as { value?: Array<{ fields?: Record<string, unknown> }> })?.value ?? [];
  const byKey = new Map<string, string>();
  for (const row of rows) {
    const raw = row.fields?.[column];
    const name = typeof raw === "string" ? raw.trim() : "";
    if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export function createDepartmentCache(load: () => Promise<string[]>, ttlMs = DAY_MS) {
  let lastGood: string[] | null = null;
  let loadedAt = 0;
  return {
    async get(now: Date = new Date()): Promise<DepartmentList> {
      if (lastGood && now.getTime() - loadedAt < ttlMs) return { departments: lastGood, fromList: true };
      try {
        lastGood = await load();
        loadedAt = now.getTime();
      } catch {
        // Keep serving yesterday's list rather than breaking the profile form.
      }
      return lastGood ? { departments: lastGood, fromList: true } : { departments: [], fromList: false };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_utils/smoking/departments.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add api/_utils/smoking/departments.ts api/_utils/smoking/departments.test.ts
git commit -m "Read department names from HR's list and keep a day's copy"
```

---

### Task 5: Store and recordScan

**Files:**
- Create: `api/_utils/smoking/store.ts`
- Create: `api/_utils/smoking/scan.ts`
- Test: `api/_utils/smoking/scan.test.ts`
- Test: `api/_utils/smoking/store.test.ts`

**Interfaces:**
- Consumes: `decideScan` (Task 1), schema types (Task 1), `queryListItems`, `createListItem`, `updateListItemFields`, `deleteListItem`, `getGraphToken`, `graphFieldEquals`, `GraphListItem` from `../graphClient.js`.
- Produces:
  - `SmokingStore` interface:
    - `findProfile(email: string): Promise<(SmokingProfile & { id: string }) | null>`
    - `saveProfile(profile: SmokingProfile, now: Date): Promise<void>` (create or update by email; sets FirstSeen on create, LastSeen always)
    - `touchProfile(id: string, now: Date): Promise<void>` (LastSeen)
    - `findArea(code: string): Promise<SmokingArea | null>`
    - `openBreaksFor(email: string): Promise<SmokingBreak[]>` (Status = open, oldest first)
    - `createBreak(input: NewBreak): Promise<string>`
    - `closeBreak(id: string, close: BreakClose): Promise<void>`
    - `deleteBreak(id: string): Promise<void>`
  - `NewBreak = Pick<SmokingBreak, "email"|"fullName"|"department"|"position"|"company"|"areaInCode"|"areaInName"|"timeIn">`
  - `BreakClose = { timeOut: string; areaOutCode: string; areaOutName: string; durationMinutes: number; flagReason: string }`
  - `toBreak(item: GraphListItem): SmokingBreak`, `toProfile(item: GraphListItem): SmokingProfile & { id: string }`, `toArea(item: GraphListItem): SmokingArea`
  - `createGraphSmokingStore(getToken?: () => Promise<string>): SmokingStore`
  - `ScanOutcome` union and `recordScan(store: SmokingStore, input: { email: string; areaCode: string; now: Date }): Promise<ScanOutcome>`

- [ ] **Step 1: Write the store (types + Graph implementation)**

```ts
// api/_utils/smoking/store.ts
import {
  createListItem,
  deleteListItem,
  getGraphToken,
  graphFieldEquals,
  queryListItems,
  updateListItemFields,
  type GraphListItem,
} from "../graphClient.js";
import { SMOKING_LISTS, type SmokingArea, type SmokingBreak, type SmokingProfile } from "./schema.js";

export type NewBreak = Pick<
  SmokingBreak,
  "email" | "fullName" | "department" | "position" | "company" | "areaInCode" | "areaInName" | "timeIn"
>;

export interface BreakClose {
  timeOut: string;
  areaOutCode: string;
  areaOutName: string;
  durationMinutes: number;
  flagReason: string;
}

export interface SmokingStore {
  findProfile(email: string): Promise<(SmokingProfile & { id: string }) | null>;
  saveProfile(profile: SmokingProfile, now: Date): Promise<void>;
  touchProfile(id: string, now: Date): Promise<void>;
  findArea(code: string): Promise<SmokingArea | null>;
  openBreaksFor(email: string): Promise<SmokingBreak[]>;
  createBreak(input: NewBreak): Promise<string>;
  closeBreak(id: string, close: BreakClose): Promise<void>;
  deleteBreak(id: string): Promise<void>;
}

const str = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : String(value));

export function toBreak(item: GraphListItem): SmokingBreak {
  const f = item.fields;
  const duration = f.DurationMinutes;
  return {
    id: item.id,
    email: str(f.Email),
    fullName: str(f.FullName),
    department: str(f.Department),
    position: str(f.Position),
    company: str(f.Company),
    areaInCode: str(f.AreaInCode),
    areaInName: str(f.AreaInName),
    areaOutCode: str(f.AreaOutCode),
    areaOutName: str(f.AreaOutName),
    timeIn: str(f.TimeIn),
    timeOut: str(f.TimeOut) || null,
    durationMinutes: typeof duration === "number" ? duration : duration ? Number(duration) : null,
    flagReason: str(f.FlagReason),
  };
}

export function toProfile(item: GraphListItem): SmokingProfile & { id: string } {
  const f = item.fields;
  return {
    id: item.id,
    email: str(f.Email),
    fullName: str(f.FullName),
    department: str(f.Department),
    departmentFromList: str(f.DepartmentFromList) !== "no",
    position: str(f.Position),
    staffId: str(f.StaffId),
    company: str(f.Company),
    signInMethod: str(f.SignInMethod) === "microsoft" ? "microsoft" : "google",
  };
}

export function toArea(item: GraphListItem): SmokingArea {
  const f = item.fields;
  return { id: item.id, code: str(f.Code), name: str(f.Title), active: str(f.Active) !== "no" };
}

/**
 * Graph-backed store on the OSHES site. Lists are provisioned by the admin
 * page (`src/utils/smoking/adminStore.ts`); a missing list surfaces as a 500
 * the handler turns into "not set up yet".
 */
export function createGraphSmokingStore(getToken: () => Promise<string> = getGraphToken): SmokingStore {
  const query = async (list: string, filter: string, top = 50) =>
    queryListItems(await getToken(), list, { filter, top, preferNonIndexed: true });

  return {
    async findProfile(email) {
      const [item] = await query(SMOKING_LISTS.profiles, graphFieldEquals("Email", email), 1);
      return item ? toProfile(item) : null;
    },
    async saveProfile(profile, now) {
      const token = await getToken();
      const fields = {
        Title: profile.email,
        Email: profile.email,
        FullName: profile.fullName,
        Department: profile.department,
        DepartmentFromList: profile.departmentFromList ? "yes" : "no",
        Position: profile.position,
        StaffId: profile.staffId,
        Company: profile.company,
        SignInMethod: profile.signInMethod,
        LastSeen: now.toISOString(),
      };
      const existing = await this.findProfile(profile.email);
      if (existing) await updateListItemFields(token, SMOKING_LISTS.profiles, existing.id, fields);
      else await createListItem(token, SMOKING_LISTS.profiles, { ...fields, FirstSeen: now.toISOString() });
    },
    async touchProfile(id, now) {
      await updateListItemFields(await getToken(), SMOKING_LISTS.profiles, id, { LastSeen: now.toISOString() });
    },
    async findArea(code) {
      const [item] = await query(SMOKING_LISTS.areas, graphFieldEquals("Code", code), 1);
      return item ? toArea(item) : null;
    },
    async openBreaksFor(email) {
      const items = await query(
        SMOKING_LISTS.log,
        `${graphFieldEquals("Email", email)} and ${graphFieldEquals("Status", "open")}`,
      );
      return items.map(toBreak).sort((a, b) => a.timeIn.localeCompare(b.timeIn) || Number(a.id) - Number(b.id));
    },
    async createBreak(input) {
      const { id } = await createListItem(await getToken(), SMOKING_LISTS.log, {
        Title: `${input.email} ${input.timeIn}`,
        Email: input.email,
        FullName: input.fullName,
        Department: input.department,
        Position: input.position,
        Company: input.company,
        Status: "open",
        AreaInCode: input.areaInCode,
        AreaInName: input.areaInName,
        TimeIn: input.timeIn,
      });
      return id;
    },
    async closeBreak(id, close) {
      await updateListItemFields(await getToken(), SMOKING_LISTS.log, id, {
        Status: "closed",
        TimeOut: close.timeOut,
        AreaOutCode: close.areaOutCode,
        AreaOutName: close.areaOutName,
        DurationMinutes: close.durationMinutes,
        FlagReason: close.flagReason,
      });
    },
    async deleteBreak(id) {
      await deleteListItem(await getToken(), SMOKING_LISTS.log, id);
    },
  };
}
```

- [ ] **Step 2: Write the store mapping test**

```ts
// api/_utils/smoking/store.test.ts
import { describe, expect, it } from "vitest";
import { toArea, toBreak, toProfile } from "./store.js";

describe("store mapping", () => {
  it("reads an open break with no time out", () => {
    const row = toBreak({ id: "3", fields: { Email: "ali@gmail.com", TimeIn: "2026-09-24T02:42:00Z", DurationMinutes: null } });
    expect(row).toMatchObject({ id: "3", email: "ali@gmail.com", timeOut: null, durationMinutes: null, flagReason: "" });
  });

  it("reads a closed break's duration as a number", () => {
    expect(toBreak({ id: "4", fields: { TimeOut: "2026-09-24T02:49:00Z", DurationMinutes: "7" } }).durationMinutes).toBe(7);
  });

  it("treats an area as active unless marked no", () => {
    expect(toArea({ id: "1", fields: { Title: "Block A", Code: "A1B2C3" } }).active).toBe(true);
    expect(toArea({ id: "1", fields: { Title: "Block A", Code: "A1B2C3", Active: "no" } }).active).toBe(false);
  });

  it("remembers a typed-in department", () => {
    expect(toProfile({ id: "9", fields: { Email: "a@b.com", DepartmentFromList: "no" } }).departmentFromList).toBe(false);
  });
});
```

- [ ] **Step 3: Write the failing scan test** (in-memory fake store)

```ts
// api/_utils/smoking/scan.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { recordScan } from "./scan.js";
import type { SmokingArea, SmokingBreak, SmokingProfile } from "./schema.js";
import type { BreakClose, NewBreak, SmokingStore } from "./store.js";

class FakeStore implements SmokingStore {
  profiles = new Map<string, SmokingProfile & { id: string }>();
  areas: SmokingArea[] = [
    { id: "1", code: "AAA111", name: "Block A", active: true },
    { id: "2", code: "BBB222", name: "Block B", active: true },
    { id: "3", code: "OLD999", name: "Old shed", active: false },
  ];
  breaks: SmokingBreak[] = [];
  nextId = 100;
  /** Simulates a second phone's scan landing between our create and re-check. */
  racer: NewBreak | null = null;

  async findProfile(email: string) { return this.profiles.get(email) ?? null; }
  async saveProfile() {}
  async touchProfile() {}
  async findArea(code: string) { return this.areas.find((a) => a.code === code) ?? null; }
  async openBreaksFor(email: string) {
    return this.breaks.filter((b) => b.email === email && !b.timeOut)
      .sort((a, b) => a.timeIn.localeCompare(b.timeIn) || Number(a.id) - Number(b.id));
  }
  async createBreak(input: NewBreak) {
    if (this.racer) {
      const r = this.racer;
      this.racer = null;
      await this.createBreak(r);
    }
    const id = String(this.nextId++);
    this.breaks.push({ ...input, id, areaOutCode: "", areaOutName: "", timeOut: null, durationMinutes: null, flagReason: "" });
    return id;
  }
  async closeBreak(id: string, close: BreakClose) {
    Object.assign(this.breaks.find((b) => b.id === id)!, close);
  }
  async deleteBreak(id: string) { this.breaks = this.breaks.filter((b) => b.id !== id); }
}

const ALI: SmokingProfile & { id: string } = {
  id: "p1", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", departmentFromList: true,
  position: "Technician", staffId: "", company: "PMW", signInMethod: "google",
};
const at = (iso: string) => new Date(iso);

let store: FakeStore;
beforeEach(() => {
  store = new FakeStore();
  store.profiles.set(ALI.email, ALI);
});

describe("recordScan", () => {
  it("scans in, copying the profile onto the break", async () => {
    const outcome = await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:42:00Z") });
    expect(outcome).toEqual({ result: "in", timeIn: "2026-09-24T02:42:00.000Z", areaName: "Block A" });
    expect(store.breaks[0]).toMatchObject({ department: "QA/QC", position: "Technician", company: "PMW", areaInCode: "AAA111" });
  });

  it("scans out at a different area", async () => {
    await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:42:00Z") });
    const outcome = await recordScan(store, { email: ALI.email, areaCode: "BBB222", now: at("2026-09-24T02:49:00Z") });
    expect(outcome).toEqual({
      result: "out", timeIn: "2026-09-24T02:42:00.000Z", timeOut: "2026-09-24T02:49:00.000Z",
      areaName: "Block B", durationMinutes: 7, flagged: false,
    });
    expect(store.breaks[0]).toMatchObject({ areaOutCode: "BBB222", areaOutName: "Block B", durationMinutes: 7 });
  });

  it("does not clock out on a re-scan inside a minute", async () => {
    await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:42:00Z") });
    const outcome = await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:42:20Z") });
    expect(outcome).toEqual({ result: "already-in", timeIn: "2026-09-24T02:42:00.000Z", areaName: "Block A" });
    expect(store.breaks[0].timeOut).toBeNull();
  });

  it("flags a break that lasted over 12 hours", async () => {
    await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-23T02:00:00Z") });
    const outcome = await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:00:00Z") });
    expect(outcome).toMatchObject({ result: "out", flagged: true, durationMinutes: 1440 });
    expect(store.breaks[0].flagReason).toBe("Lasted over 12 hours");
  });

  it("records nothing on a retired or unknown poster", async () => {
    await expect(recordScan(store, { email: ALI.email, areaCode: "OLD999", now: at("2026-09-24T02:42:00Z") }))
      .resolves.toEqual({ result: "retired-area" });
    await expect(recordScan(store, { email: ALI.email, areaCode: "NOPE00", now: at("2026-09-24T02:42:00Z") }))
      .resolves.toEqual({ result: "retired-area" });
    expect(store.breaks).toHaveLength(0);
  });

  it("asks for a profile first", async () => {
    await expect(recordScan(store, { email: "new@gmail.com", areaCode: "AAA111", now: at("2026-09-24T02:42:00Z") }))
      .resolves.toEqual({ result: "no-profile" });
  });

  it("leaves one open break when two scans race", async () => {
    store.racer = {
      email: ALI.email, fullName: "Ali", department: "QA/QC", position: "Technician", company: "PMW",
      areaInCode: "AAA111", areaInName: "Block A", timeIn: "2026-09-24T02:42:00.000Z",
    };
    const outcome = await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:42:00Z") });
    expect(outcome.result).toBe("already-in");
    expect(store.breaks.filter((b) => !b.timeOut)).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run tests to verify the scan test fails**

Run: `npx vitest run api/_utils/smoking/scan.test.ts api/_utils/smoking/store.test.ts`
Expected: store.test PASS; scan.test FAIL — cannot resolve `./scan.js`.

- [ ] **Step 5: Write recordScan**

```ts
// api/_utils/smoking/scan.ts
import { decideScan } from "./scanRules.js";
import type { SmokingStore } from "./store.js";

export type ScanOutcome =
  | { result: "in"; timeIn: string; areaName: string }
  | { result: "out"; timeIn: string; timeOut: string; areaName: string; durationMinutes: number; flagged: boolean }
  | { result: "already-in"; timeIn: string; areaName: string }
  | { result: "retired-area" }
  | { result: "no-profile" };

/**
 * One scan, decided on the server's clock. At most one open break per person:
 * if another scan opened one between our create and re-check, the newer row is
 * removed and this scan reports "already in".
 */
export async function recordScan(
  store: SmokingStore,
  input: { email: string; areaCode: string; now: Date },
): Promise<ScanOutcome> {
  const area = await store.findArea(input.areaCode.trim().toUpperCase());
  if (!area || !area.active) return { result: "retired-area" };

  const profile = await store.findProfile(input.email);
  if (!profile) return { result: "no-profile" };

  const [oldestOpen] = await store.openBreaksFor(input.email);
  const decision = decideScan(oldestOpen ?? null, input.now);
  const nowIso = input.now.toISOString();

  if (decision.kind === "already-in") {
    return { result: "already-in", timeIn: decision.openBreak.timeIn, areaName: decision.openBreak.areaInName };
  }

  if (decision.kind === "close") {
    await store.closeBreak(decision.openBreak.id, {
      timeOut: nowIso,
      areaOutCode: area.code,
      areaOutName: area.name,
      durationMinutes: decision.durationMinutes,
      flagReason: decision.flagReason,
    });
    return {
      result: "out",
      timeIn: decision.openBreak.timeIn,
      timeOut: nowIso,
      areaName: area.name,
      durationMinutes: decision.durationMinutes,
      flagged: decision.flagReason !== "",
    };
  }

  const createdId = await store.createBreak({
    email: profile.email,
    fullName: profile.fullName,
    department: profile.department,
    position: profile.position,
    company: profile.company,
    areaInCode: area.code,
    areaInName: area.name,
    timeIn: nowIso,
  });

  const open = await store.openBreaksFor(input.email);
  const keeper = open[0];
  if (keeper && keeper.id !== createdId) {
    await store.deleteBreak(createdId);
    return { result: "already-in", timeIn: keeper.timeIn, areaName: keeper.areaInName };
  }
  return { result: "in", timeIn: nowIso, areaName: area.name };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run api/_utils/smoking/`
Expected: PASS (all smoking server tests).

- [ ] **Step 7: Commit**

```bash
git add api/_utils/smoking/store.ts api/_utils/smoking/store.test.ts api/_utils/smoking/scan.ts api/_utils/smoking/scan.test.ts
git commit -m "Record a smoking scan in SharePoint, keeping one open break per person"
```

---

### Task 6: Request handler and the Vercel function

**Files:**
- Create: `api/_utils/smoking/handler.ts`
- Test: `api/_utils/smoking/handler.test.ts`
- Create: `api/smoking.ts`

**Interfaces:**
- Consumes: `issuePass`, `readPass` (Task 2); `VerifiedIdentity`, `IdTokenError`, verifiers, `createCachedJwksFetcher` (Task 3); `createDepartmentCache`, `departmentSourceFromEnv`, `departmentsPath`, `parseDepartments`, `DepartmentList` (Task 4); `SmokingStore`, `createGraphSmokingStore`, `recordScan` (Task 5); `validateApiKey`, `setCorsHeaders` from `../auth.js`; `getGraphToken`, `graphGet` from `../graphClient.js`; `logError` from `../logger.js`.
- Produces: `SmokingDeps`, `SmokingRequest { method: string; headers: Record<string, string | string[] | undefined>; body: unknown }`, `SmokingResponse { status: number; body: Record<string, unknown> }`, `handleSmoking(req, deps): Promise<SmokingResponse>`.
- Wire protocol (browser relies on this — Task 7):
  - `POST /api/smoking` with JSON `{ action, ...payload }`, header `X-Api-Key`, and `Authorization: Bearer <pass>` for every action except `signin` and `area`.
  - `signin` `{ provider: "google"|"microsoft", idToken }` → `200 { pass, email, name, profile: SmokingProfile | null }`
  - `profile-get` → `200 { profile: SmokingProfile | null }`
  - `profile-save` `{ fullName, department, departmentFromList, position, staffId, company }` → `200 { profile }`; `400 { error }` when a required field is blank
  - `departments` → `200 { departments: string[], fromList: boolean }`
  - `area` `{ code }` → `200 { name, active }` or `404 { error: "unknown-area" }`
  - `scan` `{ areaCode }` → `200 ScanOutcome`
  - Bad/missing pass → `401 { error: "signin-required" }`; bad ID token → `401 { error: "signin-failed", detail }`

- [ ] **Step 1: Write the failing test**

```ts
// api/_utils/smoking/handler.test.ts
import { describe, expect, it, vi } from "vitest";
import { handleSmoking, type SmokingDeps } from "./handler.js";
import { IdTokenError } from "./idToken.js";
import { issuePass } from "./pass.js";
import type { SmokingStore } from "./store.js";

const SECRET = "handler-test-secret-that-is-long-enough";
const now = new Date("2026-09-24T02:42:00Z");

function deps(overrides: Partial<SmokingDeps> = {}, store: Partial<SmokingStore> = {}): SmokingDeps {
  return {
    store: {
      findProfile: vi.fn().mockResolvedValue(null),
      saveProfile: vi.fn().mockResolvedValue(undefined),
      touchProfile: vi.fn().mockResolvedValue(undefined),
      findArea: vi.fn().mockResolvedValue({ id: "1", code: "AAA111", name: "Block A", active: true }),
      openBreaksFor: vi.fn().mockResolvedValue([]),
      createBreak: vi.fn().mockResolvedValue("100"),
      closeBreak: vi.fn(),
      deleteBreak: vi.fn(),
      ...store,
    },
    verifyGoogle: vi.fn().mockResolvedValue({ email: "ali@gmail.com", name: "Ali", method: "google" }),
    verifyMicrosoft: vi.fn().mockRejectedValue(new IdTokenError("Not a PMW Microsoft account")),
    departments: vi.fn().mockResolvedValue({ departments: ["OSHES", "QA/QC"], fromList: true }),
    passSecret: SECRET,
    now: () => now,
    ...overrides,
  };
}

const post = (body: Record<string, unknown>, pass?: string) => ({
  method: "POST",
  headers: pass ? { authorization: `Bearer ${pass}` } : {},
  body,
});
const pass = () => issuePass("ali@gmail.com", "google", SECRET, now);

describe("handleSmoking", () => {
  it("signs in with Google and hands back a pass", async () => {
    const res = await handleSmoking(post({ action: "signin", provider: "google", idToken: "t" }), deps());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: "ali@gmail.com", name: "Ali", profile: null });
    expect(typeof res.body.pass).toBe("string");
  });

  it("refuses a sign-in the provider did not vouch for", async () => {
    const res = await handleSmoking(post({ action: "signin", provider: "microsoft", idToken: "t" }), deps());
    expect(res).toEqual({ status: 401, body: { error: "signin-failed", detail: "Not a PMW Microsoft account" } });
  });

  it("requires a pass to scan", async () => {
    const res = await handleSmoking(post({ action: "scan", areaCode: "AAA111" }), deps());
    expect(res).toEqual({ status: 401, body: { error: "signin-required" } });
  });

  it("saves a profile under the pass's email, not one in the body", async () => {
    const d = deps();
    const res = await handleSmoking(post({
      action: "profile-save", email: "boss@pmw-group.com", fullName: " Ali ", department: "QA/QC",
      departmentFromList: true, position: "Technician", staffId: "", company: "",
    }, pass()), d);
    expect(res.status).toBe(200);
    expect(d.store.saveProfile).toHaveBeenCalledWith({
      email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", departmentFromList: true,
      position: "Technician", staffId: "", company: "PMW", signInMethod: "google",
    }, now);
  });

  it("rejects a profile missing a required field", async () => {
    const res = await handleSmoking(post({ action: "profile-save", fullName: "Ali", department: "", position: "Tech" }, pass()), deps());
    expect(res).toEqual({ status: 400, body: { error: "Department is required." } });
  });

  it("scans with a valid pass", async () => {
    const d = deps({}, {
      findProfile: vi.fn().mockResolvedValue({
        id: "p1", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", departmentFromList: true,
        position: "Tech", staffId: "", company: "PMW", signInMethod: "google",
      }),
    });
    const res = await handleSmoking(post({ action: "scan", areaCode: "AAA111" }, pass()), d);
    expect(res).toEqual({ status: 200, body: { result: "in", timeIn: "2026-09-24T02:42:00.000Z", areaName: "Block A" } });
  });

  it("names an area without a pass, for the page header", async () => {
    const res = await handleSmoking(post({ action: "area", code: "aaa111" }), deps());
    expect(res).toEqual({ status: 200, body: { name: "Block A", active: true } });
  });

  it("rejects unknown actions and non-POST", async () => {
    expect((await handleSmoking(post({ action: "nope" }), deps())).status).toBe(400);
    expect((await handleSmoking({ method: "GET", headers: {}, body: {} }, deps())).status).toBe(405);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_utils/smoking/handler.test.ts`
Expected: FAIL — cannot resolve `./handler.js`.

- [ ] **Step 3: Write the handler**

```ts
// api/_utils/smoking/handler.ts
import type { DepartmentList } from "./departments.js";
import { IdTokenError, type VerifiedIdentity } from "./idToken.js";
import { issuePass, readPass } from "./pass.js";
import { recordScan } from "./scan.js";
import type { SmokingProfile } from "./schema.js";
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

/** The profile as the smoker sees it — never the SharePoint item id. */
function publicProfile(profile: (SmokingProfile & { id?: string }) | null): SmokingProfile | null {
  if (!profile) return null;
  const { id: _id, ...rest } = profile;
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

  const holder = readPass(bearer(req.headers), deps.passSecret, now);
  if (!holder) return fail(401, "signin-required");

  switch (action) {
    case "profile-get":
      return ok({ profile: publicProfile(await deps.store.findProfile(holder.email)) });

    case "profile-save": {
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

    case "scan":
      return ok(await recordScan(deps.store, { email: holder.email, areaCode: text(body.areaCode, 20), now }));

    default:
      return fail(400, "Unknown action");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_utils/smoking/handler.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Write the Vercel wrapper**

```ts
// api/smoking.ts
import { setCorsHeaders, validateApiKey } from "./_utils/auth.js";
import { getGraphToken, graphGet } from "./_utils/graphClient.js";
import { logError } from "./_utils/logger.js";
import { createDepartmentCache, departmentSourceFromEnv, departmentsPath, parseDepartments } from "./_utils/smoking/departments.js";
import { handleSmoking } from "./_utils/smoking/handler.js";
import { createCachedJwksFetcher, verifyGoogleIdToken, verifyMicrosoftIdToken } from "./_utils/smoking/idToken.js";
import { createGraphSmokingStore } from "./_utils/smoking/store.js";

interface ApiRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

const fetchJwks = createCachedJwksFetcher();
const departmentSource = departmentSourceFromEnv();
const departmentCache = createDepartmentCache(async () =>
  parseDepartments(await graphGet(await getGraphToken(), departmentsPath(departmentSource)), departmentSource.column));
const store = createGraphSmokingStore();

/**
 * Smoking log: sign-in, profile, departments, area lookup and scan — one
 * function so the deployment stays inside its function budget.
 * Logic lives in `_utils/smoking/handler.ts`, where it is tested.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });

  const passSecret = process.env.SMOKING_PASS_SECRET || "";
  const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
  const msClientId = process.env.VITE_AZURE_CLIENT_ID || "";
  const tenantId = process.env.VITE_AZURE_TENANT_ID || process.env.AZURE_TENANT_ID || "";
  if (passSecret.length < 32 || !googleClientId) {
    logError("smoking", "SMOKING_PASS_SECRET (32+ chars) or GOOGLE_CLIENT_ID is not configured");
    return res.status(500).json({ error: "The smoking log is not set up yet. Tell OSHES." });
  }

  try {
    const result = await handleSmoking(req, {
      store,
      verifyGoogle: (idToken) => verifyGoogleIdToken(idToken, { clientId: googleClientId, fetchJwks }),
      verifyMicrosoft: (idToken) => verifyMicrosoftIdToken(idToken, { clientId: msClientId, tenantId, fetchJwks }),
      departments: () => departmentCache.get(),
      passSecret,
      now: () => new Date(),
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    logError("smoking", "Smoking request failed", error);
    return res.status(500).json({ error: "Not recorded. Try again in a moment." });
  }
}
```

- [ ] **Step 6: Typecheck and run the smoking tests**

Run: `npx tsc -b` then `npx vitest run api/_utils/smoking/`
Expected: no type errors; all PASS. (If `tsc -b` does not cover `api/`, check `tsconfig.json` references; if an `api` tsconfig exists, run `npx tsc -p <that file> --noEmit`.)

- [ ] **Step 7: Commit**

```bash
git add api/smoking.ts api/_utils/smoking/handler.ts api/_utils/smoking/handler.test.ts
git commit -m "Serve smoking sign-in, profile and scans from one API function"
```

---

### Task 7: Browser schema mirror, parity test and API client

**Files:**
- Create: `src/utils/smoking/schema.ts`
- Create: `src/utils/smoking/api.ts`
- Test: `src/utils/smoking/schema.parity.test.ts`
- Test: `src/utils/smoking/api.test.ts`
- Modify: `src/utils/formBuilderSP.ts:304-310` (indexes)

**Interfaces:**
- Consumes: `SP_FIELD_KIND`, `SpListSchema` from `../formBuilderSP`.
- Produces:
  - `SMOKING_LISTS`, `FLAG_OPEN_LONG`, `FLAG_LASTED_LONG`, `LONG_BREAK_MS`, `flagReasonFor(timeIn: Date, timeOut: Date | null, now: Date): string`, `SMOKING_LIST_SCHEMAS: SpListSchema[]`, `SMOKING_LOG_INDEXES`, types `SignInMethod`, `SmokingProfile`, `SmokingArea`, `SmokingBreak` (same shapes as server).
  - `ScanOutcome` (same union as server), `SmokingApiError extends Error { status: number; code: string }`, `readStoredPass(): string`, `storePass(pass: string): void`, `clearStoredPass(): void`, `callSmoking<T>(action: string, payload?: Record<string, unknown>): Promise<T>`.

- [ ] **Step 1: Write the browser schema**

```ts
// src/utils/smoking/schema.ts
import { SP_FIELD_KIND, type SpListSchema } from "../formBuilderSP";

/**
 * Browser mirror of `api/_utils/smoking/schema.ts` + `scanRules.ts`.
 * The admin page provisions the lists from here; the server writes to them.
 * `schema.parity.test.ts` fails if the two halves drift.
 */
export const SMOKING_LISTS = {
  profiles: "Smoking Profiles",
  log: "Smoking Log",
  areas: "Smoking Areas",
} as const;

export const FLAG_OPEN_LONG = "Open over 12 hours";
export const FLAG_LASTED_LONG = "Lasted over 12 hours";
export const LONG_BREAK_MS = 12 * 60 * 60 * 1000;

export function flagReasonFor(timeIn: Date, timeOut: Date | null, now: Date): string {
  if (timeOut) return timeOut.getTime() - timeIn.getTime() > LONG_BREAK_MS ? FLAG_LASTED_LONG : "";
  return now.getTime() - timeIn.getTime() > LONG_BREAK_MS ? FLAG_OPEN_LONG : "";
}

const text = (n: string) => ({ n, k: SP_FIELD_KIND.text });
const when = (n: string) => ({ n, k: SP_FIELD_KIND.dateTime });

export const SMOKING_LIST_SCHEMAS: SpListSchema[] = [
  {
    title: SMOKING_LISTS.profiles,
    description: "Smoking log: one row per registered smoker",
    columns: [
      text("Email"), text("FullName"), text("Department"), text("DepartmentFromList"), text("Position"),
      text("StaffId"), text("Company"), text("SignInMethod"), when("FirstSeen"), when("LastSeen"),
    ],
  },
  {
    title: SMOKING_LISTS.log,
    description: "Smoking log: one row per break",
    columns: [
      text("Email"), text("FullName"), text("Department"), text("Position"), text("Company"), text("Status"),
      text("AreaInCode"), text("AreaInName"), text("AreaOutCode"), text("AreaOutName"),
      when("TimeIn"), when("TimeOut"), { n: "DurationMinutes", k: SP_FIELD_KIND.number },
      text("FlagReason"), { n: "ResolutionNote", k: SP_FIELD_KIND.note }, text("ResolvedBy"), when("ResolvedAt"),
    ],
  },
  {
    title: SMOKING_LISTS.areas,
    description: "Smoking log: one row per smoking area poster",
    columns: [text("Code"), text("Active")],
  },
];

/** Every scan filters on these; unindexed they fail once the log passes 5,000 rows. */
export const SMOKING_INDEXES: Record<string, string[]> = {
  [SMOKING_LISTS.profiles]: ["Email"],
  [SMOKING_LISTS.log]: ["Email", "Status", "TimeIn"],
  [SMOKING_LISTS.areas]: ["Code"],
};

export type SignInMethod = "google" | "microsoft";

export interface SmokingProfile {
  email: string;
  fullName: string;
  department: string;
  departmentFromList: boolean;
  position: string;
  staffId: string;
  company: string;
  signInMethod: SignInMethod;
}

export interface SmokingArea {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface SmokingBreak {
  id: string;
  email: string;
  fullName: string;
  department: string;
  position: string;
  company: string;
  areaInCode: string;
  areaInName: string;
  areaOutCode: string;
  areaOutName: string;
  timeIn: string;
  timeOut: string | null;
  durationMinutes: number | null;
  flagReason: string;
  resolutionNote?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}
```

- [ ] **Step 2: Register the indexes** — in `src/utils/formBuilderSP.ts`, import `SMOKING_INDEXES` and spread it into `LIST_INDEXES`:

```ts
// near the other imports
import { SMOKING_INDEXES } from "./smoking/schema";

// line 304
const LIST_INDEXES: Record<string, string[]> = {
  [OSHES_LISTS.masterForm]: ['Title', 'Slug', 'FormID', 'CurrentVersion'],
  [OSHES_LISTS.approvers]: ['FormTitle', 'LayerNumber', 'ApproverEmail'],
  [OSHES_LISTS.versions]: ['FormTitle', 'FormSlug', 'FormVersion', 'PublishedAt'],
  [OSHES_LISTS.builderLog]: ['FormTitle', 'EventType', 'ChangedBy', 'EventAt'],
  [OSHES_LISTS.dashboardSettings]: ['BackgroundId', 'UpdatedAt'],
  ...SMOKING_INDEXES,
};
```

This is a circular import (`smoking/schema` imports `SP_FIELD_KIND` from `formBuilderSP`). If Vitest or Vite reports `SP_FIELD_KIND` undefined, move `SMOKING_INDEXES` into a new dependency-free file `src/utils/smoking/indexes.ts` (importing only the list names from a dependency-free `src/utils/smoking/lists.ts`) and import that instead.

- [ ] **Step 3: Write the failing parity test**

```ts
// src/utils/smoking/schema.parity.test.ts
import { describe, expect, it } from "vitest";
import * as server from "../../../api/_utils/smoking/schema";
import { flagReasonFor as serverFlag } from "../../../api/_utils/smoking/scanRules";
import * as browser from "./schema";

const columnsOf = (title: string) =>
  browser.SMOKING_LIST_SCHEMAS.find((schema) => schema.title === title)!.columns!.map((column) => column.n);

describe("smoking schema parity", () => {
  it("names the same lists", () => {
    expect(browser.SMOKING_LISTS).toEqual(server.SMOKING_LISTS);
  });

  it("provisions every column the server writes", () => {
    expect(columnsOf(server.SMOKING_LISTS.profiles)).toEqual([...server.PROFILE_COLUMNS]);
    expect(columnsOf(server.SMOKING_LISTS.log)).toEqual([...server.LOG_COLUMNS]);
    expect(columnsOf(server.SMOKING_LISTS.areas)).toEqual([...server.AREA_COLUMNS]);
  });

  it("flags the same way on both sides", () => {
    expect(browser.FLAG_OPEN_LONG).toBe(server.FLAG_OPEN_LONG);
    expect(browser.FLAG_LASTED_LONG).toBe(server.FLAG_LASTED_LONG);
    const timeIn = new Date("2026-09-24T00:00:00Z");
    for (const [timeOut, now] of [
      [null, "2026-09-24T11:59:59Z"], [null, "2026-09-24T12:00:01Z"],
      ["2026-09-24T12:00:00Z", "2026-09-25T00:00:00Z"], ["2026-09-24T12:00:01Z", "2026-09-25T00:00:00Z"],
    ] as const) {
      const out = timeOut ? new Date(timeOut) : null;
      expect(browser.flagReasonFor(timeIn, out, new Date(now))).toBe(serverFlag(timeIn, out, new Date(now)));
    }
  });
});
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/utils/smoking/schema.parity.test.ts`
Expected: PASS (3 tests). Vite's resolver maps the server files' internal `./schema.js` imports to `schema.ts`, the same way the existing `api/_utils/*.test.ts` files already run under Vitest.

- [ ] **Step 5: Write the failing API client test**

```ts
// src/utils/smoking/api.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SmokingApiError, callSmoking, clearStoredPass, readStoredPass, storePass } from "./api";

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("smoking pass storage", () => {
  it("stores, reads and clears the pass", () => {
    storePass("abc.def");
    expect(readStoredPass()).toBe("abc.def");
    clearStoredPass();
    expect(readStoredPass()).toBe("");
  });

  it("survives a browser that blocks storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } });
    expect(() => storePass("x")).not.toThrow();
    expect(readStoredPass()).toBe("");
  });
});

describe("callSmoking", () => {
  it("sends the action and the pass", async () => {
    storePass("p.s");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: "in" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(callSmoking("scan", { areaCode: "AAA111" })).resolves.toEqual({ result: "in" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/smoking");
    expect(JSON.parse(init.body)).toEqual({ action: "scan", areaCode: "AAA111" });
    expect(init.headers.Authorization).toBe("Bearer p.s");
  });

  it("drops a pass the server refused", async () => {
    storePass("old.pass");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "signin-required" }), { status: 401 })));
    await expect(callSmoking("scan")).rejects.toMatchObject({ status: 401, code: "signin-required" });
    expect(readStoredPass()).toBe("");
  });

  it("reports a network failure as not recorded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(callSmoking("scan")).rejects.toBeInstanceOf(SmokingApiError);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/utils/smoking/api.test.ts`
Expected: FAIL — cannot resolve `./api`.

- [ ] **Step 7: Write the client**

```ts
// src/utils/smoking/api.ts
import type { SmokingProfile } from "./schema";

const PASS_KEY = "oshes.smokingPass";
const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

export type ScanOutcome =
  | { result: "in"; timeIn: string; areaName: string }
  | { result: "out"; timeIn: string; timeOut: string; areaName: string; durationMinutes: number; flagged: boolean }
  | { result: "already-in"; timeIn: string; areaName: string }
  | { result: "retired-area" }
  | { result: "no-profile" };

export interface SignInResult {
  pass: string;
  email: string;
  name: string;
  profile: SmokingProfile | null;
}

export class SmokingApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
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
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/utils/smoking/`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/utils/smoking/schema.ts src/utils/smoking/schema.parity.test.ts src/utils/smoking/api.ts src/utils/smoking/api.test.ts src/utils/formBuilderSP.ts
git commit -m "Mirror the smoking lists in the browser and keep both halves in step"
```

---

### Task 8: The /smoke scan page

**Files:**
- Create: `src/utils/smoking/outcome.ts`
- Test: `src/utils/smoking/outcome.test.ts`
- Create: `src/utils/smoking/googleSignIn.ts`
- Create: `src/pages/SmokingScanPage.tsx`
- Modify: `src/App.tsx` (lazy loader near line 281, `isPublicRoutePath` near line 287, route near line 1397)
- Modify: `vercel.json` (CSP)

**Interfaces:**
- Consumes: `callSmoking`, `storePass`, `readStoredPass`, `clearStoredPass`, `ScanOutcome`, `SignInResult`, `SmokingApiError` (Task 7); `SmokingProfile` (Task 7); `msalInstance` from `src/auth/msalConfig.ts`.
- Produces: `formatMyt(iso: string): string` ("10:42"), `describeOutcome(outcome: ScanOutcome): OutcomeView { tone: "in" | "out" | "info" | "warn"; headline: string; detail: string }`, `loadGoogleIdentity(): Promise<void>`, `renderGoogleButton(el: HTMLElement, clientId: string, onCredential: (idToken: string) => void): void`, default export `SmokingScanPage`.

- [ ] **Step 1: Write the failing outcome test**

```ts
// src/utils/smoking/outcome.test.ts
import { describe, expect, it } from "vitest";
import { describeOutcome, formatMyt } from "./outcome";

describe("formatMyt", () => {
  it("shows Malaysian wall-clock time", () => {
    expect(formatMyt("2026-09-24T02:42:00Z")).toBe("10:42");
  });
});

describe("describeOutcome", () => {
  it("reads IN", () => {
    expect(describeOutcome({ result: "in", timeIn: "2026-09-24T02:42:00Z", areaName: "Block A" }))
      .toEqual({ tone: "in", headline: "IN · 10:42", detail: "Block A" });
  });
  it("reads OUT with the duration", () => {
    expect(describeOutcome({
      result: "out", timeIn: "2026-09-24T02:42:00Z", timeOut: "2026-09-24T02:49:00Z",
      areaName: "Block B", durationMinutes: 7, flagged: false,
    })).toEqual({ tone: "out", headline: "OUT · 10:49", detail: "7 min · Block B" });
  });
  it("mentions a long break without accusing", () => {
    expect(describeOutcome({
      result: "out", timeIn: "2026-09-23T02:00:00Z", timeOut: "2026-09-24T02:00:00Z",
      areaName: "Block A", durationMinutes: 1440, flagged: true,
    }).detail).toBe("24 h 0 min · Block A · OSHES will check this one — you may have missed a scan-out");
  });
  it("reads a double scan", () => {
    expect(describeOutcome({ result: "already-in", timeIn: "2026-09-24T02:42:00Z", areaName: "Block A" }))
      .toEqual({ tone: "info", headline: "Already in since 10:42", detail: "Scan again when you leave." });
  });
  it("reads a retired poster", () => {
    expect(describeOutcome({ result: "retired-area" }))
      .toEqual({ tone: "warn", headline: "This poster is no longer in use", detail: "Nothing was recorded. Use the poster at your smoking area." });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/smoking/outcome.test.ts`
Expected: FAIL — cannot resolve `./outcome`.

- [ ] **Step 3: Write outcome.ts**

```ts
// src/utils/smoking/outcome.ts
import type { ScanOutcome } from "./api";

export interface OutcomeView {
  tone: "in" | "out" | "info" | "warn";
  headline: string;
  detail: string;
}

const MYT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false });

export function formatMyt(iso: string): string {
  return MYT.format(new Date(iso));
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function describeOutcome(outcome: ScanOutcome): OutcomeView {
  switch (outcome.result) {
    case "in":
      return { tone: "in", headline: `IN · ${formatMyt(outcome.timeIn)}`, detail: outcome.areaName };
    case "out": {
      const parts = [formatDuration(outcome.durationMinutes), outcome.areaName];
      if (outcome.flagged) parts.push("OSHES will check this one — you may have missed a scan-out");
      return { tone: "out", headline: `OUT · ${formatMyt(outcome.timeOut)}`, detail: parts.join(" · ") };
    }
    case "already-in":
      return { tone: "info", headline: `Already in since ${formatMyt(outcome.timeIn)}`, detail: "Scan again when you leave." };
    case "retired-area":
      return { tone: "warn", headline: "This poster is no longer in use", detail: "Nothing was recorded. Use the poster at your smoking area." };
    case "no-profile":
      return { tone: "warn", headline: "Finish your profile first", detail: "Then scan again." };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/smoking/outcome.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the Google loader**

```ts
// src/utils/smoking/googleSignIn.ts
/** Google Identity Services, loaded only on the smoking page. */
interface GoogleId {
  initialize(config: { client_id: string; callback: (response: { credential: string }) => void; auto_select?: boolean }): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let loading: Promise<void> | null = null;

export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("Google sign-in could not load. Check your connection."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function renderGoogleButton(el: HTMLElement, clientId: string, onCredential: (idToken: string) => void): void {
  const id = window.google!.accounts.id;
  id.initialize({ client_id: clientId, callback: (response) => onCredential(response.credential), auto_select: true });
  id.renderButton(el, { theme: "filled_blue", size: "large", shape: "pill", text: "continue_with", width: 300 });
}
```

- [ ] **Step 6: Write the page**

Stages: `loading` → `signin` → `profile` → `result` (and `error`). Use existing MUI components; keep type sizes large (headline ≥ 40px) for reading at arm's length. On mount: read `area` from the query string, call `area` action for the header; if a stored pass exists, call `profile-get` then `scan`; otherwise show sign-in.

```tsx
// src/pages/SmokingScanPage.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Autocomplete, Box, Button, Link, Stack, TextField, Typography } from "@mui/material";
import { msalInstance } from "../auth/msalConfig";
import {
  callSmoking,
  clearStoredPass,
  readStoredPass,
  SmokingApiError,
  storePass,
  type ScanOutcome,
  type SignInResult,
} from "../utils/smoking/api";
import { loadGoogleIdentity, renderGoogleButton } from "../utils/smoking/googleSignIn";
import { describeOutcome, type OutcomeView } from "../utils/smoking/outcome";
import type { SmokingProfile } from "../utils/smoking/schema";

type Stage = "loading" | "signin" | "profile" | "result" | "error";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

const TONE_COLOR: Record<OutcomeView["tone"], string> = {
  in: "success.main",
  out: "info.main",
  info: "text.primary",
  warn: "warning.main",
};

interface ProfileDraft {
  fullName: string;
  department: string;
  position: string;
  staffId: string;
  company: string;
}

/**
 * The page a smoking-area poster opens. Sign in once, register once, then every
 * scan is IN or OUT — the server decides which.
 */
export default function SmokingScanPage() {
  const [params] = useSearchParams();
  const areaCode = (params.get("area") ?? "").trim().toUpperCase();
  const [stage, setStage] = useState<Stage>("loading");
  const [areaName, setAreaName] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<OutcomeView | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>({ fullName: "", department: "", position: "", staffId: "", company: "PMW" });
  const [departments, setDepartments] = useState<string[]>([]);
  const [departmentsFromList, setDepartmentsFromList] = useState(true);
  const [busy, setBusy] = useState(false);
  const googleButton = useRef<HTMLDivElement>(null);

  const fail = (e: unknown) => {
    if (e instanceof SmokingApiError && e.code === "signin-required") {
      setStage("signin");
      return;
    }
    setError(e instanceof Error ? e.message : "Something went wrong.");
    setStage("error");
  };

  const openProfile = useCallback(async (profile: SmokingProfile | null, nameHint = "") => {
    const list = await callSmoking<{ departments: string[]; fromList: boolean }>("departments");
    setDepartments(list.departments);
    setDepartmentsFromList(list.fromList);
    setDraft({
      fullName: profile?.fullName || nameHint,
      department: profile?.department ?? "",
      position: profile?.position ?? "",
      staffId: profile?.staffId ?? "",
      company: profile?.company || "PMW",
    });
    setStage("profile");
  }, []);

  const scan = useCallback(async () => {
    setBusy(true);
    try {
      const outcome = await callSmoking<ScanOutcome>("scan", { areaCode });
      if (outcome.result === "no-profile") {
        await openProfile(null);
        return;
      }
      setView(describeOutcome(outcome));
      setStage("result");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [areaCode, openProfile]);

  const afterSignIn = useCallback(async (provider: "google" | "microsoft", idToken: string) => {
    try {
      const result = await callSmoking<SignInResult>("signin", { provider, idToken });
      storePass(result.pass);
      if (!result.profile) await openProfile(null, result.name);
      else await scan();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      setStage("signin");
    }
  }, [openProfile, scan]);

  // First load: area header, then either scan straight away or ask to sign in.
  useEffect(() => {
    if (!areaCode) {
      setView(describeOutcome({ result: "retired-area" }));
      setStage("result");
      return;
    }
    callSmoking<{ name: string; active: boolean }>("area", { code: areaCode })
      .then((area) => setAreaName(area.name))
      .catch(() => setAreaName(""));
    if (readStoredPass()) void scan();
    else setStage("signin");
  }, [areaCode, scan]);

  // Google's button needs the element on screen before it can draw into it.
  useEffect(() => {
    if (stage !== "signin" || !googleButton.current || !GOOGLE_CLIENT_ID) return;
    loadGoogleIdentity()
      .then(() => renderGoogleButton(googleButton.current!, GOOGLE_CLIENT_ID, (t) => void afterSignIn("google", t)))
      .catch((e: Error) => setError(e.message));
  }, [stage, afterSignIn]);

  const signInMicrosoft = async () => {
    try {
      const result = await msalInstance.loginPopup({ scopes: ["openid", "profile", "email"], prompt: "select_account" });
      await afterSignIn("microsoft", result.idToken);
    } catch {
      setError("Microsoft sign-in was cancelled or blocked.");
    }
  };

  const saveProfile = async () => {
    setBusy(true);
    setError("");
    try {
      await callSmoking("profile-save", { ...draft, departmentFromList: departmentsFromList });
      await scan();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  const editProfile = () => {
    callSmoking<{ profile: SmokingProfile | null }>("profile-get")
      .then(({ profile }) => openProfile(profile))
      .catch(fail);
  };

  const required = draft.fullName.trim() && draft.department.trim() && draft.position.trim();

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", px: 2, py: 4, display: "flex", justifyContent: "center" }}>
      <Stack spacing={3} sx={{ width: "100%", maxWidth: 420 }}>
        <Box>
          <Typography variant="overline" color="text.secondary">OSHES · Smoking log</Typography>
          <Typography variant="h5" fontWeight={700}>{areaName || "Smoking area"}</Typography>
        </Box>

        {error && stage !== "error" && <Alert severity="error">{error}</Alert>}

        {stage === "loading" && <Typography color="text.secondary">Recording…</Typography>}

        {stage === "signin" && (
          <Stack spacing={2} alignItems="center">
            <Typography>Sign in once. After that, just scan.</Typography>
            <div ref={googleButton} />
            {!GOOGLE_CLIENT_ID && <Alert severity="warning">Google sign-in is not set up yet. Tell OSHES.</Alert>}
            <Link component="button" onClick={signInMicrosoft} underline="hover">
              Or sign in with a PMW Microsoft account
            </Link>
          </Stack>
        )}

        {stage === "profile" && (
          <Stack spacing={2}>
            <Typography variant="h6">About you</Typography>
            <TextField label="Full name" required value={draft.fullName}
              onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />
            {departmentsFromList ? (
              <Autocomplete options={departments} value={draft.department || null}
                onChange={(_, value) => setDraft({ ...draft, department: value ?? "" })}
                renderInput={(p) => <TextField {...p} label="Department" required />} />
            ) : (
              <TextField label="Department" required helperText="The department list is unavailable — type yours."
                value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
            )}
            <TextField label="Position" required value={draft.position}
              onChange={(e) => setDraft({ ...draft, position: e.target.value })} />
            <TextField label="Staff ID" helperText="Optional" value={draft.staffId}
              onChange={(e) => setDraft({ ...draft, staffId: e.target.value })} />
            <TextField label="Company" required value={draft.company}
              onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
            <Typography variant="body2" color="text.secondary">
              OSHES records your name, email, department, position, company and the times you scan in and out at
              smoking areas. It is used for workplace safety records and is not shared outside PMW. See the{" "}
              <Link href="/privacy" target="_blank">privacy notice</Link>.
            </Typography>
            <Button variant="contained" size="large" disabled={!required || busy} onClick={saveProfile}>
              Save and record this scan
            </Button>
          </Stack>
        )}

        {stage === "result" && view && (
          <Stack spacing={2}>
            <Typography sx={{ fontSize: 44, fontWeight: 800, lineHeight: 1.1, color: TONE_COLOR[view.tone] }}>
              {view.headline}
            </Typography>
            <Typography variant="h6">{view.detail}</Typography>
            <Stack direction="row" spacing={2}>
              <Link component="button" onClick={editProfile}>Edit my profile</Link>
              <Link component="button" onClick={() => { clearStoredPass(); setStage("signin"); }}>Not you?</Link>
            </Stack>
          </Stack>
        )}

        {stage === "error" && (
          <Stack spacing={2}>
            <Alert severity="error">{error}</Alert>
            <Button variant="contained" size="large" disabled={busy} onClick={() => void scan()}>Try again</Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 7: Wire the route** — in `src/App.tsx`:
  - Next to `loadPublicReportPage` (≈ line 281): `const loadSmokingScanPage = () => import("./pages/SmokingScanPage");`
  - In `isPublicRoutePath` (≈ line 287) add `pathname === "/smoke" ||`.
  - After the `/track` route (≈ line 1411):

```tsx
          <Route
            path="/smoke"
            element={
              <ErrorBoundary>
                <LazyRoute load={loadSmokingScanPage} fallback={<LoadingScreen status="Opening the smoking log..." />} />
              </ErrorBoundary>
            }
          />
```

- [ ] **Step 8: Allow Google in the CSP** — in `vercel.json`'s `Content-Security-Policy` value:
  - `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'` → append ` https://accounts.google.com/gsi/client`
  - `style-src ... https://fonts.googleapis.com` → append ` https://accounts.google.com/gsi/style`
  - `connect-src ...` → append ` https://accounts.google.com/gsi/`
  - `frame-src ...` → append ` https://accounts.google.com/gsi/`

- [ ] **Step 9: Typecheck, lint, test**

Run: `npx tsc -b && npx eslint src/pages/SmokingScanPage.tsx src/utils/smoking && npx vitest run src/utils/smoking`
Expected: clean; PASS.

- [ ] **Step 10: Commit**

```bash
git add src/utils/smoking/outcome.ts src/utils/smoking/outcome.test.ts src/utils/smoking/googleSignIn.ts src/pages/SmokingScanPage.tsx src/App.tsx vercel.json
git commit -m "Let a smoker sign in, register and scan in or out from an area poster"
```

---

### Task 9: Admin data logic (pure)

**Files:**
- Create: `src/utils/smoking/adminData.ts`
- Test: `src/utils/smoking/adminData.test.ts`

**Interfaces:**
- Consumes: `SmokingBreak`, `flagReasonFor` (Task 7); `csvRow` from `../csv`; `formatMalaysiaDateTime`, `MALAYSIA_TIME_LABEL` from `../malaysiaTime`.
- Produces:
  - `BreakFilters { from: string; to: string; department: string; area: string; search: string; flaggedOnly: boolean }` (`from`/`to` are ISO instants; `to` exclusive)
  - `effectiveFlag(b: SmokingBreak, now: Date): string` — stored flag, else computed open-over-12h; `""` if resolved (`resolvedAt` set)
  - `filterBreaks(breaks: SmokingBreak[], f: BreakFilters, now: Date): SmokingBreak[]` — newest first
  - `currentlyOut(breaks: SmokingBreak[], now: Date): SmokingBreak[]` — open and not flagged
  - `PersonTotal { email; fullName; department; breaks: number; totalMinutes: number; averageMinutes: number; flagged: number }`
  - `computeTotals(breaks: SmokingBreak[], now: Date): PersonTotal[]` — flagged breaks counted in `flagged` only; sorted by totalMinutes desc
  - `BreakEdit { timeIn: string; timeOut: string | null; areaInName: string; areaOutName: string; fullName: string; department: string; position: string; company: string }`
  - `applyEdit(before: SmokingBreak, edit: BreakEdit, now: Date): SmokingBreak` — recomputes `durationMinutes` and `flagReason`, sets status implicitly via `timeOut`
  - `validateEdit(edit: BreakEdit): string` — `""` when valid
  - `describeChange(before: SmokingBreak, after: SmokingBreak): string` — "Time out: — → 10:49; Duration: — → 7 min"
  - `breakReference(b: SmokingBreak): string` — `SMK-<id>` for the Audit Trail
  - `breaksCsv(breaks: SmokingBreak[], now: Date): string`, `totalsCsv(totals: PersonTotal[]): string`
  - `newAreaCode(random?: () => number): string` — 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/smoking/adminData.test.ts
import { describe, expect, it } from "vitest";
import {
  applyEdit, breakReference, breaksCsv, computeTotals, currentlyOut, describeChange,
  effectiveFlag, filterBreaks, newAreaCode, validateEdit, type BreakFilters,
} from "./adminData";
import type { SmokingBreak } from "./schema";

const now = new Date("2026-09-24T12:00:00Z");

function brk(o: Partial<SmokingBreak>): SmokingBreak {
  return {
    id: "1", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", position: "Tech", company: "PMW",
    areaInCode: "AAA111", areaInName: "Block A", areaOutCode: "AAA111", areaOutName: "Block A",
    timeIn: "2026-09-24T02:42:00Z", timeOut: "2026-09-24T02:49:00Z", durationMinutes: 7, flagReason: "", ...o,
  };
}

const ALL: BreakFilters = { from: "2026-09-21T00:00:00Z", to: "2026-09-28T00:00:00Z", department: "", area: "", search: "", flaggedOnly: false };

describe("effectiveFlag", () => {
  it("computes open-over-12h at read time", () => {
    expect(effectiveFlag(brk({ timeIn: "2026-09-23T23:00:00Z", timeOut: null, durationMinutes: null }), now)).toBe("Open over 12 hours");
  });
  it("clears once resolved", () => {
    expect(effectiveFlag(brk({ flagReason: "Lasted over 12 hours", resolvedAt: "2026-09-24T05:00:00Z" }), now)).toBe("");
  });
});

describe("filterBreaks", () => {
  const rows = [
    brk({ id: "1" }),
    brk({ id: "2", department: "OSHES", fullName: "Siti", email: "siti@pmw-group.com", timeIn: "2026-09-24T05:00:00Z" }),
    brk({ id: "3", timeIn: "2026-09-10T02:00:00Z" }),
    brk({ id: "4", flagReason: "Lasted over 12 hours", timeIn: "2026-09-22T02:00:00Z" }),
  ];
  it("keeps the date range, newest first", () => {
    expect(filterBreaks(rows, ALL, now).map((r) => r.id)).toEqual(["2", "1", "4"]);
  });
  it("filters by department, person and flag", () => {
    expect(filterBreaks(rows, { ...ALL, department: "OSHES" }, now).map((r) => r.id)).toEqual(["2"]);
    expect(filterBreaks(rows, { ...ALL, search: "SITI" }, now).map((r) => r.id)).toEqual(["2"]);
    expect(filterBreaks(rows, { ...ALL, flaggedOnly: true }, now).map((r) => r.id)).toEqual(["4"]);
  });
  it("matches an area on the way in or out", () => {
    const moved = brk({ id: "5", areaInName: "Block A", areaOutName: "Block B" });
    expect(filterBreaks([moved], { ...ALL, area: "Block B" }, now)).toHaveLength(1);
  });
});

describe("currentlyOut", () => {
  it("lists open breaks that are not stale", () => {
    const open = brk({ id: "6", timeIn: "2026-09-24T11:50:00Z", timeOut: null, durationMinutes: null });
    const stale = brk({ id: "7", timeIn: "2026-09-23T11:50:00Z", timeOut: null, durationMinutes: null });
    expect(currentlyOut([open, stale, brk({})], now).map((r) => r.id)).toEqual(["6"]);
  });
});

describe("computeTotals", () => {
  it("totals per person and leaves flagged breaks out", () => {
    const totals = computeTotals([
      brk({ id: "1", durationMinutes: 7 }), brk({ id: "2", durationMinutes: 13 }),
      brk({ id: "3", durationMinutes: 900, flagReason: "Lasted over 12 hours" }),
    ], now);
    expect(totals).toEqual([{
      email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", breaks: 2, totalMinutes: 20, averageMinutes: 10, flagged: 1,
    }]);
  });
});

describe("applyEdit", () => {
  it("recomputes duration and clears the flag when times are fixed", () => {
    const before = brk({ timeIn: "2026-09-23T02:00:00Z", timeOut: "2026-09-24T02:00:00Z", durationMinutes: 1440, flagReason: "Lasted over 12 hours" });
    const after = applyEdit(before, {
      timeIn: "2026-09-23T02:00:00Z", timeOut: "2026-09-23T02:10:00Z", areaInName: "Block A", areaOutName: "Block A",
      fullName: "Ali", department: "QA/QC", position: "Tech", company: "PMW",
    }, now);
    expect(after).toMatchObject({ durationMinutes: 10, flagReason: "" });
    expect(describeChange(before, after)).toBe(
      "Time out: 24 Sep 2026 10:00 → 23 Sep 2026 10:10; Duration: 1440 min → 10 min; Flag: Lasted over 12 hours → —",
    );
  });
});

describe("validateEdit", () => {
  const base = { timeIn: "2026-09-24T02:42:00Z", timeOut: "2026-09-24T02:49:00Z", areaInName: "A", areaOutName: "A", fullName: "Ali", department: "QA/QC", position: "Tech", company: "PMW" };
  it("refuses a time out before the time in", () => {
    expect(validateEdit({ ...base, timeOut: "2026-09-24T02:00:00Z" })).toBe("Time out must be after time in.");
  });
  it("accepts a valid edit", () => {
    expect(validateEdit(base)).toBe("");
  });
});

describe("export and references", () => {
  it("names the break for the audit trail", () => {
    expect(breakReference(brk({ id: "42" }))).toBe("SMK-42");
  });
  it("exports one header and one row per break", () => {
    const csv = breaksCsv([brk({})], now).split("\r\n");
    expect(csv).toHaveLength(2);
    expect(csv[0]).toContain("Time in (MYT)");
    expect(csv[1]).toContain("ali@gmail.com");
  });
  it("makes unambiguous area codes", () => {
    expect(newAreaCode(() => 0)).toBe("AAAAAA");
    expect(newAreaCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/smoking/adminData.test.ts`
Expected: FAIL — cannot resolve `./adminData`.

- [ ] **Step 3: Write the implementation**

Check `formatMalaysiaDateTime`'s output format in `src/utils/malaysiaTime.ts:137` first; the `describeChange` expectation assumes `"24 Sep 2026 10:00"`. If its format differs, adjust the **test expectation** to that format — don't write a second date formatter.

```ts
// src/utils/smoking/adminData.ts
import { csvRow } from "../csv";
import { MALAYSIA_TIME_LABEL, formatMalaysiaDateTime } from "../malaysiaTime";
import { flagReasonFor, type SmokingBreak } from "./schema";

export interface BreakFilters {
  from: string;
  to: string;
  department: string;
  area: string;
  search: string;
  flaggedOnly: boolean;
}

export interface PersonTotal {
  email: string;
  fullName: string;
  department: string;
  breaks: number;
  totalMinutes: number;
  averageMinutes: number;
  flagged: number;
}

export interface BreakEdit {
  timeIn: string;
  timeOut: string | null;
  areaInName: string;
  areaOutName: string;
  fullName: string;
  department: string;
  position: string;
  company: string;
}

const AREA_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function effectiveFlag(b: SmokingBreak, now: Date): string {
  if (b.resolvedAt) return "";
  return b.flagReason || flagReasonFor(new Date(b.timeIn), b.timeOut ? new Date(b.timeOut) : null, now);
}

export function filterBreaks(breaks: SmokingBreak[], f: BreakFilters, now: Date): SmokingBreak[] {
  const search = f.search.trim().toLowerCase();
  return breaks
    .filter((b) => b.timeIn >= f.from && b.timeIn < f.to)
    .filter((b) => !f.department || b.department === f.department)
    .filter((b) => !f.area || b.areaInName === f.area || b.areaOutName === f.area)
    .filter((b) => !search || b.fullName.toLowerCase().includes(search) || b.email.includes(search))
    .filter((b) => !f.flaggedOnly || effectiveFlag(b, now) !== "")
    .sort((a, b) => b.timeIn.localeCompare(a.timeIn));
}

export function currentlyOut(breaks: SmokingBreak[], now: Date): SmokingBreak[] {
  return breaks.filter((b) => !b.timeOut && effectiveFlag(b, now) === "");
}

export function computeTotals(breaks: SmokingBreak[], now: Date): PersonTotal[] {
  const byEmail = new Map<string, PersonTotal>();
  for (const b of breaks) {
    const total = byEmail.get(b.email) ?? {
      email: b.email, fullName: b.fullName, department: b.department, breaks: 0, totalMinutes: 0, averageMinutes: 0, flagged: 0,
    };
    if (effectiveFlag(b, now)) total.flagged += 1;
    else if (b.durationMinutes != null) {
      total.breaks += 1;
      total.totalMinutes += b.durationMinutes;
    }
    byEmail.set(b.email, total);
  }
  return [...byEmail.values()]
    .map((t) => ({ ...t, averageMinutes: t.breaks ? Math.round(t.totalMinutes / t.breaks) : 0 }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes || a.fullName.localeCompare(b.fullName));
}

export function validateEdit(edit: BreakEdit): string {
  if (!edit.fullName.trim()) return "Name is required.";
  if (!edit.department.trim()) return "Department is required.";
  if (Number.isNaN(Date.parse(edit.timeIn))) return "Time in is not a valid time.";
  if (edit.timeOut) {
    if (Number.isNaN(Date.parse(edit.timeOut))) return "Time out is not a valid time.";
    if (Date.parse(edit.timeOut) <= Date.parse(edit.timeIn)) return "Time out must be after time in.";
  }
  return "";
}

export function applyEdit(before: SmokingBreak, edit: BreakEdit, now: Date): SmokingBreak {
  const timeIn = new Date(edit.timeIn);
  const timeOut = edit.timeOut ? new Date(edit.timeOut) : null;
  return {
    ...before,
    fullName: edit.fullName.trim(),
    department: edit.department.trim(),
    position: edit.position.trim(),
    company: edit.company.trim(),
    areaInName: edit.areaInName,
    areaOutName: timeOut ? edit.areaOutName : "",
    timeIn: timeIn.toISOString(),
    timeOut: timeOut ? timeOut.toISOString() : null,
    durationMinutes: timeOut ? Math.round((timeOut.getTime() - timeIn.getTime()) / 60_000) : null,
    flagReason: timeOut ? flagReasonFor(timeIn, timeOut, now) : "",
  };
}

const show = (value: unknown) => (value === null || value === undefined || value === "" ? "—" : String(value));
const when = (iso: string | null) => (iso ? formatMalaysiaDateTime(iso) : "—");

export function describeChange(before: SmokingBreak, after: SmokingBreak): string {
  const pairs: Array<[string, string, string]> = [
    ["Name", show(before.fullName), show(after.fullName)],
    ["Department", show(before.department), show(after.department)],
    ["Position", show(before.position), show(after.position)],
    ["Company", show(before.company), show(after.company)],
    ["Area in", show(before.areaInName), show(after.areaInName)],
    ["Area out", show(before.areaOutName), show(after.areaOutName)],
    ["Time in", when(before.timeIn), when(after.timeIn)],
    ["Time out", when(before.timeOut), when(after.timeOut)],
    ["Duration", before.durationMinutes == null ? "—" : `${before.durationMinutes} min`, after.durationMinutes == null ? "—" : `${after.durationMinutes} min`],
    ["Flag", show(before.flagReason), show(after.flagReason)],
  ];
  return pairs.filter(([, a, b]) => a !== b).map(([label, a, b]) => `${label}: ${a} → ${b}`).join("; ");
}

export function breakReference(b: SmokingBreak): string {
  return `SMK-${b.id}`;
}

export function breaksCsv(breaks: SmokingBreak[], now: Date): string {
  const lines = [csvRow([
    "Name", "Email", "Department", "Position", "Company", "Area in", "Area out",
    `Time in (${MALAYSIA_TIME_LABEL})`, `Time out (${MALAYSIA_TIME_LABEL})`, "Duration (min)", "Flag", "Resolution note",
  ])];
  for (const b of breaks) {
    lines.push(csvRow([
      b.fullName, b.email, b.department, b.position, b.company, b.areaInName, b.areaOutName,
      formatMalaysiaDateTime(b.timeIn), b.timeOut ? formatMalaysiaDateTime(b.timeOut) : "",
      b.durationMinutes ?? "", effectiveFlag(b, now), b.resolutionNote ?? "",
    ]));
  }
  return lines.join("\r\n");
}

export function totalsCsv(totals: PersonTotal[]): string {
  const lines = [csvRow(["Name", "Email", "Department", "Breaks", "Total (min)", "Average (min)", "Flagged"])];
  for (const t of totals) {
    lines.push(csvRow([t.fullName, t.email, t.department, t.breaks, t.totalMinutes, t.averageMinutes, t.flagged]));
  }
  return lines.join("\r\n");
}

export function newAreaCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += AREA_CODE_ALPHABET[Math.floor(random() * AREA_CODE_ALPHABET.length)];
  return code;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/smoking/adminData.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/smoking/adminData.ts src/utils/smoking/adminData.test.ts
git commit -m "Filter, total, correct and export smoking breaks for OSHES admins"
```

---

### Task 10: Admin SharePoint store

**Files:**
- Create: `src/utils/smoking/adminStore.ts`
- Test: `src/utils/smoking/adminStore.test.ts`

**Interfaces:**
- Consumes: `ensureListSchema`, `spGet`, `spPatch`, `spPost`, `spDelete` from `../formBuilderSP`; `SMOKING_LISTS`, `SMOKING_LIST_SCHEMAS`, types (Task 7); `BreakFilters` not needed here.
- Produces:
  - `ensureSmokingLists(token: string): Promise<void>`
  - `rowToBreak(row: Record<string, unknown>): SmokingBreak` (SP REST row: `Id` number, fields by internal name)
  - `rowToArea(row): SmokingArea`, `rowToProfile(row): SmokingProfile & { id: string; firstSeen: string; lastSeen: string }`
  - `loadBreaks(token: string, fromIso: string, toIso: string): Promise<SmokingBreak[]>` — `TimeIn ge from and TimeIn lt to`, plus every still-open break regardless of date (so "Open over 12 hours" always surfaces)
  - `saveBreak(token: string, b: SmokingBreak): Promise<void>` — writes the editable fields + Status/Duration/Flag
  - `resolveFlag(token: string, id: string, note: string, by: string, at: Date): Promise<void>`
  - `deleteBreak(token: string, id: string): Promise<void>`
  - `loadAreas(token: string): Promise<SmokingArea[]>`, `createArea(token: string, name: string, code: string): Promise<void>`, `updateArea(token: string, area: SmokingArea): Promise<void>`
  - `loadProfiles(token: string): Promise<Array<SmokingProfile & { id: string; firstSeen: string; lastSeen: string }>>`

- [ ] **Step 1: Write the failing test** (mapping only — HTTP helpers are covered elsewhere)

```ts
// src/utils/smoking/adminStore.test.ts
import { describe, expect, it } from "vitest";
import { breakFilterFor, rowToArea, rowToBreak } from "./adminStore";

describe("admin store mapping", () => {
  it("reads a SharePoint REST row into a break", () => {
    expect(rowToBreak({
      Id: 12, Email: "ali@gmail.com", FullName: "Ali", TimeIn: "2026-09-24T02:42:00Z", TimeOut: null,
      DurationMinutes: null, FlagReason: null, ResolvedAt: null,
    })).toMatchObject({ id: "12", email: "ali@gmail.com", timeOut: null, durationMinutes: null, flagReason: "", resolvedAt: "" });
  });

  it("reads an area", () => {
    expect(rowToArea({ Id: 3, Title: "Block A", Code: "AAA111", Active: "no" }))
      .toEqual({ id: "3", name: "Block A", code: "AAA111", active: false });
  });

  it("asks for the date range plus anything still open", () => {
    expect(breakFilterFor("2026-09-21T00:00:00.000Z", "2026-09-28T00:00:00.000Z")).toBe(
      "(TimeIn ge datetime'2026-09-21T00:00:00.000Z' and TimeIn lt datetime'2026-09-28T00:00:00.000Z') or Status eq 'open'",
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/smoking/adminStore.test.ts`
Expected: FAIL — cannot resolve `./adminStore`.

- [ ] **Step 3: Write the implementation**

```ts
// src/utils/smoking/adminStore.ts
import { ensureListSchema, spDelete, spGet, spPatch, spPost } from "../formBuilderSP";
import { SMOKING_LISTS, SMOKING_LIST_SCHEMAS, type SmokingArea, type SmokingBreak, type SmokingProfile } from "./schema";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL as string || "").replace(/\/$/, "");

function items(list: string): string {
  return `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(list)}')/items`;
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export async function ensureSmokingLists(token: string): Promise<void> {
  for (const schema of SMOKING_LIST_SCHEMAS) await ensureListSchema(token, schema);
}

export function rowToBreak(row: Record<string, unknown>): SmokingBreak {
  const duration = row.DurationMinutes;
  return {
    id: str(row.Id),
    email: str(row.Email),
    fullName: str(row.FullName),
    department: str(row.Department),
    position: str(row.Position),
    company: str(row.Company),
    areaInCode: str(row.AreaInCode),
    areaInName: str(row.AreaInName),
    areaOutCode: str(row.AreaOutCode),
    areaOutName: str(row.AreaOutName),
    timeIn: str(row.TimeIn),
    timeOut: str(row.TimeOut) || null,
    durationMinutes: duration == null || duration === "" ? null : Number(duration),
    flagReason: str(row.FlagReason),
    resolutionNote: str(row.ResolutionNote),
    resolvedBy: str(row.ResolvedBy),
    resolvedAt: str(row.ResolvedAt),
  };
}

export function rowToArea(row: Record<string, unknown>): SmokingArea {
  return { id: str(row.Id), name: str(row.Title), code: str(row.Code), active: str(row.Active) !== "no" };
}

export function rowToProfile(row: Record<string, unknown>): SmokingProfile & { id: string; firstSeen: string; lastSeen: string } {
  return {
    id: str(row.Id),
    email: str(row.Email),
    fullName: str(row.FullName),
    department: str(row.Department),
    departmentFromList: str(row.DepartmentFromList) !== "no",
    position: str(row.Position),
    staffId: str(row.StaffId),
    company: str(row.Company),
    signInMethod: str(row.SignInMethod) === "microsoft" ? "microsoft" : "google",
    firstSeen: str(row.FirstSeen),
    lastSeen: str(row.LastSeen),
  };
}

export function breakFilterFor(fromIso: string, toIso: string): string {
  return `(TimeIn ge datetime'${fromIso}' and TimeIn lt datetime'${toIso}') or Status eq 'open'`;
}

/** Follows SharePoint's paging so a busy month is never silently cut at 2,000 rows. */
async function readAll(token: string, url: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let next: string | undefined = url;
  while (next) {
    const page = (await spGet(token, next)) as { value?: Record<string, unknown>[]; "odata.nextLink"?: string };
    rows.push(...(page.value ?? []));
    next = page["odata.nextLink"];
  }
  return rows;
}

export async function loadBreaks(token: string, fromIso: string, toIso: string): Promise<SmokingBreak[]> {
  const filter = encodeURIComponent(breakFilterFor(fromIso, toIso));
  return (await readAll(token, `${items(SMOKING_LISTS.log)}?$filter=${filter}&$top=2000`)).map(rowToBreak);
}

export async function saveBreak(token: string, b: SmokingBreak): Promise<void> {
  await spPatch(token, `${items(SMOKING_LISTS.log)}(${b.id})`, {
    FullName: b.fullName,
    Department: b.department,
    Position: b.position,
    Company: b.company,
    AreaInName: b.areaInName,
    AreaOutName: b.areaOutName,
    TimeIn: b.timeIn,
    TimeOut: b.timeOut,
    Status: b.timeOut ? "closed" : "open",
    DurationMinutes: b.durationMinutes,
    FlagReason: b.flagReason,
  });
}

export async function resolveFlag(token: string, id: string, note: string, by: string, at: Date): Promise<void> {
  await spPatch(token, `${items(SMOKING_LISTS.log)}(${id})`, {
    ResolutionNote: note.trim(),
    ResolvedBy: by,
    ResolvedAt: at.toISOString(),
  });
}

export async function deleteBreak(token: string, id: string): Promise<void> {
  await spDelete(token, `${items(SMOKING_LISTS.log)}(${id})`);
}

export async function loadAreas(token: string): Promise<SmokingArea[]> {
  return (await readAll(token, `${items(SMOKING_LISTS.areas)}?$top=500`)).map(rowToArea)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

export async function createArea(token: string, name: string, code: string): Promise<void> {
  await spPost(token, items(SMOKING_LISTS.areas), { Title: name.trim(), Code: code, Active: "yes" });
}

export async function updateArea(token: string, area: SmokingArea): Promise<void> {
  await spPatch(token, `${items(SMOKING_LISTS.areas)}(${area.id})`, { Title: area.name.trim(), Active: area.active ? "yes" : "no" });
}

export async function loadProfiles(token: string) {
  return (await readAll(token, `${items(SMOKING_LISTS.profiles)}?$top=2000`)).map(rowToProfile)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}
```

Check how `spGet` returns data (`odata=nometadata` puts the next link in `odata.nextLink`; verbose puts it in `d.__next`). Match whatever `spGet` in `src/utils/formBuilderSP.ts:704` requests.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/smoking/adminStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/smoking/adminStore.ts src/utils/smoking/adminStore.test.ts
git commit -m "Read and write smoking breaks, areas and profiles as the signed-in admin"
```

---

### Task 11: Portal navigation entry

**Files:**
- Modify: `src/types/portal.ts:39-51` (add `"smoking"` to `PortalScreen`)
- Modify: `src/utils/portalRole.ts` (`portalSections`, oversight section, after the audit item)
- Modify: `src/utils/portalRole.test.ts`
- Modify: `src/components/portal/PortalShell.tsx:30-41` (icon)
- Modify: `src/pages/PortalPage.tsx` (switch case, placeholder screen until Task 12)

**Interfaces:**
- Produces: `PortalScreen` includes `"smoking"`; nav item `{ screen: "smoking", label: "Smoking log", count: null, hint: "Who scanned in and out at the smoking areas, and for how long", caption: "Smoking breaks" }` for `access.isAdmin || access.isAuditor`.

- [ ] **Step 1: Write the failing test** — add to the `navigation` describe block in `src/utils/portalRole.test.ts`:

```ts
  it("shows the smoking log to admins and auditors only", () => {
    expect(labels(input({ userEmail: "faizal@pmw.gov.my", isAdmin: true }))).toContain("Smoking log");
    expect(labels(input({ userEmail: "aud@pmw.gov.my", isAuditor: true }))).toContain("Smoking log");
    expect(labels(input({ userEmail: "nurul@pmw.gov.my" }))).not.toContain("Smoking log");
    expect(allowedScreens(derivePortalAccess(input({ userEmail: "sazali@marinekita.com" })))).not.toContain("smoking");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/portalRole.test.ts`
Expected: the new test FAILs ("Smoking log" missing).

- [ ] **Step 3: Implement**
  - `src/types/portal.ts`: add `| "smoking"` after `| "audit"`.
  - `src/utils/portalRole.ts`, inside `if (seesBeyondOwn)`, directly after the `canSeeAudit` block:

```ts
    // Its own list, not a form: OSHES's view of the smoking-area posters.
    if (access.isAdmin || access.isAuditor) {
      oversight.push({
        screen: "smoking",
        label: "Smoking log",
        count: null,
        hint: "Who scanned in and out at the smoking areas, and for how long",
        caption: "Smoking breaks",
      });
    }
```

  - `PortalShell.tsx`: `import SmokingRoomsOutlinedIcon from "@mui/icons-material/SmokingRoomsOutlined";` and add `smoking: SmokingRoomsOutlinedIcon,` to `SCREEN_ICON`.
  - `PortalPage.tsx`: `import SmokingLogScreen from "./portal/SmokingLogScreen";` and `case "smoking": return <SmokingLogScreen />;`. Create `src/pages/portal/SmokingLogScreen.tsx` as a stub for now: `export default function SmokingLogScreen() { return null; }` (Task 12 replaces it).

- [ ] **Step 4: Run the whole role test file**

Run: `npx vitest run src/utils/portalRole.test.ts`
Expected: the new test PASSes. Any existing test asserting an admin's or auditor's **exact** label list now fails because of the new item — update those expected arrays to include `"Smoking log"` immediately after `"Audit trail"`. Do not change any other expectation.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: clean. (If an exhaustive `Record<PortalScreen, …>` elsewhere now errors, add a `smoking` entry there.)

- [ ] **Step 6: Commit**

```bash
git add src/types/portal.ts src/utils/portalRole.ts src/utils/portalRole.test.ts src/components/portal/PortalShell.tsx src/pages/PortalPage.tsx src/pages/portal/SmokingLogScreen.tsx
git commit -m "Put a Smoking log page in the portal nav for OSHES admins and auditors"
```

---

### Task 12: Smoking log screen — Log and Totals tabs, edit, resolve, delete

**Files:**
- Modify (replace stub): `src/pages/portal/SmokingLogScreen.tsx`
- Create: `src/components/smoking/BreakEditDialog.tsx`
- Create: `src/components/smoking/DeleteBreakDialog.tsx`
- Create: `src/components/smoking/ResolveFlagDialog.tsx`
- Test: `src/components/smoking/DeleteBreakDialog.test.tsx`

**Interfaces:**
- Consumes: `usePortal()` → `{ access, spClient, userEmail, userName, toast }` (confirm `toast` exists on the context — `ExportCsvButton` uses it); `writeAuditEntry(spClient, { reference, who, event })`; everything from Tasks 9 and 10; `downloadCsv(csv, fileName)` from `src/utils/csv.ts`; `malaysiaDateStamp()` from `src/utils/malaysiaTime.ts`; `PageHeader`, `Widget`, `WidgetEmpty`, `DataTable`, `DataRow`, `DataCell` from `src/components/Widget` (see `AuditScreen.tsx` for usage).
- Produces: `DeleteBreakDialog({ open, target: SmokingBreak | null, busy, onNo, onYes })`, `BreakEditDialog({ open, target, busy, onCancel, onSave(edit: BreakEdit) })`, `ResolveFlagDialog({ open, target, busy, onCancel, onSave(note: string) })`.

- [ ] **Step 1: Write the failing dialog test**

Check first whether `@testing-library/react` is installed (`ls ../../../node_modules/@testing-library`). The repo's vitest config mentions rendering `.tsx` screens, so look at an existing `*.test.tsx` under `src/` and copy its render setup (it may use `react-dom/client` + `act` directly). The test below uses `react-dom/client`; adapt to the local pattern if one exists.

```tsx
// src/components/smoking/DeleteBreakDialog.test.tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import DeleteBreakDialog from "./DeleteBreakDialog";
import type { SmokingBreak } from "../../utils/smoking/schema";

const target: SmokingBreak = {
  id: "12", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", position: "Tech", company: "PMW",
  areaInCode: "A", areaInName: "Block A", areaOutCode: "", areaOutName: "",
  timeIn: "2026-09-24T02:42:00Z", timeOut: null, durationMinutes: null, flagReason: "",
};

describe("DeleteBreakDialog", () => {
  it("names the record, focuses No, and only deletes on Yes", async () => {
    const onNo = vi.fn();
    const onYes = vi.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    await act(async () => {
      createRoot(host).render(<DeleteBreakDialog open target={target} busy={false} onNo={onNo} onYes={onYes} />);
    });
    expect(document.body.textContent).toContain("Delete this break record for Ali, 24 Sep 2026 10:42?");
    expect(document.body.textContent).toContain("This cannot be undone.");
    const buttons = [...document.querySelectorAll("button")];
    const no = buttons.find((b) => b.textContent === "No")!;
    const yes = buttons.find((b) => b.textContent === "Yes, delete")!;
    expect(document.activeElement).toBe(no);
    await act(async () => no.click());
    expect(onNo).toHaveBeenCalled();
    expect(onYes).not.toHaveBeenCalled();
    await act(async () => yes.click());
    expect(onYes).toHaveBeenCalled();
  });
});
```

If `jsdom` is not installed, drop the `@vitest-environment` line and this test file, and instead cover the dialog text with a pure `deletePrompt(target)` function exported from `DeleteBreakDialog.tsx` and tested in a `.test.ts` file. Do not add a dependency.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/smoking/DeleteBreakDialog.test.tsx`
Expected: FAIL — cannot resolve `./DeleteBreakDialog`.

- [ ] **Step 3: Write the dialogs**

```tsx
// src/components/smoking/DeleteBreakDialog.tsx
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";
import { formatMalaysiaDateTime } from "../../utils/malaysiaTime";
import type { SmokingBreak } from "../../utils/smoking/schema";

export function deletePrompt(target: SmokingBreak): string {
  return `Delete this break record for ${target.fullName || target.email}, ${formatMalaysiaDateTime(target.timeIn)}?`;
}

/** Permanent. No is the default so a stray Enter never deletes. */
export default function DeleteBreakDialog({ open, target, busy, onNo, onYes }: {
  open: boolean;
  target: SmokingBreak | null;
  busy: boolean;
  onNo: () => void;
  onYes: () => void;
}) {
  return (
    <Dialog open={open && !!target} onClose={busy ? undefined : onNo} maxWidth="xs" fullWidth>
      <DialogTitle>Delete break record</DialogTitle>
      <DialogContent>
        <DialogContentText>{target ? deletePrompt(target) : ""}</DialogContentText>
        <DialogContentText sx={{ mt: 1 }}>This cannot be undone.</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={onNo} disabled={busy}>No</Button>
        <Button color="error" variant="contained" onClick={onYes} disabled={busy}>Yes, delete</Button>
      </DialogActions>
    </Dialog>
  );
}
```

```tsx
// src/components/smoking/ResolveFlagDialog.tsx
import { useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import type { SmokingBreak } from "../../utils/smoking/schema";

export default function ResolveFlagDialog({ open, target, busy, onCancel, onSave }: {
  open: boolean;
  target: SmokingBreak | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [target?.id]);
  return (
    <Dialog open={open && !!target} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Resolve flag</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The times stay as recorded. Your note and name are kept with the break.
        </Typography>
        <TextField autoFocus fullWidth multiline minRows={2} label="Note"
          placeholder="e.g. Forgot to scan out, confirmed about 10 min" value={note} onChange={(e) => setNote(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="contained" disabled={busy || !note.trim()} onClick={() => onSave(note)}>Resolve</Button>
      </DialogActions>
    </Dialog>
  );
}
```

`BreakEditDialog.tsx`: MUI `Dialog` with `TextField type="datetime-local"` for time in/out (convert ISO ↔ Malaysian local `YYYY-MM-DDTHH:mm` with helpers `isoToMytInput(iso)` = shift by +8 h and slice(0,16), `mytInputToIso(value)` = `new Date(value + ":00+08:00").toISOString()`; empty time out → `null`), `TextField`s for area in/out name, name, department, position, company. On Save: build `BreakEdit`, run `validateEdit`; show the message inline if non-empty; else call `onSave(edit)`. Export `isoToMytInput` and `mytInputToIso` and add a test file `src/components/smoking/breakEditTime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isoToMytInput, mytInputToIso } from "./BreakEditDialog";

describe("edit dialog time fields", () => {
  it("shows Malaysian wall-clock time and round-trips it", () => {
    expect(isoToMytInput("2026-09-24T02:42:00.000Z")).toBe("2026-09-24T10:42");
    expect(mytInputToIso("2026-09-24T10:42")).toBe("2026-09-24T02:42:00.000Z");
  });
});
```

```tsx
// src/components/smoking/BreakEditDialog.tsx
import { useEffect, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material";
import { validateEdit, type BreakEdit } from "../../utils/smoking/adminData";
import type { SmokingBreak } from "../../utils/smoking/schema";

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

export function isoToMytInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + MYT_OFFSET_MS).toISOString().slice(0, 16);
}

export function mytInputToIso(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}

interface Draft {
  timeIn: string;
  timeOut: string;
  areaInName: string;
  areaOutName: string;
  fullName: string;
  department: string;
  position: string;
  company: string;
}

function draftOf(b: SmokingBreak): Draft {
  return {
    timeIn: isoToMytInput(b.timeIn),
    timeOut: isoToMytInput(b.timeOut),
    areaInName: b.areaInName,
    areaOutName: b.areaOutName,
    fullName: b.fullName,
    department: b.department,
    position: b.position,
    company: b.company,
  };
}

export default function BreakEditDialog({ open, target, busy, onCancel, onSave }: {
  open: boolean;
  target: SmokingBreak | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (edit: BreakEdit) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    setDraft(target ? draftOf(target) : null);
    setProblem("");
  }, [target]);

  if (!draft) return null;
  const field = (key: keyof Draft, label: string, type = "text") => (
    <TextField label={label} type={type} value={draft[key]} fullWidth
      slotProps={type === "datetime-local" ? { inputLabel: { shrink: true } } : undefined}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
  );

  const save = () => {
    const edit: BreakEdit = {
      timeIn: draft.timeIn ? mytInputToIso(draft.timeIn) : "",
      timeOut: draft.timeOut ? mytInputToIso(draft.timeOut) : null,
      areaInName: draft.areaInName.trim(),
      areaOutName: draft.areaOutName.trim(),
      fullName: draft.fullName,
      department: draft.department,
      position: draft.position,
      company: draft.company,
    };
    const message = validateEdit(edit);
    if (message) setProblem(message);
    else onSave(edit);
  };

  return (
    <Dialog open={open && !!target} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Edit break</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {problem && <Alert severity="error">{problem}</Alert>}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            {field("timeIn", "Time in (MYT)", "datetime-local")}
            {field("timeOut", "Time out (MYT)", "datetime-local")}
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            {field("areaInName", "Area in")}
            {field("areaOutName", "Area out")}
          </Stack>
          {field("fullName", "Name")}
          {field("department", "Department")}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            {field("position", "Position")}
            {field("company", "Company")}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run dialog tests**

Run: `npx vitest run src/components/smoking/`
Expected: PASS.

- [ ] **Step 5: Write the screen** (Log + Totals tabs; Areas + People come in Task 13 — render `null` for those tabs for now)

Behaviour:
- On mount: `token = await spClient.acquireToken()`; `await ensureSmokingLists(token)` only if `access.isAdmin` (auditors can't create lists; on a list-missing error show "OSHES hasn't set up the smoking log yet"); then `loadBreaks(token, from, to)`. Default range: Monday 00:00 MYT of this week → next Monday.
- Header: `PageHeader title="Smoking log"`, `meta` = "N on a break now" (from `currentlyOut`), actions = Export button (Log tab → `breaksCsv(filtered, now)`; Totals tab → `totalsCsv(computeTotals(filtered, now))`), downloaded via `downloadCsv(csv, \`smoking-log-${malaysiaDateStamp()}.csv\`)` and a toast "Exported N rows".
- Filters row: date From/To (`type="date"`, MYT days), Department select (distinct departments in loaded rows), Area select (distinct area names), Search, "Flagged only" switch. Changing From/To reloads from SharePoint; the others filter in memory with `filterBreaks`.
- Log table columns: Name, Department, Position, Company, Area in → out, In, Out, Duration, Flag (a warning chip with `effectiveFlag`, or "Resolved" with the note as tooltip), Actions.
- Row actions, only when `access.isAdmin && !access.readOnly`: Edit, Resolve flag (only when flagged), Delete.
- Edit save: `after = applyEdit(before, edit, new Date())`; `await saveBreak(token, after)`; `await writeAuditEntry(spClient, { reference: breakReference(after), who: userEmail, event: \`Smoking break edited — ${describeChange(before, after)}\` })`; replace the row in state; toast "Break updated".
- Resolve: `await resolveFlag(token, id, note, userEmail, new Date())`; audit event `Smoking flag resolved — ${note}`; update row.
- Delete: `await deleteBreak(token, id)`; audit event `Smoking break deleted — ${b.fullName} <${b.email}>, ${areaInName} ${formatMalaysiaDateTime(timeIn)} → ${timeOut ? formatMalaysiaDateTime(timeOut) : "no scan-out"}, ${durationMinutes ?? "—"} min`; remove the row; toast "Break deleted".
- History: a small "History" link per row opens a popover listing `audit.filter(e => e.reference === breakReference(b))` from `usePortal().audit`.
- Totals tab: `DataTable` of `computeTotals(filtered, now)` with columns Name, Department, Breaks, Total, Average, Flagged; a "Group by department" switch collapses rows into department sums (sum breaks/total/flagged; average = total/breaks).
- Every async action: set `busy`, catch errors into `toast(error.message)`, never leave the dialog stuck.

Write the component following `AuditScreen.tsx`'s structure (`Box sx={{ maxWidth: 1060 }}`, `PageHeader`, `Widget`/`DataTable`). Use MUI `Tabs`/`Tab` with values `"log" | "totals" | "areas" | "people"`; hide the Areas tab for non-admins.

- [ ] **Step 6: Typecheck, lint, full test run**

Run: `npx tsc -b && npx eslint src/pages/portal/SmokingLogScreen.tsx src/components/smoking && npx vitest run`
Expected: clean; all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/portal/SmokingLogScreen.tsx src/components/smoking
git commit -m "Let OSHES review, correct, resolve and delete smoking breaks, with every change audited"
```

---

### Task 13: Areas tab, poster printing, People tab

**Files:**
- Create: `src/components/smoking/AreaDialog.tsx`
- Create: `src/components/smoking/printSmokingPoster.ts`
- Test: `src/components/smoking/printSmokingPoster.test.ts`
- Modify: `src/pages/portal/SmokingLogScreen.tsx`

**Interfaces:**
- Consumes: `loadAreas`, `createArea`, `updateArea`, `loadProfiles` (Task 10); `newAreaCode` (Task 9); `generateQrWithLogo(text, { width, logoUrl })` from `src/utils/qrWithLogo.ts`; `appBaseUrl()` from `src/config/appBaseUrl.ts`.
- Produces: `smokingScanUrl(baseUrl: string, code: string): string`, `posterHtml(areaName: string, qrDataUrl: string, scanUrl: string): string`, `printSmokingPoster(area: SmokingArea): Promise<void>`, `AreaDialog({ open, area: SmokingArea | null, busy, onCancel, onSave(name: string) })`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/smoking/printSmokingPoster.test.ts
import { describe, expect, it } from "vitest";
import { posterHtml, smokingScanUrl } from "./printSmokingPoster";

describe("smoking poster", () => {
  it("points the QR at the area's scan page", () => {
    expect(smokingScanUrl("https://oshes.pmw-group.com/", "AAA111")).toBe("https://oshes.pmw-group.com/smoke?area=AAA111");
  });

  it("prints the area name, the instruction and the QR, escaping the name", () => {
    const html = posterHtml("Block <A>", "data:image/png;base64,xx", "https://x/smoke?area=AAA111");
    expect(html).toContain("Block &lt;A&gt;");
    expect(html).toContain("Scan when you arrive, scan again when you leave");
    expect(html).toContain('src="data:image/png;base64,xx"');
    expect(html).toContain("@page { size: A4");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/smoking/printSmokingPoster.test.ts`
Expected: FAIL — cannot resolve `./printSmokingPoster`.

- [ ] **Step 3: Write the poster module**

```ts
// src/components/smoking/printSmokingPoster.ts
import { appBaseUrl } from "../../config/appBaseUrl";
import { generateQrWithLogo } from "../../utils/qrWithLogo";
import type { SmokingArea } from "../../utils/smoking/schema";

export function smokingScanUrl(baseUrl: string, code: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/smoke?area=${encodeURIComponent(code)}`;
}

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function posterHtml(areaName: string, qrDataUrl: string, scanUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(areaName)} — smoking log poster</title>
<style>
  @page { size: A4 portrait; margin: 18mm; }
  body { font-family: system-ui, sans-serif; text-align: center; color: #111; margin: 0; }
  .kicker { font-size: 14pt; letter-spacing: .12em; text-transform: uppercase; color: #555; margin-top: 10mm; }
  h1 { font-size: 40pt; margin: 6mm 0 10mm; }
  img { width: 120mm; height: 120mm; }
  .how { font-size: 22pt; font-weight: 700; margin: 10mm 0 4mm; }
  .sub { font-size: 13pt; color: #444; }
  .url { font-size: 9pt; color: #777; margin-top: 12mm; word-break: break-all; }
</style></head><body>
  <div class="kicker">OSHES · Smoking log</div>
  <h1>${escape(areaName)}</h1>
  <img src="${qrDataUrl}" alt="QR code">
  <div class="how">Scan when you arrive, scan again when you leave</div>
  <div class="sub">First time? Sign in with Google and fill in your details once.</div>
  <div class="url">${escape(scanUrl)}</div>
</body></html>`;
}

export async function printSmokingPoster(area: SmokingArea): Promise<void> {
  const scanUrl = smokingScanUrl(appBaseUrl(), area.code);
  const qr = await generateQrWithLogo(scanUrl, { width: 1200, logoUrl: "/logo-128.png" });
  const win = window.open("", "_blank", "width=820,height=1100");
  if (!win) throw new Error("Allow pop-ups for this site to print the poster.");
  win.document.write(posterHtml(area.name, qr, scanUrl));
  win.document.close();
  win.onload = () => win.print();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/smoking/printSmokingPoster.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write AreaDialog and the two tabs**

`AreaDialog`: a Dialog with one `TextField` "Area name" (required), title "Add smoking area" / "Rename area", Save disabled when blank.

```tsx
// src/components/smoking/AreaDialog.tsx
import { useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import type { SmokingArea } from "../../utils/smoking/schema";

export default function AreaDialog({ open, area, busy, onCancel, onSave }: {
  open: boolean;
  area: SmokingArea | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");
  useEffect(() => setName(area?.name ?? ""), [area, open]);
  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{area ? "Rename area" : "Add smoking area"}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth sx={{ mt: 1 }} label="Area name" placeholder="e.g. Block A smoking area"
          value={name} onChange={(e) => setName(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="contained" disabled={busy || !name.trim()} onClick={() => onSave(name.trim())}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
```

In `SmokingLogScreen.tsx`:
- **Areas tab** (admins only): table of areas — Name, Code, Status (Active / Retired), actions **Print poster**, **Rename**, **Retire** / **Reactivate**. "Add area" button in the tab header. Add → `createArea(token, name, newAreaCode())`, audit `Smoking area added — ${name}` with reference `SMK-AREA-${code}`. Rename → `updateArea`, audit `Smoking area renamed — ${old} → ${new}`. Retire/Reactivate → `updateArea({ ...area, active })`, audit `Smoking area retired — ${name}` / `reactivated`. Print → `printSmokingPoster(area)`; toast any error.
- **People tab**: `loadProfiles(token)` on first open; table Name, Email, Department (append " (typed)" when `departmentFromList` is false), Position, Company, Staff ID, Signed in with (Google / Microsoft), First seen, Last seen (`formatMalaysiaDateTime`). Read-only. Export button → CSV of the same columns.

- [ ] **Step 6: Typecheck, lint, full test run**

Run: `npx tsc -b && npx eslint src && npx vitest run`
Expected: clean; all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/smoking src/pages/portal/SmokingLogScreen.tsx
git commit -m "Let OSHES add smoking areas, print their posters and see who has registered"
```

---

### Task 14: Configuration, setup notes and end-to-end check

**Files:**
- Modify: `.env.example`
- Modify: `scripts/check-env.mjs`
- Modify: `SETUP.md`

- [ ] **Step 1: `.env.example`** — add a section:

```bash
# ── Smoking log ────────────────────────────────────────────────────────────
# Google OAuth 2.0 *Web* client ID (Google Cloud Console → APIs & Services →
# Credentials). No secret is needed. The same value goes in both.
VITE_GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_ID=
# 32+ random characters. Signs the 90-day pass a smoker's phone keeps.
# Changing it signs everyone out of the smoking page (nothing else).
SMOKING_PASS_SECRET=
# HR's department list. Defaults shown; change only if HR moves it.
# HR_DEPARTMENTS_SITE_PATH=/sites/PMWHRDocs
# HR_DEPARTMENTS_LIST=Departments
# HR_DEPARTMENTS_COLUMN=Title
```

- [ ] **Step 2: `scripts/check-env.mjs`** — next to the API key check (line ~59), following the file's existing `check(condition, label)` pattern:

```js
check(set("VITE_GOOGLE_CLIENT_ID") && env.VITE_GOOGLE_CLIENT_ID === env.GOOGLE_CLIENT_ID,
  "VITE_GOOGLE_CLIENT_ID === GOOGLE_CLIENT_ID  (smoking log Google sign-in)");
check(set("SMOKING_PASS_SECRET") && env.SMOKING_PASS_SECRET.length >= 32,
  "SMOKING_PASS_SECRET is 32+ characters  (smoking log passes)");
```

Read the top of `check-env.mjs` to confirm `set` and `check` exist with these names; use whatever the file uses.

- [ ] **Step 3: `SETUP.md`** — add a "Smoking log" section with:
  1. **Google sign-in (≈10 min):** Google Cloud Console → create/choose a project → *OAuth consent screen*: External, app name "PMW OSHES Smoking Log", support email, add the production domain under authorised domains → *Credentials → Create credentials → OAuth client ID → Web application* → *Authorised JavaScript origins*: the production origin (`VITE_APP_BASE_URL`) and `http://localhost:5173` for local testing → copy the client ID into `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` on Vercel (Production, Preview, Development). Publish the consent screen so non-test users can sign in.
  2. **Pass secret:** generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` and set `SMOKING_PASS_SECRET`.
  3. **HR departments read access:** if the app-only identity uses `Sites.Selected`, grant `read` on the HR Docs site with the same Graph call as step 5 of this file, using the HR site's id (`GET /sites/pmwgroupcom.sharepoint.com:/sites/PMWHRDocs`). Symptom if missing: the profile form shows "The department list is unavailable — type yours."
  4. **First run:** an OSHES admin opens *Smoking log* in the portal (this creates the three lists), adds each area on the *Areas* tab and prints its poster.
  5. **Microsoft sign-in** uses the existing app registration; nothing to add. It only accepts PMW accounts.

- [ ] **Step 4: Full verification**

Run: `npx tsc -b && npx eslint . && npx vitest run && npm run build`
Expected: all clean/PASS; build succeeds.

- [ ] **Step 5: Browser check** — start the app with the preview tool (`.claude/launch.json` already defines the dev server; use `preview_start` by name). With `vercel dev` unavailable locally, the `/api/smoking` calls will fail, so verify:
  - `/smoke?area=TEST01` renders the sign-in stage with the Google button container and the Microsoft link, no console errors other than the expected API failure, and the page fits a 375 px viewport with no horizontal scroll.
  - As an admin in the portal: the *Smoking log* nav item appears with its icon; the screen renders its tabs; the delete dialog opens with **No** focused.
  - Take a screenshot of each for the hand-off.
  If `vercel dev` is available (`npm run dev:api`), additionally run the full flow against a test SharePoint site: sign in → profile → IN → rescan within 1 min (already in) → OUT → admin sees the row → edit → delete (Yes/No) → Audit Trail shows both entries → export opens in Excel.

- [ ] **Step 6: Commit**

```bash
git add .env.example scripts/check-env.mjs SETUP.md
git commit -m "Document the smoking log's Google sign-in, pass secret and HR access"
```

---

## Self-review notes

- Spec coverage: smoker flow (Tasks 6, 8), scan rules incl. 1-min window, other-area OUT, 12 h flag, retired area, concurrency (1, 5), HR departments + fallback (4, 8), profile fields + PDPA notice (6, 8), 90-day pass (2), Google/Microsoft verification (3), admin Log/Totals/Areas/People, filters, currently-out count, export (9, 10, 12, 13), edit + permanent delete with Yes/No + audit (9, 12), posters (13), CSP/setup (8, 14), no cron (flags computed at read in 9).
- Deviation from spec, deliberate: the spec suggested an ETag/`If-Match` guard for concurrent scans; the plan uses create-then-recheck-and-remove-duplicate (Task 5), which needs no second SharePoint API and is covered by a test. The spec also left "new secret vs reuse link-token secret" open; the existing link token is a random value stored on the item, not a signature, so a new `SMOKING_PASS_SECRET` is required.

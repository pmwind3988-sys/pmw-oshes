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
      lastClosedBreakFor: vi.fn().mockResolvedValue(null),
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

  it("refuses to sign in a blocked person and issues no pass", async () => {
    const d = deps({}, {
      findProfile: vi.fn().mockResolvedValue({
        id: "p1", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", departmentFromList: true,
        position: "Tech", staffId: "", company: "PMW", signInMethod: "google", blocked: true,
      }),
    });
    const res = await handleSmoking(post({ action: "signin", provider: "google", idToken: "t" }), d);
    expect(res).toEqual({ status: 403, body: { error: "blocked" } });
    expect(res.body.pass).toBeUndefined();
  });

  it("refuses a blocked person's scan", async () => {
    const d = deps({}, {
      findProfile: vi.fn().mockResolvedValue({
        id: "p1", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", departmentFromList: true,
        position: "Tech", staffId: "", company: "PMW", signInMethod: "google", blocked: true,
      }),
    });
    const res = await handleSmoking(post({ action: "scan", areaCode: "AAA111" }, pass()), d);
    expect(res).toEqual({ status: 403, body: { error: "blocked" } });
  });

  it("refuses a blocked person's profile-save without writing it", async () => {
    const d = deps({}, {
      findProfile: vi.fn().mockResolvedValue({
        id: "p1", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", departmentFromList: true,
        position: "Tech", staffId: "", company: "PMW", signInMethod: "google", blocked: true,
      }),
    });
    const res = await handleSmoking(post({
      action: "profile-save", fullName: "Ali", department: "QA/QC", position: "Technician",
    }, pass()), d);
    expect(res).toEqual({ status: 403, body: { error: "blocked" } });
    expect(d.store.saveProfile).not.toHaveBeenCalled();
  });

  it("refuses a blocked person's profile-get, so the home screen cannot greet them", async () => {
    const d = deps({}, {
      findProfile: vi.fn().mockResolvedValue({
        id: "p1", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", departmentFromList: true,
        position: "Tech", staffId: "", company: "PMW", signInMethod: "google", blocked: true,
      }),
    });
    const res = await handleSmoking(post({ action: "profile-get" }, pass()), d);
    expect(res).toEqual({ status: 403, body: { error: "blocked" } });
  });

  it("never lets the smoker see their own blocked flag or the profile's id", async () => {
    const d = deps({}, {
      findProfile: vi.fn().mockResolvedValue({
        id: "p1", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", departmentFromList: true,
        position: "Tech", staffId: "", company: "PMW", signInMethod: "google", blocked: false,
      }),
    });
    const res = await handleSmoking(post({ action: "profile-get" }, pass()), d);
    expect(res.status).toBe(200);
    expect(res.body.profile).not.toHaveProperty("id");
    expect(res.body.profile).not.toHaveProperty("blocked");
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

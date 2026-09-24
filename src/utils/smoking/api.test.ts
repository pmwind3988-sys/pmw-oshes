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

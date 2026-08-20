import { afterEach, describe, expect, it, vi } from "vitest";

import { appBaseUrl } from "./appBaseUrl";

/** Nothing here runs in a browser, so the fallback needs a stand-in origin. */
function withOrigin(origin: string) {
  vi.stubGlobal("window", { location: { origin } });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("appBaseUrl", () => {
  it("uses the configured origin, not the one the sender happens to be on", () => {
    vi.stubEnv("VITE_APP_BASE_URL", "https://pmw-oshes.vercel.app");
    withOrigin("https://pmw-oshes-git-main-pmw.vercel.app");
    expect(appBaseUrl()).toBe("https://pmw-oshes.vercel.app");
  });

  it("drops a trailing slash so a path can be appended to it", () => {
    vi.stubEnv("VITE_APP_BASE_URL", "https://pmw-oshes.vercel.app/");
    withOrigin("http://localhost:5173");
    expect(appBaseUrl()).toBe("https://pmw-oshes.vercel.app");
    expect(`${appBaseUrl()}/eval/abc`).toBe("https://pmw-oshes.vercel.app/eval/abc");
  });

  it("trims a value that was pasted with surrounding whitespace", () => {
    vi.stubEnv("VITE_APP_BASE_URL", "  https://pmw-oshes.vercel.app  ");
    withOrigin("http://localhost:5173");
    expect(appBaseUrl()).toBe("https://pmw-oshes.vercel.app");
  });

  it("falls back to the current origin when nothing is configured", () => {
    vi.stubEnv("VITE_APP_BASE_URL", "");
    withOrigin("http://localhost:5173");
    expect(appBaseUrl()).toBe("http://localhost:5173");
  });
});

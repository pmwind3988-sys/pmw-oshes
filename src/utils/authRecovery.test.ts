import { afterEach, describe, expect, it, vi } from "vitest";

type RecoveryDetail = {
  reason: "protected_resource_unauthorized";
  message: string;
};

class TestCustomEvent<T> extends Event {
  readonly detail: T;

  constructor(type: string, init: CustomEventInit<T>) {
    super(type);
    this.detail = init.detail as T;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("notifyAuthRecoveryForResponse", () => {
  it("treats MSAL timed_out as a stale auth timeout", async () => {
    const { isAuthTimeoutError, isStaleAuthError } = await import("./authRecovery");
    const error = {
      errorCode: "timed_out",
      message: "timed_out: See https://aka.ms/msal.js.errors#timed_out for details",
    };

    expect(isStaleAuthError(error)).toBe(true);
    expect(isAuthTimeoutError(error)).toBe(true);
  });

  it("expires stale automatic re-login attempt markers", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => store.set(key, value)),
      removeItem: vi.fn((key: string) => store.delete(key)),
    });
    const {
      hasAuthTimeoutReloginAttempted,
      markAuthTimeoutReloginAttempted,
    } = await import("./authRecovery");

    store.set("pmw_auth_timeout_relogin_attempted", "1");
    expect(hasAuthTimeoutReloginAttempted()).toBe(false);

    markAuthTimeoutReloginAttempted();
    expect(hasAuthTimeoutReloginAttempted()).toBe(true);

    store.set("pmw_auth_timeout_relogin_attempted", String(Date.now() - 121000));
    expect(hasAuthTimeoutReloginAttempted()).toBe(false);
  });

  it("requests app-wide recovery for a SharePoint 401 response", async () => {
    const dispatchEvent = vi.fn<(event: Event) => boolean>(() => true);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue({ status: 401, ok: false } as Response);
    vi.stubGlobal("window", { dispatchEvent, location: { origin: "http://localhost" } });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal("CustomEvent", TestCustomEvent);
    const {
      AUTH_RECOVERY_REQUIRED_EVENT,
      fetchWithAuthRecovery,
    } = await import("./authRecovery");

    await fetchWithAuthRecovery("https://example.sharepoint.com/_api/web");

    expect(fetch).toHaveBeenCalledOnce();
    expect(dispatchEvent).toHaveBeenCalledOnce();
    const event = dispatchEvent.mock.calls[0][0] as TestCustomEvent<RecoveryDetail>;
    expect(event.type).toBe(AUTH_RECOVERY_REQUIRED_EVENT);
    expect(event.detail.reason).toBe("protected_resource_unauthorized");
  });

  it("does not re-authenticate for forbidden or server failures", async () => {
    const dispatchEvent = vi.fn<(event: Event) => boolean>(() => true);
    vi.stubGlobal("window", { dispatchEvent, location: { origin: "http://localhost" } });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal("CustomEvent", TestCustomEvent);
    const { notifyAuthRecoveryForResponse } = await import("./authRecovery");

    notifyAuthRecoveryForResponse({ status: 403 });
    notifyAuthRecoveryForResponse({ status: 500 });

    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});

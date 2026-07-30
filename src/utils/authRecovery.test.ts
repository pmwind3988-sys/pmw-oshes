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

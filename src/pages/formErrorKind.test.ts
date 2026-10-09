import { describe, expect, it, vi } from "vitest";

// The page module builds an MSAL instance when it loads, which needs a browser
// and a tenant. The classifier does not touch it, so the auth config is stubbed.
vi.mock("../auth/msalConfig", () => ({ msalInstance: {}, loginRequest: {} }));

import { formErrorKind } from "./DynamicFormPage";

describe("formErrorKind", () => {
  it("treats a switched-off form as closed", () => {
    expect(formErrorKind("This published form profile is turned off.")).toBe("closed");
  });

  it("treats a lapsed publishing period as expired", () => {
    expect(formErrorKind("This published form profile has expired.")).toBe("expired");
  });

  it("treats a missing slug or form as not found", () => {
    expect(formErrorKind("No form slug provided.")).toBe("notFound");
    expect(formErrorKind('Form "leave-form" not found.')).toBe("notFound");
  });

  it("treats a 404 response as not found", () => {
    expect(formErrorKind("Server returned status 404")).toBe("notFound");
  });

  it("falls back to failed for network and API errors", () => {
    expect(formErrorKind("Failed to fetch")).toBe("failed");
    expect(formErrorKind("Server error: 500")).toBe("failed");
  });
});

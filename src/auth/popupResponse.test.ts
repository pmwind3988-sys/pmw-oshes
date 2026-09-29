import { describe, expect, it } from "vitest";
import { isPopupSignInResponse } from "./popupResponse";

const page = (hash = "", search = "") => ({ location: { hash, search } });

// MSAL's state: base64url JSON of { id, meta: { interactionType } }, optionally "|userState".
const state = (interactionType: string) =>
  btoa(JSON.stringify({ id: "abc-123", meta: { interactionType } }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("isPopupSignInResponse", () => {
  it("recognises Microsoft's answer landing in a sign-in popup, even with its opener cut", () => {
    expect(isPopupSignInResponse(page(`#code=abc&state=${state("popup")}&client_info=1`))).toBe(true);
    expect(isPopupSignInResponse(page("", `?code=abc&state=${state("popup")}`))).toBe(true);
    expect(isPopupSignInResponse(page(`#error=access_denied&state=${state("popup")}`))).toBe(true);
    expect(isPopupSignInResponse(page(`#code=abc&state=${state("popup")}|user-state`))).toBe(true);
  });

  it("recognises a silent sign-in answering into a hidden frame", () => {
    expect(isPopupSignInResponse(page(`#code=abc&state=${state("silent")}`))).toBe(true);
  });

  it("leaves a redirect sign-in to the portal", () => {
    expect(isPopupSignInResponse(page(`#code=abc&state=${state("redirect")}`))).toBe(false);
  });

  it("leaves ordinary pages and unreadable state alone", () => {
    expect(isPopupSignInResponse(page("", "?area=AAA111"))).toBe(false);
    expect(isPopupSignInResponse(page("#section"))).toBe(false);
    expect(isPopupSignInResponse(page("#code=abc&state=not-msal"))).toBe(false);
    expect(isPopupSignInResponse(page(`#state=${state("popup")}`))).toBe(false);
  });
});

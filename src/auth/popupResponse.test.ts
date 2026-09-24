import { describe, expect, it } from "vitest";
import { isPopupSignInResponse } from "./popupResponse";

const page = (opener: unknown, hash = "", search = "") => ({ opener, location: { hash, search } });

describe("isPopupSignInResponse", () => {
  it("recognises Microsoft's answer landing in a sign-in popup", () => {
    expect(isPopupSignInResponse(page({}, "#code=abc&state=xyz&client_info=1"))).toBe(true);
    expect(isPopupSignInResponse(page({}, "", "?code=abc&state=xyz"))).toBe(true);
    expect(isPopupSignInResponse(page({}, "#error=access_denied&state=xyz"))).toBe(true);
  });

  it("leaves a redirect sign-in to the portal, which has no opener", () => {
    expect(isPopupSignInResponse(page(null, "#code=abc&state=xyz"))).toBe(false);
  });

  it("leaves an ordinary page opened from another window alone", () => {
    expect(isPopupSignInResponse(page({}, "", "?area=AAA111"))).toBe(false);
    expect(isPopupSignInResponse(page({}, "#section"))).toBe(false);
  });
});

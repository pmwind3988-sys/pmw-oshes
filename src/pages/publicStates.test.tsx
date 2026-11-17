import { describe, expect, it } from "vitest";
import { formStateFor, NOT_YOURS_STATE } from "./publicStates";

/** The screen each form-link state shows: picture, title, announcement and buttons. */
describe("formStateFor", () => {
  it("shows a closed form as a closed picture with a way back home", () => {
    expect(formStateFor("closed")).toMatchObject({
      mood: "closed",
      title: "This form is closed",
      role: "alert",
      secondary: { action: "backHome", label: "Back to home" },
    });
    expect(formStateFor("closed").primary).toBeUndefined();
  });

  it("shows a form with no published content as not ready", () => {
    expect(formStateFor("notReady")).toMatchObject({
      mood: "closed",
      title: "This form isn't ready yet",
      role: "alert",
      secondary: { action: "backHome" },
    });
  });

  it("shows a lapsed form as expired", () => {
    expect(formStateFor("expired")).toMatchObject({
      mood: "expired",
      title: "This form has expired",
      role: "alert",
    });
  });

  it("shows a missing form as not found", () => {
    expect(formStateFor("notFound")).toMatchObject({
      mood: "notfound",
      title: "We couldn't find this form",
      role: "alert",
    });
  });

  it("offers Try again when the form fails to load", () => {
    expect(formStateFor("failed")).toMatchObject({
      mood: "error",
      title: "We couldn't load this form",
      role: "alert",
      primary: { action: "tryAgain", label: "Try again" },
      secondary: { action: "backHome" },
    });
  });

  it("asks for sign-in with the report link as the alternative", () => {
    expect(formStateFor("signIn")).toMatchObject({
      mood: "locked",
      title: "Sign in to open this form",
      role: "status",
      primary: { action: "signIn", label: "Sign in with Microsoft 365" },
      secondary: { action: "report", label: "Report something without signing in" },
    });
  });
});

describe("NOT_YOURS_STATE", () => {
  it("is a locked, polite notice with the agreed title", () => {
    expect(NOT_YOURS_STATE).toMatchObject({
      mood: "locked",
      title: "This one isn't for you",
      role: "status",
    });
  });
});

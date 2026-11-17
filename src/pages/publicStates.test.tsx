import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageCard } from "../components/simple/MessageCard";
import { FORM_STATE_COPY, NOT_YOURS_COPY } from "./publicStates";

/**
 * Every full-page state a public form or approval link can show is one
 * MessageCard with a plain title. Checked as markup: there is no DOM here.
 */
describe("public form states", () => {
  // The error kinds formErrorKind() can return, each with its own screen.
  const kinds = ["closed", "expired", "notFound", "failed"] as const;
  const screenFor: Record<(typeof kinds)[number], keyof typeof FORM_STATE_COPY> = {
    closed: "closed",
    expired: "expired",
    notFound: "notFound",
    failed: "failed",
  };

  it.each(kinds)("renders the %s error as a message card with its title as the heading", (kind) => {
    const copy = FORM_STATE_COPY[screenFor[kind]];
    const markup = renderToStaticMarkup(<MessageCard mood={copy.mood} title={copy.title} body={copy.body} />);

    expect(markup).toContain("<h1");
    // Static markup escapes apostrophes, so compare against the escaped title.
    expect(markup).toContain(copy.title.replace(/'/g, "&#x27;"));
  });

  it("uses the agreed titles for each state", () => {
    expect(FORM_STATE_COPY.notReady.title).toBe("This form isn't ready yet");
    expect(FORM_STATE_COPY.closed.title).toBe("This form is closed");
    expect(FORM_STATE_COPY.expired.title).toBe("This form has expired");
    expect(FORM_STATE_COPY.notFound.title).toBe("We couldn't find this form");
    expect(FORM_STATE_COPY.failed.title).toBe("We couldn't load this form");
    expect(FORM_STATE_COPY.signIn.title).toBe("Sign in to open this form");
    expect(NOT_YOURS_COPY.title).toBe("This one isn't for you");
  });

  it("gives each state the picture that matches it", () => {
    expect(FORM_STATE_COPY.notReady.mood).toBe("closed");
    expect(FORM_STATE_COPY.closed.mood).toBe("closed");
    expect(FORM_STATE_COPY.expired.mood).toBe("expired");
    expect(FORM_STATE_COPY.notFound.mood).toBe("notfound");
    expect(FORM_STATE_COPY.failed.mood).toBe("error");
    expect(FORM_STATE_COPY.signIn.mood).toBe("locked");
    expect(NOT_YOURS_COPY.mood).toBe("locked");
  });
});

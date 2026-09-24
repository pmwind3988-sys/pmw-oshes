import { describe, expect, it } from "vitest";
import { personActionPrompt } from "./PersonActionDialog";

/**
 * As with DeleteBreakDialog: no jsdom in this repo, so the dialog's own DOM
 * behaviour (No focused by default, Yes/No wiring) is verified in the browser.
 * What is testable in isolation is the exact sentence shown per action.
 */

const person = { fullName: "Ali", email: "ali@gmail.com" };

describe("personActionPrompt", () => {
  it("warns before blocking, naming what stays", () => {
    expect(personActionPrompt("block", person).message).toBe(
      "Block Ali (ali@gmail.com)? They won't be able to scan in or out until unblocked. Their records stay.",
    );
  });

  it("asks plainly before unblocking", () => {
    expect(personActionPrompt("unblock", person).message).toBe("Unblock Ali (ali@gmail.com)?");
  });

  it("warns before removing, naming what stays and what happens next", () => {
    expect(personActionPrompt("remove", person).message).toBe(
      "Remove Ali (ali@gmail.com) from the smoking portal? Their break records stay in the log. If they scan again they will need to register again.",
    );
    expect(personActionPrompt("remove", person).confirmLabel).toBe("Yes, remove");
  });

  it("falls back to the email when there is no name on file", () => {
    const noName = { fullName: "", email: "ali@gmail.com" };
    expect(personActionPrompt("unblock", noName).message).toBe("Unblock ali@gmail.com (ali@gmail.com)?");
  });
});

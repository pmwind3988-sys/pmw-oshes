import { describe, expect, it } from "vitest";
import type { PortalChainStep, PortalRecord } from "../types";
import { displayLabel, formDisplayName, isMeaningfulSubject, recordMenuItems, stepCaption, waitingOnForReturned } from "./recordDisplay";

function record(overrides: Partial<Pick<PortalRecord, "subject" | "submitter" | "submitterEmail" | "formName" | "reference">>) {
  return {
    subject: "Hot work at Berth 3",
    submitter: "Sazali Ahmad",
    submitterEmail: "sazali@example.com",
    formName: "Permit to work",
    reference: "PTW-111126-0024",
    ...overrides,
  } as Pick<PortalRecord, "subject" | "submitter" | "submitterEmail" | "formName" | "reference">;
}

function step(overrides: Partial<PortalChainStep>): PortalChainStep {
  return {
    layerNumber: 1,
    roleLabel: "Safety Officer",
    who: "Nurul Huda",
    email: "nurul@example.com",
    type: "approval",
    state: "current",
    statusText: "Awaiting Nurul",
    subText: "",
    note: "",
    ...overrides,
  };
}

describe("displayLabel", () => {
  it("sentence-cases an all-capitals role title", () => {
    expect(displayLabel("WORK PERFORMER ACKNOWLEDGEMENT")).toBe("Work performer acknowledgement");
  });

  it("keeps the ampersand and the rest of a long all-capitals title", () => {
    expect(displayLabel("SAFETY DEPARTMENT REVIEW & APPROVAL")).toBe("Safety department review & approval");
  });

  it("keeps known acronyms upper-case", () => {
    expect(displayLabel("PERMIT TO WORK (PTW)")).toBe("Permit to work (PTW)");
    expect(displayLabel("PPE CHECK FOR IC STAFF")).toBe("PPE check for IC staff");
    expect(displayLabel("LOTO AND SLA REVIEW")).toBe("LOTO and SLA review");
  });

  it("returns mixed-case text unchanged", () => {
    expect(displayLabel("Permit to Work")).toBe("Permit to Work");
    expect(displayLabel("Safety Officer")).toBe("Safety Officer");
  });

  it("leaves text with fewer than two letters alone", () => {
    expect(displayLabel("A")).toBe("A");
    expect(displayLabel("42")).toBe("42");
    expect(displayLabel("")).toBe("");
  });
});

describe("isMeaningfulSubject", () => {
  it("accepts a real description of the work", () => {
    expect(isMeaningfulSubject(record({}))).toBe(true);
  });

  it("rejects an empty or untitled subject", () => {
    expect(isMeaningfulSubject(record({ subject: "" }))).toBe(false);
    expect(isMeaningfulSubject(record({ subject: "   " }))).toBe(false);
    expect(isMeaningfulSubject(record({ subject: "Untitled" }))).toBe(false);
    expect(isMeaningfulSubject(record({ subject: " untitled " }))).toBe(false);
  });

  it("rejects an email address used as the subject", () => {
    expect(isMeaningfulSubject(record({ subject: "sazali@example.com" }))).toBe(false);
  });

  it("rejects a subject that repeats the submitter, their email, the form or the reference", () => {
    expect(isMeaningfulSubject(record({ subject: "sazali ahmad " }))).toBe(false);
    expect(isMeaningfulSubject(record({ subject: "SAZALI@example.com" }))).toBe(false);
    expect(isMeaningfulSubject(record({ subject: "Permit To Work" }))).toBe(false);
    expect(isMeaningfulSubject(record({ subject: "ptw-111126-0024" }))).toBe(false);
  });
});

describe("stepCaption", () => {
  it("does not repeat a status that only differs in case", () => {
    expect(stepCaption(step({ statusText: "Signed", subText: "signed" }))).toBe("Nurul Huda · Signed");
  });

  it("reads who, then the status", () => {
    expect(stepCaption(step({}))).toBe("Nurul Huda · Awaiting Nurul");
  });

  it("drops who when it repeats the role label", () => {
    expect(stepCaption(step({ who: "safety officer", roleLabel: "Safety Officer", statusText: "Not started" }))).toBe("Not started");
  });

  it("drops who when it is empty", () => {
    expect(stepCaption(step({ who: "  ", statusText: "Not started" }))).toBe("Not started");
  });

  it("appends the sub-line when it is not already in the caption", () => {
    expect(stepCaption(step({ statusText: "Signed", subText: "on this layer 2 d 4 h" }))).toBe(
      "Nurul Huda · Signed · on this layer 2 d 4 h",
    );
  });

  it("does not repeat a sub-line the caption already carries", () => {
    expect(stepCaption(step({ statusText: "Signed 19 Aug", subText: "Signed 19 Aug" }))).toBe("Nurul Huda · Signed 19 Aug");
  });

  it("ignores an empty sub-line", () => {
    expect(stepCaption(step({ subText: "   " }))).toBe("Nurul Huda · Awaiting Nurul");
  });
});

describe("formDisplayName", () => {
  it("is the form name in sentence case", () => {
    expect(formDisplayName(record({ formName: "PERMIT TO WORK (PTW)" }))).toBe("Permit to work (PTW)");
    expect(formDisplayName(record({ formName: "Permit to Work" }))).toBe("Permit to Work");
  });
});

describe("recordMenuItems", () => {
  const all = { canReassign: true, canCancel: true, canDelete: true, cancelLabel: "Withdraw submission" };

  it("lists reassign, cancel and delete in that order when all are allowed", () => {
    expect(recordMenuItems(all).map((item) => item.id)).toEqual(["reassign", "cancel", "delete"]);
  });

  it("offers reassign only when reassigning is allowed", () => {
    expect(recordMenuItems({ ...all, canReassign: false }).map((item) => item.id)).toEqual(["cancel", "delete"]);
  });

  it("uses the supplied cancel label", () => {
    expect(recordMenuItems(all).find((item) => item.id === "cancel")?.label).toBe("Withdraw submission");
  });

  it("marks only delete as dangerous", () => {
    const items = recordMenuItems(all);
    expect(items.find((item) => item.id === "delete")?.danger).toBe(true);
    expect(items.find((item) => item.id === "reassign")?.danger).toBeFalsy();
    expect(items.find((item) => item.id === "cancel")?.danger).toBeFalsy();
  });

  it("is empty when nothing is allowed, so the menu trigger is hidden", () => {
    expect(recordMenuItems({ canReassign: false, canCancel: false, canDelete: false, cancelLabel: "" })).toEqual([]);
  });
});

describe("waitingOnForReturned", () => {
  const filed = { submitter: "Sazali Ahmad", submitterEmail: "sazali@example.com" };

  it("names the filer, who must fix and resend it", () => {
    expect(waitingOnForReturned(filed, "nurul@example.com")).toBe("Sazali Ahmad (to fix and resend)");
  });

  it("says You when this account filed it, ignoring case and spaces", () => {
    expect(waitingOnForReturned(filed, "  SAZALI@example.com ")).toBe("You (to fix and resend)");
  });
});

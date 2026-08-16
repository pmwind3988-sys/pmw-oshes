import { describe, it, expect } from "vitest";
import {
  emailListsMatch,
  isLayerActor,
  isLayerEmail,
  joinEmailList,
  parseEmailList,
  parseValidEmailList,
  resolveLayerRecipients,
  writeLayerRecipientFields,
} from "./layerRecipients";

describe("parseEmailList", () => {
  it("splits on commas, semicolons and newlines", () => {
    expect(parseEmailList("a@x.com, b@x.com; c@x.com\nd@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
    ]);
  });

  it("dedupes case-insensitively but keeps the authored casing", () => {
    expect(parseEmailList("Ana@x.com; ana@x.com")).toEqual(["Ana@x.com"]);
  });

  it("flattens arrays and drops blanks", () => {
    expect(parseEmailList(["a@x.com,", "", " b@x.com "])).toEqual(["a@x.com", "b@x.com"]);
  });

  it("returns an empty list for non-string, non-array input", () => {
    expect(parseEmailList(null)).toEqual([]);
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList(42)).toEqual([]);
  });

  it("keeps malformed entries so the builder can flag them", () => {
    expect(parseEmailList("a@x.com; not-an-email")).toEqual(["a@x.com", "not-an-email"]);
    expect(parseValidEmailList("a@x.com; not-an-email")).toEqual(["a@x.com"]);
  });
});

describe("isLayerEmail", () => {
  it("accepts an ordinary address and rejects the rest", () => {
    expect(isLayerEmail("a@x.com")).toBe(true);
    expect(isLayerEmail("  a@x.com  ")).toBe(true);
    expect(isLayerEmail("a@x")).toBe(false);
    expect(isLayerEmail("")).toBe(false);
    expect(isLayerEmail(null)).toBe(false);
  });
});

describe("isLayerActor", () => {
  it("matches any member of the layer's actor set, ignoring case", () => {
    expect(isLayerActor("B@x.com", "a@x.com; b@x.com")).toBe(true);
    expect(isLayerActor("c@x.com", "a@x.com; b@x.com")).toBe(false);
  });

  it("falls back to the legacy single address when the actor list is absent", () => {
    expect(isLayerActor("a@x.com", "", "a@x.com")).toBe(true);
    expect(isLayerActor("a@x.com", undefined, "b@x.com")).toBe(false);
  });

  it("never authorises an empty candidate", () => {
    expect(isLayerActor("", "a@x.com")).toBe(false);
    expect(isLayerActor("   ", "a@x.com")).toBe(false);
  });

  it("ignores the notification-only mailbox, which is not in the actor set", () => {
    // The shared mailbox receives the mail but must not be able to act.
    expect(isLayerActor("shared@x.com", "a@x.com", "a@x.com")).toBe(false);
  });
});

describe("resolveLayerRecipients", () => {
  it("defaults to the actors alone", () => {
    expect(resolveLayerRecipients(["a@x.com", "b@x.com"], undefined)).toEqual(["a@x.com", "b@x.com"]);
  });

  it("appends notification mailboxes in 'both' mode", () => {
    expect(resolveLayerRecipients(["a@x.com"], {
      notifyEmails: ["shared@x.com"],
      notifyRecipientMode: "both",
    })).toEqual(["a@x.com", "shared@x.com"]);
  });

  it("routes only to the mailbox in 'notify-only' mode", () => {
    expect(resolveLayerRecipients(["a@x.com"], {
      notifyEmails: ["shared@x.com"],
      notifyRecipientMode: "notify-only",
    })).toEqual(["shared@x.com"]);
  });

  it("keeps mailing the actors when 'notify-only' has no mailbox to route to", () => {
    expect(resolveLayerRecipients(["a@x.com"], {
      notifyEmails: [],
      notifyRecipientMode: "notify-only",
    })).toEqual(["a@x.com"]);
  });

  it("does not list an address twice when it is both actor and notify target", () => {
    expect(resolveLayerRecipients(["a@x.com"], { notifyEmails: ["A@x.com"] })).toEqual(["a@x.com"]);
  });
});

describe("writeLayerRecipientFields", () => {
  it("writes the primary, the actor set and the delivery list", () => {
    const target: Record<string, unknown> = {};
    const recipients = writeLayerRecipientFields(
      target,
      { layerNumber: 2, notifyEmails: ["shared@x.com"] },
      ["a@x.com", "b@x.com"],
    );

    expect(target.L2_Email).toBe("a@x.com");
    expect(target.L2_Emails).toBe("a@x.com; b@x.com");
    expect(target.L2_NotifyEmails).toBe("a@x.com; b@x.com; shared@x.com");
    expect(recipients).toEqual(["a@x.com", "b@x.com", "shared@x.com"]);
  });

  it("keeps the assignee out of the delivery list in notify-only mode", () => {
    const target: Record<string, unknown> = {};
    writeLayerRecipientFields(
      target,
      { layerNumber: 1, notifyEmails: ["shared@x.com"], notifyRecipientMode: "notify-only" },
      ["a@x.com"],
    );

    // The evaluator still owns the decision — L1_Email/L1_Emails are unchanged.
    expect(target.L1_Email).toBe("a@x.com");
    expect(target.L1_Emails).toBe("a@x.com");
    expect(target.L1_NotifyEmails).toBe("shared@x.com");
  });

  it("falls back to the raw resolved value when no address parses", () => {
    const target: Record<string, unknown> = {};
    writeLayerRecipientFields(target, { layerNumber: 1 }, [], "pending-lookup");

    expect(target.L1_Email).toBe("pending-lookup");
    expect(target.L1_Emails).toBe("");
    expect(target.L1_NotifyEmails).toBe("");
  });

  it("clears a previous actor set when a layer is reassigned to one person", () => {
    const target: Record<string, unknown> = {
      L1_Emails: "a@x.com; b@x.com; c@x.com",
    };
    writeLayerRecipientFields(target, { layerNumber: 1 }, ["new@x.com"], "new@x.com");

    expect(target.L1_Emails).toBe("new@x.com");
    expect(isLayerActor("b@x.com", target.L1_Emails)).toBe(false);
  });
});

describe("joinEmailList / emailListsMatch", () => {
  it("round-trips through the stored form", () => {
    const emails = ["a@x.com", "b@x.com"];
    expect(parseEmailList(joinEmailList(emails))).toEqual(emails);
  });

  it("compares sets regardless of order, casing or separator", () => {
    expect(emailListsMatch("a@x.com; b@x.com", "B@x.com,a@x.com")).toBe(true);
    expect(emailListsMatch("a@x.com", "a@x.com; b@x.com")).toBe(false);
  });
});

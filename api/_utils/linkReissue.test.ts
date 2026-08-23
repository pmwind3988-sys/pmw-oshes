import { describe, expect, it } from "vitest";

import { planLinkReissue } from "./linkReissue.js";
import { LINK_REISSUE_LOG_FIELD, recordReissue } from "./linkToken.js";

/**
 * A link issued before review links were bound to their submission carries no
 * `k` and cannot be given one. Clicking one mails a fresh link to the address
 * the layer was sent to — never to whoever clicked, and never revealing whether
 * the id they arrived with was real.
 */
const NOW = new Date("2026-09-01T12:00:00Z");

const activated = {
  L2_NotifyEmails: "reviewer@contractor.example; safety@contractor.example",
  L2_Email: "reviewer@contractor.example",
};

describe("planLinkReissue", () => {
  it("mails the address the layer was actually sent to", () => {
    const plan = planLinkReissue(activated, 2, NOW);
    expect(plan?.recipients).toEqual([
      "reviewer@contractor.example",
      "safety@contractor.example",
    ]);
  });

  it("mints a binding for a submission that predates them", () => {
    const plan = planLinkReissue(activated, 2, NOW);
    expect(plan?.linkToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(plan?.updates.L2_LinkToken).toBe(plan?.linkToken);
  });

  it("keeps a binding the submission already has", () => {
    // Rotating it would kill the link a reviewer is already holding.
    const plan = planLinkReissue({ ...activated, L2_LinkToken: "tok-existing" }, 2, NOW);
    expect(plan?.linkToken).toBe("tok-existing");
    expect(plan?.updates.L2_LinkToken).toBeUndefined();
  });

  it("does nothing for a layer this submission never reached", () => {
    // No recipients were ever written against it, so the link was never real
    // for this record — which is how a counted-up id is turned away.
    expect(planLinkReissue({ L2_NotifyEmails: "" }, 2, NOW)).toBeNull();
    expect(planLinkReissue({}, 2, NOW)).toBeNull();
    expect(planLinkReissue(undefined, 2, NOW)).toBeNull();
  });

  it("falls back through the recipient columns", () => {
    expect(planLinkReissue({ L2_Emails: "a@b.example" }, 2, NOW)?.recipients).toEqual(["a@b.example"]);
    expect(planLinkReissue({ L2_Email: "c@d.example" }, 2, NOW)?.recipients).toEqual(["c@d.example"]);
  });

  it("refuses a second replacement inside the cooldown", () => {
    // Otherwise an old link is a button for mailing a reviewer repeatedly.
    const fields = {
      ...activated,
      [LINK_REISSUE_LOG_FIELD]: recordReissue("", 2, new Date("2026-09-01T11:58:00Z")),
    };
    expect(planLinkReissue(fields, 2, NOW)).toBeNull();
  });

  it("allows one again once the cooldown has passed", () => {
    const fields = {
      ...activated,
      [LINK_REISSUE_LOG_FIELD]: recordReissue("", 2, new Date("2026-09-01T11:40:00Z")),
    };
    expect(planLinkReissue(fields, 2, NOW)).not.toBeNull();
  });

  it("records the send so the next click is throttled", () => {
    const plan = planLinkReissue(activated, 2, NOW);
    const log = JSON.parse(String(plan?.updates[LINK_REISSUE_LOG_FIELD])) as Record<string, string>;
    expect(log["2"]).toBe(NOW.toISOString());
  });
});

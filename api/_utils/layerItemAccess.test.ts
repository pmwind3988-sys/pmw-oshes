import { describe, expect, it } from "vitest";

import { denyLayerItemAccess, isTerminalFormStatus, isTerminalLayerStatus } from "./layerItemAccess.js";

/**
 * A public approval link names a *layer*; the submission id rides in the query
 * string. Nothing used to tie the two together, so anyone holding one link
 * could walk the id and read every other submission to the same form. The link
 * now also carries the value stored on that one record as `L{n}_LinkToken`.
 */
const PENDING = {
  layerNumber: 2,
  currentLayer: 2,
  layerStatus: "Pending",
  formStatus: "Submitted",
} as const;

describe("denyLayerItemAccess — layer state", () => {
  it("allows the submission the layer is currently waiting on", () => {
    expect(denyLayerItemAccess({ ...PENDING })).toBeNull();
  });

  it("refuses a submission parked at another layer", () => {
    expect(denyLayerItemAccess({ ...PENDING, currentLayer: 3 })).toBe("not-current-layer");
  });

  it("reads the current layer from a SharePoint text column", () => {
    expect(denyLayerItemAccess({ ...PENDING, currentLayer: "2" })).toBeNull();
    expect(denyLayerItemAccess({ ...PENDING, currentLayer: "7" })).toBe("not-current-layer");
  });

  it("refuses a layer that has already been actioned", () => {
    expect(denyLayerItemAccess({ ...PENDING, layerStatus: "Approved" })).toBe("already-completed");
  });

  it("refuses a submission whose form is closed", () => {
    expect(denyLayerItemAccess({ ...PENDING, formStatus: "Fully Approved" })).toBe("already-completed");
  });

  it("allows a legacy row that carries no current-layer marker", () => {
    expect(
      denyLayerItemAccess({ layerNumber: 1, currentLayer: 0, layerStatus: "", formStatus: "" }),
    ).toBeNull();
    expect(
      denyLayerItemAccess({ layerNumber: 1, currentLayer: undefined, layerStatus: "", formStatus: "" }),
    ).toBeNull();
  });

  it("applies the stricter act rules when no intent is named", () => {
    // A caller that forgets to say what it is doing must not be given the
    // looser of the two answers.
    expect(denyLayerItemAccess({ ...PENDING, layerStatus: "Approved" })).toBe("already-completed");
  });
});

describe("denyLayerItemAccess — link binding", () => {
  it("opens the submission its own token was minted for", () => {
    expect(
      denyLayerItemAccess({ ...PENDING, linkToken: "tok-418", storedLinkToken: "tok-418" }),
    ).toBeNull();
  });

  it("refuses a neighbour reached by editing the id", () => {
    // Same link, id counted up: record 419 holds its own token, not this one.
    expect(
      denyLayerItemAccess({ ...PENDING, linkToken: "tok-418", storedLinkToken: "tok-419" }),
    ).toBe("link-mismatch");
  });

  it("refuses a token offered for a record that holds none", () => {
    expect(
      denyLayerItemAccess({ ...PENDING, linkToken: "tok-418", storedLinkToken: "" }),
    ).toBe("link-mismatch");
  });

  it("refuses a bound record reached by a link carrying no token", () => {
    expect(
      denyLayerItemAccess({ ...PENDING, linkToken: "", storedLinkToken: "tok-418" }),
    ).toBe("link-mismatch");
  });

  it("refuses a token of the right length but the wrong value", () => {
    expect(
      denyLayerItemAccess({ ...PENDING, linkToken: "aaaaaaaa", storedLinkToken: "aaaaaaab" }),
    ).toBe("link-mismatch");
  });

  it("checks the binding before anything that would reveal the record's state", () => {
    // A wrong token must not be told whether the record it named is finished.
    expect(
      denyLayerItemAccess({
        ...PENDING,
        layerStatus: "Approved",
        formStatus: "Fully Approved",
        linkToken: "tok-418",
        storedLinkToken: "tok-419",
      }),
    ).toBe("link-mismatch");
  });
});

describe("denyLayerItemAccess — revisiting a finished review", () => {
  const bound = { linkToken: "tok-418", storedLinkToken: "tok-418" };

  it("lets a reviewer see the decision they already recorded", () => {
    expect(
      denyLayerItemAccess({ ...PENDING, ...bound, intent: "read", layerStatus: "Approved" }),
    ).toBeNull();
  });

  it("lets a reviewer see a record that has moved on without them", () => {
    expect(
      denyLayerItemAccess({ ...PENDING, ...bound, intent: "read", currentLayer: 5 }),
    ).toBeNull();
  });

  it("still refuses a second decision on the same layer", () => {
    expect(
      denyLayerItemAccess({ ...PENDING, ...bound, intent: "act", layerStatus: "Approved" }),
    ).toBe("already-completed");
  });

  it("does not let reading stand in for a valid link", () => {
    expect(
      denyLayerItemAccess({ ...PENDING, intent: "read", linkToken: "tok-418", storedLinkToken: "tok-419" }),
    ).toBe("link-mismatch");
  });
});

describe("denyLayerItemAccess — expiry", () => {
  const bound = { linkToken: "tok-418", storedLinkToken: "tok-418" };
  const fieldExpiry = { tokenExpiry: { mode: "field", field: "permitEnd", offsetDays: 0 } };

  it("refuses a link once the submission's own date has passed", () => {
    expect(
      denyLayerItemAccess({
        ...PENDING,
        ...bound,
        layer: fieldExpiry,
        fields: { permitEnd: "2026-09-01" },
        now: new Date("2026-09-02T00:00:00Z"),
      }),
    ).toBe("expired");
  });

  it("allows it up to the close of that day in Kuala Lumpur", () => {
    expect(
      denyLayerItemAccess({
        ...PENDING,
        ...bound,
        layer: fieldExpiry,
        fields: { permitEnd: "2026-09-01" },
        now: new Date("2026-09-01T15:59:00Z"),
      }),
    ).toBeNull();
  });

  it("keeps an unreadable date open rather than closing the link", () => {
    expect(
      denyLayerItemAccess({
        ...PENDING,
        ...bound,
        layer: fieldExpiry,
        fields: { permitEnd: "" },
        now: new Date("2099-01-01T00:00:00Z"),
      }),
    ).toBeNull();
  });

  it("expires a read as well as an act", () => {
    expect(
      denyLayerItemAccess({
        ...PENDING,
        ...bound,
        intent: "read",
        layer: fieldExpiry,
        fields: { permitEnd: "2026-09-01" },
        now: new Date("2026-09-02T00:00:00Z"),
      }),
    ).toBe("expired");
  });

  it("checks the binding before the expiry", () => {
    expect(
      denyLayerItemAccess({
        ...PENDING,
        linkToken: "tok-418",
        storedLinkToken: "tok-419",
        layer: fieldExpiry,
        fields: { permitEnd: "2026-09-01" },
        now: new Date("2026-09-02T00:00:00Z"),
      }),
    ).toBe("link-mismatch");
  });

  it("still honours a layer's fixed date", () => {
    expect(
      denyLayerItemAccess({
        ...PENDING,
        ...bound,
        layer: { tokenExpiresAt: "2026-09-01T00:00:00Z" },
        now: new Date("2026-09-02T00:00:00Z"),
      }),
    ).toBe("expired");
  });
});

describe("terminal status predicates", () => {
  it("treats the recorded layer outcomes as terminal, however they are spaced", () => {
    expect(isTerminalLayerStatus("Approved")).toBe(true);
    expect(isTerminalLayerStatus("  con-firmed ")).toBe(true);
    expect(isTerminalLayerStatus("Rejected at Layer 2")).toBe(true);
    expect(isTerminalLayerStatus("Pending")).toBe(false);
    expect(isTerminalLayerStatus("")).toBe(false);
  });

  it("treats the closed form states as terminal", () => {
    expect(isTerminalFormStatus("Fully Approved")).toBe(true);
    expect(isTerminalFormStatus("Cancelled")).toBe(true);
    expect(isTerminalFormStatus("Submitted")).toBe(false);
    expect(isTerminalFormStatus("")).toBe(false);
  });
});

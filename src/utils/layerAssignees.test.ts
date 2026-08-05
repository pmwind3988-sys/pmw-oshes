import { describe, it, expect } from "vitest";
import type { LayerAssignee, LayerConfigItem } from "../types";
import {
  canActOnLayer,
  claimLayerEmail,
  fixedAssigneeEmails,
  isFixedAssignee,
  isSharedAssigneeLayer,
  layerRecipients,
  parseAssigneeEmails,
  primaryFixedAssigneeEmail,
  routedAssigneeEmail,
  validFixedAssigneeEmails,
} from "./layerAssignees";

const SHARED = "PMWOSHESWEB@pmw-group.com; ashraf@pmw-group.com";

function layer(value: string, type: "user" | "users" = "users"): LayerConfigItem {
  return {
    layerNumber: 1,
    type: "approval",
    authMode: "365",
    assignee: { type, value },
    confirmationType: "signature",
    allowRejectionReason: true,
  } as LayerConfigItem;
}

describe("layerAssignees", () => {
  it("treats both fixed assignee shapes as named mailboxes", () => {
    expect(isFixedAssignee({ type: "user", value: "a@x.com" })).toBe(true);
    expect(isFixedAssignee({ type: "users", value: "a@x.com; b@x.com" })).toBe(true);
    expect(isFixedAssignee({ type: "field-reference", value: "requesterEmail" })).toBe(false);
    expect(isFixedAssignee({ type: "department-approver", value: "department" })).toBe(false);
  });

  // Config is authored outside this app. "users" was the spelling that broke;
  // another variant must not break the same way.
  it("reads an unrecognised assignee type as a roster when it spells out addresses", () => {
    const variant = { type: "approvers", value: "a@x.com; b@x.com" } as unknown as LayerAssignee;
    expect(isFixedAssignee(variant)).toBe(true);
    expect(validFixedAssigneeEmails(variant)).toEqual(["a@x.com", "b@x.com"]);
    expect(isSharedAssigneeLayer(variant)).toBe(true);
  });

  it("never mistakes a data-resolved assignee for a roster", () => {
    // Even if a question were somehow named like an address, the declared type wins.
    expect(isFixedAssignee({ type: "field-reference", value: "a@x.com" })).toBe(false);
    expect(fixedAssigneeEmails({ type: "field-reference", value: "a@x.com" })).toEqual([]);
    expect(isFixedAssignee({ type: "department-approver", value: "a@x.com" })).toBe(false);
    // An unknown type whose value is a question name stays data-resolved.
    const unknownField = { type: "role", value: "requesterEmail" } as unknown as LayerAssignee;
    expect(isFixedAssignee(unknownField)).toBe(false);
  });

  it("splits a multi-assignee value on the separators pickers and hand-edits produce", () => {
    expect(parseAssigneeEmails("a@x.com; b@x.com")).toEqual(["a@x.com", "b@x.com"]);
    expect(parseAssigneeEmails("a@x.com,b@x.com")).toEqual(["a@x.com", "b@x.com"]);
    expect(parseAssigneeEmails("a@x.com\nb@x.com")).toEqual(["a@x.com", "b@x.com"]);
    expect(parseAssigneeEmails("  a@x.com ;; ")).toEqual(["a@x.com"]);
    expect(parseAssigneeEmails("")).toEqual([]);
  });

  it("lists every mailbox a layer names, and none for data-resolved assignees", () => {
    expect(fixedAssigneeEmails({ type: "users", value: "a@x.com; b@x.com" })).toEqual(["a@x.com", "b@x.com"]);
    expect(fixedAssigneeEmails({ type: "user", value: "a@x.com" })).toEqual(["a@x.com"]);
    expect(fixedAssigneeEmails({ type: "field-reference", value: "requesterEmail" })).toEqual([]);
  });

  // The PERMIT TO WORK regression: a "users" layer resolved to "" and threw
  // "needs a valid assignee email" before anything was written, so every
  // submission of that form failed.
  it("routes a multi-assignee layer to its first mailbox", () => {
    expect(primaryFixedAssigneeEmail({ type: "users", value: "PMWOSHESWEB@pmw-group.com; ashraf@pmw-group.com" }))
      .toBe("PMWOSHESWEB@pmw-group.com");
    expect(primaryFixedAssigneeEmail({ type: "user", value: " a@x.com " })).toBe("a@x.com");
    expect(primaryFixedAssigneeEmail({ type: "field-reference", value: "requesterEmail" })).toBe("");
  });
});

describe("shared layers stay unassigned until someone completes them", () => {
  it("counts a layer as shared only when it names two or more reachable mailboxes", () => {
    expect(isSharedAssigneeLayer({ type: "users", value: SHARED })).toBe(true);
    expect(isSharedAssigneeLayer({ type: "users", value: "solo@x.com" })).toBe(false);
    // A typo is not a second approver.
    expect(isSharedAssigneeLayer({ type: "users", value: "solo@x.com; not-an-email" })).toBe(false);
    expect(isSharedAssigneeLayer({ type: "user", value: "solo@x.com" })).toBe(false);
  });

  it("routes a shared layer to nobody and a single-name layer to its one person", () => {
    expect(routedAssigneeEmail({ type: "users", value: SHARED })).toBe("");
    expect(routedAssigneeEmail({ type: "users", value: "solo@x.com" })).toBe("solo@x.com");
    expect(routedAssigneeEmail({ type: "user", value: "solo@x.com" })).toBe("solo@x.com");
  });

  it("lets any named person act while the layer is unclaimed", () => {
    const shared = layer(SHARED);
    expect(canActOnLayer(shared, "", "ashraf@pmw-group.com")).toBe(true);
    expect(canActOnLayer(shared, "", "PMWOSHESWEB@pmw-group.com")).toBe(true);
    expect(canActOnLayer(shared, "", "ASHRAF@PMW-GROUP.COM")).toBe(true);
    expect(canActOnLayer(shared, "", "someone.else@pmw-group.com")).toBe(false);
    expect(canActOnLayer(shared, "", "")).toBe(false);
  });

  it("hands the layer to whoever claimed it, and locks the others out afterwards", () => {
    const shared = layer(SHARED);
    expect(canActOnLayer(shared, "ashraf@pmw-group.com", "ashraf@pmw-group.com")).toBe(true);
    expect(canActOnLayer(shared, "ashraf@pmw-group.com", "PMWOSHESWEB@pmw-group.com")).toBe(false);
  });

  it("keeps a stored address authoritative, so reassignment still wins", () => {
    const shared = layer(SHARED);
    // An admin moved this layer to someone not on the roster.
    expect(canActOnLayer(shared, "standin@pmw-group.com", "standin@pmw-group.com")).toBe(true);
    expect(canActOnLayer(shared, "standin@pmw-group.com", "ashraf@pmw-group.com")).toBe(false);
  });

  it("stamps the actor only on an unclaimed shared layer", () => {
    const shared = layer(SHARED);
    expect(claimLayerEmail(shared, "", "ashraf@pmw-group.com")).toBe("ashraf@pmw-group.com");
    // Already claimed or reassigned — leave the column alone.
    expect(claimLayerEmail(shared, "someone@pmw-group.com", "ashraf@pmw-group.com")).toBeUndefined();
    // A single-name layer already holds the right address.
    expect(claimLayerEmail(layer("solo@x.com", "user"), "", "solo@x.com")).toBeUndefined();
    expect(claimLayerEmail(undefined, "", "ashraf@pmw-group.com")).toBeUndefined();
  });

  it("notifies the holder when there is one, and the whole roster when there is not", () => {
    const shared = layer(SHARED);
    expect(layerRecipients(shared, "")).toEqual(["PMWOSHESWEB@pmw-group.com", "ashraf@pmw-group.com"]);
    expect(layerRecipients(shared, "ashraf@pmw-group.com")).toEqual(["ashraf@pmw-group.com"]);
    expect(layerRecipients(layer("solo@x.com", "user"), "")).toEqual(["solo@x.com"]);
    expect(layerRecipients(undefined, "")).toEqual([]);
  });
});

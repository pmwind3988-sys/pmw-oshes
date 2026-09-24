import { describe, expect, it } from "vitest";
import { canRemovePerson } from "./SmokingPeopleTab";

describe("canRemovePerson", () => {
  it("allows removing an active person", () => {
    expect(canRemovePerson({ blocked: false })).toBe(true);
  });
  it("refuses to remove a blocked person — unblock first, or removal would let them register again unblocked", () => {
    expect(canRemovePerson({ blocked: true })).toBe(false);
  });
});

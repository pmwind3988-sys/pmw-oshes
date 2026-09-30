import { describe, expect, it } from "vitest";

import { __test__ } from "./referenceCounter.js";

/**
 * Test runs count on a row of their own and print a reference nobody can
 * mistake for a live one, so a rehearsal never burns a number out of the
 * sequence people quote as a record's ID.
 */
describe("the TEST- reference series", () => {
  it("keeps a form's test counter apart from its live one", () => {
    expect(__test__.counterTitleKey("HIRA Assessment")).toBe("hira assessment");
    expect(__test__.counterTitleKey("HIRA Assessment", true)).toBe("hira assessment::test");
  });

  it("marks a test reference unmistakably, once", () => {
    expect(__test__.testReference("HIRA-010926-0001")).toBe("TEST-HIRA-010926-0001");
    expect(__test__.testReference("TEST-HIRA-010926-0001")).toBe("TEST-HIRA-010926-0001");
  });
});

import { describe, it, expect } from "vitest";
import { layerNumberFromValue, layerSequenceFromConfig } from "./layerSequence";

const CONFIG = {
  version: "1.0",
  layers: [
    { layerNumber: 2, type: "evaluation", title: "Three-month review" },
    { layerNumber: 1, type: "approval", title: "HOD Review" },
  ],
};

const BRANCHED = {
  version: "1.0",
  layers: [],
  manualBranches: [
    { name: "site", label: "Site incident", layers: [{ layerNumber: 1, title: "Site Safety Officer" }] },
    { name: "office", label: "Office incident", layers: [{ layerNumber: 1, title: "Office Manager" }, { layerNumber: 2, title: "HR" }] },
  ],
};

describe("layerSequenceFromConfig", () => {
  it("reads the chain in layer order, not the order it was authored in", () => {
    expect(layerSequenceFromConfig(CONFIG, "").map((layer) => layer.title)).toEqual(["HOD Review", "Three-month review"]);
  });

  it("reads the config whether it arrives parsed or as the stored JSON string", () => {
    expect(layerSequenceFromConfig(JSON.stringify(CONFIG), "")).toEqual(layerSequenceFromConfig(CONFIG, ""));
  });

  it("takes the branch the submitter chose, by name or by label", () => {
    expect(layerSequenceFromConfig(BRANCHED, "site").map((layer) => layer.title)).toEqual(["Site Safety Officer"]);
    expect(layerSequenceFromConfig(BRANCHED, "Office incident").map((layer) => layer.title)).toEqual(["Office Manager", "HR"]);
  });

  it("merges every branch's layers when no branch was recorded", () => {
    // A record whose branch is missing still has a history. The layers are only
    // read here — never acted on — so naming them all beats naming none.
    expect(layerSequenceFromConfig(BRANCHED, "").map((layer) => layer.title)).toEqual(["Site Safety Officer", "HR"]);
  });

  it("has nothing to say about a form with no configuration", () => {
    expect(layerSequenceFromConfig(null, "")).toEqual([]);
    expect(layerSequenceFromConfig("not json", "")).toEqual([]);
    expect(layerSequenceFromConfig({}, "")).toEqual([]);
  });
});

describe("layerNumberFromValue", () => {
  it("reads a layer number however it was stored", () => {
    expect(layerNumberFromValue(2)).toBe(2);
    expect(layerNumberFromValue("2")).toBe(2);
    expect(layerNumberFromValue("")).toBeNull();
    expect(layerNumberFromValue("second")).toBeNull();
    expect(layerNumberFromValue(undefined)).toBeNull();
  });
});

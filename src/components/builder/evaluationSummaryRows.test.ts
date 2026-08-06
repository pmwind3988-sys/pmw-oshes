import { describe, expect, it } from "vitest";
import { collectDisplayRows, collectFieldDefinitions } from "./evaluationSummaryRows";

const rowsFor = (elements: Record<string, unknown>[], fields: Record<string, unknown>) =>
  collectDisplayRows(fields, collectFieldDefinitions(elements));

describe("collectFieldDefinitions", () => {
  it("keeps declaration order and skips containers and decoration", () => {
    const definitions = collectFieldDefinitions([
      { type: "html", name: "banner", html: "<p>hi</p>" },
      { type: "panel", name: "ptwPanel", elements: [
        { type: "text", name: "from", title: "PTW Valid From" },
        { type: "text", name: "till", title: "PTW Valid Till" },
      ] },
      { type: "comment", name: "remarks", title: "Remarks or Comments" },
    ]);

    expect(definitions.map((definition) => definition.name)).toEqual(["from", "till", "remarks"]);
  });

  it("keeps two questions that share a field name but ask different things", () => {
    const definitions = collectFieldDefinitions([
      { type: "text", name: "ptwValid", title: "PTW Valid From" },
      { type: "text", name: "ptwValid", title: "PTW Valid Till" },
    ]);

    expect(definitions.map((definition) => definition.title)).toEqual(["PTW Valid From", "PTW Valid Till"]);
  });

  it("folds away an element repeated verbatim", () => {
    const definitions = collectFieldDefinitions([
      { type: "text", name: "ptwValid", title: "PTW Valid From" },
      { type: "text", name: "ptwValid", title: "PTW Valid From" },
    ]);

    expect(definitions).toHaveLength(1);
  });
});

describe("collectDisplayRows", () => {
  const elements = [
    { type: "text", name: "from", title: "PTW Valid From", inputType: "datetime-local" },
    { type: "text", name: "till", title: "PTW Valid Till", inputType: "datetime-local" },
    { type: "signaturepad", name: "sig", title: "Issued By OSHES (Signature)" },
  ];

  it("lists every declared field, including the ones left blank", () => {
    const rows = rowsFor(elements, { till: "2026-08-12T23:31" });

    expect(rows.map((row) => row.field.title)).toEqual([
      "PTW Valid From",
      "PTW Valid Till",
      "Issued By OSHES (Signature)",
    ]);
    expect(rows[0].value).toBeUndefined();
    expect(rows[1].value).toBe("2026-08-12T23:31");
  });

  it("appends stored answers the current config no longer declares", () => {
    const rows = rowsFor(elements, { till: "2026-08-12T23:31", legacyNote: "kept" });

    expect(rows.map((row) => row.field.name)).toEqual(["from", "till", "sig", "legacyNote"]);
    expect(rows[3].field.title).toBe("Legacy Note");
  });

  it("ignores an undeclared stored answer that is empty", () => {
    const rows = rowsFor(elements, { legacyNote: "   " });

    expect(rows.map((row) => row.field.name)).toEqual(["from", "till", "sig"]);
  });

  it("flags questions that share a field name, since one answer serves both", () => {
    const rows = rowsFor(
      [
        { type: "text", name: "ptwValid", title: "PTW Valid From" },
        { type: "text", name: "ptwValid", title: "PTW Valid Till" },
      ],
      { ptwValid: "2026-08-12T23:31" },
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].sharedNameWith).toBe("PTW Valid Till");
    expect(rows[1].sharedNameWith).toBe("PTW Valid From");
  });

  it("leaves ordinary fields unflagged", () => {
    const rows = rowsFor(elements, { from: "2026-08-05T09:00", till: "2026-08-12T23:31" });

    expect(rows.every((row) => row.sharedNameWith === undefined)).toBe(true);
  });
});

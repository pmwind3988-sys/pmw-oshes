import { describe, expect, it } from "vitest";

import {
  applyPrefilledQrToSurveyJson,
  cloneAndApplyPrefilledQr,
  decodePrefilledQrPayload,
  encodePrefilledQrPayload,
  getPrefillEligibleFields,
  type PrefilledQrPayload,
} from "../prefilledQr";
import { flattenQuestions } from "../FormBuilderEngine";
import type { SurveyJson } from "../../types";

function makeSurveyJson(): SurveyJson {
  return {
    title: "Training Requisition",
    pages: [
      {
        name: "page1",
        elements: [
          { type: "text", name: "employeeName", title: "Employee Name" },
          { type: "dropdown", name: "department", title: "Department", choices: ["HR", "IT"] },
          { type: "file", name: "attachment", title: "Attachment" },
          { type: "expression", name: "total", title: "Total", expression: "{qty} * {price}" },
          {
            type: "panel",
            name: "details",
            elements: [
              { type: "text", inputType: "number", name: "qty", title: "Quantity" },
            ],
          },
        ],
      },
    ],
  };
}

describe("prefilled QR payloads", () => {
  it("round-trips compact payloads", () => {
    const payload: PrefilledQrPayload = {
      v: 1,
      values: { employeeName: "Aina", department: "HR", qty: 2 },
      locked: ["employeeName", "qty"],
    };

    expect(decodePrefilledQrPayload(encodePrefilledQrPayload(payload))).toEqual(payload);
  });

  it("applies default values and QR-only locks to matching questions", () => {
    const json = makeSurveyJson() as unknown as Record<string, unknown>;

    applyPrefilledQrToSurveyJson(json, {
      v: 1,
      values: { employeeName: "Aina", department: "HR", qty: 2, missing: "ignored" },
      locked: ["employeeName", "qty"],
    });

    const fields = flattenQuestions(json as unknown as SurveyJson);
    expect(fields.find(field => field.name === "employeeName")).toMatchObject({
      defaultValue: "Aina",
      readOnly: true,
      enableIf: "false",
    });
    expect(fields.find(field => field.name === "department")).toMatchObject({
      defaultValue: "HR",
    });
    expect(fields.find(field => field.name === "department")?.readOnly).toBeUndefined();
    expect(fields.find(field => field.name === "qty")).toMatchObject({
      defaultValue: 2,
      readOnly: true,
    });
  });

  it("clones before applying QR values so public no-token rendering still gets prefilled without mutating source config", () => {
    const json = makeSurveyJson() as unknown as Record<string, unknown>;
    const patched = cloneAndApplyPrefilledQr(
      { ...json, fontFamily: "Inter" },
      {
        v: 1,
        values: { employeeName: "Aina", department: "HR" },
        locked: ["employeeName"],
      },
    );

    const originalFields = flattenQuestions(json as unknown as SurveyJson);
    const patchedFields = flattenQuestions(patched as unknown as SurveyJson);

    expect(originalFields.find(field => field.name === "employeeName")?.defaultValue).toBeUndefined();
    expect(patchedFields.find(field => field.name === "employeeName")).toMatchObject({
      defaultValue: "Aina",
      readOnly: true,
      enableIf: "false",
    });
    expect(patchedFields.find(field => field.name === "department")).toMatchObject({
      defaultValue: "HR",
    });
  });

  it("ignores fields that should not be manually prefilled from the builder UI", () => {
    const names = getPrefillEligibleFields(makeSurveyJson(), flattenQuestions).map(field => field.name);

    expect(names).toEqual(["employeeName", "department", "qty"]);
  });

  it("returns null for malformed or empty payloads", () => {
    expect(decodePrefilledQrPayload("not-base64")).toBeNull();
    expect(decodePrefilledQrPayload(encodePrefilledQrPayload({ v: 1, values: {}, locked: [] }))).toBeNull();
  });
});

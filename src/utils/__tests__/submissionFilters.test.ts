import { describe, expect, it } from "vitest";
import type { Submission, SurveyJson } from "../../types";
import {
  EMPTY_SUBMISSION_FILTERS,
  applyFormTypeChange,
  applyFormVersionChange,
  applyPublishProfileChange,
  collectFieldCatalog,
  collectFormTypes,
  collectFormVersions,
  collectPublishProfiles,
  countActiveFilters,
  createFieldFilter,
  describeFieldFilter,
  fieldFilterMatches,
  recordMatchesFilters,
  sortSubmissions,
  submissionMatchesFilters,
  type FieldFilter,
} from "../submissionFilters";
import { fieldsFromResponses, fieldsFromSurveyJson, type FilterFieldKind } from "../formFieldCatalog";

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "1",
    submissionId: "1",
    listTitle: "Training Feedback",
    formId: "FRM-001",
    formVersion: "1.0",
    title: "Item 1",
    submittedByEmail: "ahmad@example.com",
    submittedAt: "2026-07-10T09:00:00.000Z",
    formStatus: "Submitted",
    totalLayers: 2,
    layers: [],
    meta: { icon: "", color: "", pale: "", category: "HR" },
    submissionData: {},
    ...overrides,
  };
}

/** A condition on `key`, with only the parts the operator needs filled in. */
function condition(
  key: string,
  kind: FilterFieldKind,
  overrides: Partial<FieldFilter> = {},
): FieldFilter {
  return {
    ...createFieldFilter({ key, label: key, section: "Page 1", kind }),
    ...overrides,
  };
}

describe("submissionMatchesFilters", () => {
  it("matches everything when no filters are set", () => {
    expect(submissionMatchesFilters(makeSubmission(), EMPTY_SUBMISSION_FILTERS)).toBe(true);
  });

  it("searches title, form id and submission id", () => {
    const item = makeSubmission({ title: "Safety Briefing" });
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, search: "safety" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, search: "FRM-001" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, search: "nope" })).toBe(false);
  });

  it("searches the reference number", () => {
    const item = makeSubmission({ referenceNo: "OSH-040826-0007" });
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, search: "040826-0007" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, search: "osh-040826-0007" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, search: "040826-0008" })).toBe(false);
  });

  it("ignores separators when matching a reference number", () => {
    const item = makeSubmission({ referenceNo: "OSH-040826-0007" });
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, search: "OSH0408260007" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, search: "osh 040826 0007" })).toBe(true);
  });

  it("does not match a reference search against a submission that has none", () => {
    expect(submissionMatchesFilters(makeSubmission(), { ...EMPTY_SUBMISSION_FILTERS, search: "040826-0007" })).toBe(false);
  });

  it("filters by form type exactly", () => {
    const item = makeSubmission();
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, formType: "Training Feedback" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, formType: "Other Form" })).toBe(false);
  });

  it("filters by form version exactly", () => {
    const item = makeSubmission({ formVersion: "2.0" });
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, formVersion: "2.0" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, formVersion: "1.0" })).toBe(false);
  });

  it("ANDs the levels of the hierarchy together", () => {
    const item = makeSubmission({ formVersion: "2.0", publishKey: "c-suite" });
    const scoped = {
      ...EMPTY_SUBMISSION_FILTERS,
      formType: "Training Feedback",
      publishProfile: "c-suite",
      formVersion: "2.0",
    };
    expect(submissionMatchesFilters(item, scoped)).toBe(true);
    expect(submissionMatchesFilters(item, { ...scoped, formVersion: "1.0" })).toBe(false);
    expect(submissionMatchesFilters(item, { ...scoped, publishProfile: "production" })).toBe(false);
  });

  it("filters by lifecycle stage", () => {
    const pending = makeSubmission({ formStatus: "Submitted" });
    const done = makeSubmission({ formStatus: "Completed" });
    expect(submissionMatchesFilters(pending, { ...EMPTY_SUBMISSION_FILTERS, stage: "pending" })).toBe(true);
    expect(submissionMatchesFilters(pending, { ...EMPTY_SUBMISSION_FILTERS, stage: "completed" })).toBe(false);
    expect(submissionMatchesFilters(done, { ...EMPTY_SUBMISSION_FILTERS, stage: "completed" })).toBe(true);
  });

  it("matches submitter across email and display names", () => {
    const item = makeSubmission({ submitterName: "Ahmad Zahari" });
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, submitter: "zahari" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, submitter: "ahmad@" })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, submitter: "siti" })).toBe(false);
  });

  it("treats the date range as inclusive of both whole days", () => {
    // Built from local time so the assertion holds in any timezone the suite runs in.
    const item = makeSubmission({ submittedAt: new Date(2026, 6, 10, 12, 0, 0).toISOString() });
    expect(
      submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, dateFrom: "2026-07-10", dateTo: "2026-07-10" }),
    ).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, dateFrom: "2026-07-11" })).toBe(false);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, dateTo: "2026-07-09" })).toBe(false);
  });

  it("includes submissions at both edges of a local calendar day", () => {
    const justAfterMidnight = makeSubmission({ submittedAt: new Date(2026, 6, 10, 0, 0, 0).toISOString() });
    const justBeforeMidnight = makeSubmission({ submittedAt: new Date(2026, 6, 10, 23, 59, 59).toISOString() });
    const sameDay = { ...EMPTY_SUBMISSION_FILTERS, dateFrom: "2026-07-10", dateTo: "2026-07-10" };
    expect(submissionMatchesFilters(justAfterMidnight, sameDay)).toBe(true);
    expect(submissionMatchesFilters(justBeforeMidnight, sameDay)).toBe(true);
  });

  it("excludes submissions with no submitted date once a range is set", () => {
    const undated = makeSubmission({ submittedAt: null });
    expect(submissionMatchesFilters(undated, EMPTY_SUBMISSION_FILTERS)).toBe(true);
    expect(submissionMatchesFilters(undated, { ...EMPTY_SUBMISSION_FILTERS, dateFrom: "2026-07-10" })).toBe(false);
  });

  it("filters by publish profile, treating missing as the default profile", () => {
    const cSuite = makeSubmission({ publishKey: "c-suite" });
    const legacy = makeSubmission({ publishKey: undefined });
    expect(submissionMatchesFilters(cSuite, { ...EMPTY_SUBMISSION_FILTERS, publishProfile: "c-suite" })).toBe(true);
    expect(submissionMatchesFilters(legacy, { ...EMPTY_SUBMISSION_FILTERS, publishProfile: "c-suite" })).toBe(false);
    expect(submissionMatchesFilters(legacy, { ...EMPTY_SUBMISSION_FILTERS, publishProfile: "production" })).toBe(true);
  });

  it("applies a field condition against the submitted answers", () => {
    const item = makeSubmission({ submissionData: { trainingTitle: "Fire Safety" } });
    const contains = condition("trainingTitle", "text", { op: "contains", value: "fire" });
    const misses = condition("trainingTitle", "text", { op: "contains", value: "first aid" });
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, fieldFilters: [contains] })).toBe(true);
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, fieldFilters: [misses] })).toBe(false);
  });

  it("ANDs several field conditions together", () => {
    const item = makeSubmission({ submissionData: { trainingTitle: "Fire Safety", score: 8 } });
    const filters = {
      ...EMPTY_SUBMISSION_FILTERS,
      fieldFilters: [
        condition("trainingTitle", "text", { op: "contains", value: "fire" }),
        condition("score", "number", { op: "gte", value: "9" }),
      ],
    };
    expect(submissionMatchesFilters(item, filters)).toBe(false);
    filters.fieldFilters[1] = condition("score", "number", { op: "gte", value: "8" });
    expect(submissionMatchesFilters(item, filters)).toBe(true);
  });

  it("survives null text from columns SharePoint never wrote", () => {
    const record = {
      formType: "Training Feedback",
      profileKey: "production",
      formVersion: "1.0",
      stage: "pending" as const,
      submittedAt: "2026-07-10T09:00:00.000Z",
      searchTexts: [null, undefined, "Item 1"],
      submitterTexts: [null],
      data: {},
    };
    expect(recordMatchesFilters(record, { ...EMPTY_SUBMISSION_FILTERS, search: "item" })).toBe(true);
    expect(recordMatchesFilters(record, { ...EMPTY_SUBMISSION_FILTERS, search: "nope" })).toBe(false);
    expect(recordMatchesFilters(record, { ...EMPTY_SUBMISSION_FILTERS, submitter: "ahmad" })).toBe(false);
  });

  it("reads answers stored under SharePoint-escaped keys", () => {
    const item = makeSubmission({ submissionData: { Staff_x0020_Name: "Ahmad" } });
    const filter = condition("Staff Name", "text", { op: "contains", value: "ahmad" });
    expect(submissionMatchesFilters(item, { ...EMPTY_SUBMISSION_FILTERS, fieldFilters: [filter] })).toBe(true);
  });
});

describe("fieldFilterMatches", () => {
  it("matches text with contains, exact and negated operators", () => {
    const field = (op: FieldFilter["op"], value: string) => condition("q", "text", { op, value });
    expect(fieldFilterMatches("Fire Safety", field("contains", "safety"))).toBe(true);
    expect(fieldFilterMatches("Fire Safety", field("notContains", "safety"))).toBe(false);
    expect(fieldFilterMatches("Fire Safety", field("is", "fire safety"))).toBe(true);
    expect(fieldFilterMatches("Fire Safety", field("is", "fire"))).toBe(false);
    expect(fieldFilterMatches("Fire Safety", field("isNot", "fire"))).toBe(true);
  });

  it("treats an empty text value as no constraint", () => {
    expect(fieldFilterMatches("anything", condition("q", "text", { op: "contains", value: "" }))).toBe(true);
  });

  it("matches blank and answered regardless of kind", () => {
    expect(fieldFilterMatches("", condition("q", "text", { op: "isEmpty" }))).toBe(true);
    expect(fieldFilterMatches([], condition("q", "choice", { op: "isEmpty" }))).toBe(true);
    expect(fieldFilterMatches(undefined, condition("q", "date", { op: "isEmpty" }))).toBe(true);
    expect(fieldFilterMatches("x", condition("q", "text", { op: "isNotEmpty" }))).toBe(true);
    expect(fieldFilterMatches("", condition("q", "text", { op: "isNotEmpty" }))).toBe(false);
  });

  it("matches multi-select answers with anyOf and noneOf", () => {
    const answer = ["Safety", "Quality"];
    expect(fieldFilterMatches(answer, condition("q", "choice", { op: "anyOf", values: ["Quality"] }))).toBe(true);
    expect(fieldFilterMatches(answer, condition("q", "choice", { op: "anyOf", values: ["Finance"] }))).toBe(false);
    expect(fieldFilterMatches(answer, condition("q", "choice", { op: "noneOf", values: ["Finance"] }))).toBe(true);
    expect(fieldFilterMatches(answer, condition("q", "choice", { op: "noneOf", values: ["Quality"] }))).toBe(false);
  });

  it("treats an unset multi-select as no constraint", () => {
    expect(fieldFilterMatches("Safety", condition("q", "choice", { op: "anyOf", values: [] }))).toBe(true);
  });

  it("compares dates by calendar day, not by instant", () => {
    const between = condition("q", "date", { op: "between", value: "2026-07-01", value2: "2026-07-31" });
    expect(fieldFilterMatches("2026-07-10", between)).toBe(true);
    expect(fieldFilterMatches("2026-08-01", between)).toBe(false);
    expect(fieldFilterMatches("2026-07-31T23:30:00.000Z", between)).toBe(true);
    expect(fieldFilterMatches("2026-07-10", condition("q", "date", { op: "on", value: "2026-07-10" }))).toBe(true);
    expect(fieldFilterMatches("2026-07-10", condition("q", "date", { op: "before", value: "2026-07-10" }))).toBe(false);
    expect(fieldFilterMatches("2026-07-09", condition("q", "date", { op: "before", value: "2026-07-10" }))).toBe(true);
    expect(fieldFilterMatches("2026-07-11", condition("q", "date", { op: "after", value: "2026-07-10" }))).toBe(true);
  });

  it("leaves an open-ended date range open on the missing side", () => {
    const fromOnly = condition("q", "date", { op: "between", value: "2026-07-01", value2: "" });
    expect(fieldFilterMatches("2030-01-01", fromOnly)).toBe(true);
    expect(fieldFilterMatches("2026-06-30", fromOnly)).toBe(false);
  });

  it("compares times by minute of day", () => {
    const morning = condition("q", "time", { op: "between", value: "08:00", value2: "12:00" });
    expect(fieldFilterMatches("09:30", morning)).toBe(true);
    expect(fieldFilterMatches("13:00", morning)).toBe(false);
    expect(fieldFilterMatches("07:59", morning)).toBe(false);
    expect(fieldFilterMatches("08:00", morning)).toBe(true);
  });

  it("compares numbers, tolerating numeric strings and thousands separators", () => {
    expect(fieldFilterMatches(8, condition("q", "number", { op: "gte", value: "8" }))).toBe(true);
    expect(fieldFilterMatches("8", condition("q", "number", { op: "lte", value: "7" }))).toBe(false);
    expect(fieldFilterMatches("1,500", condition("q", "number", { op: "between", value: "1000", value2: "2000" }))).toBe(true);
    expect(fieldFilterMatches("abc", condition("q", "number", { op: "eq", value: "1" }))).toBe(false);
  });

  it("matches yes/no answers however they were stored", () => {
    expect(fieldFilterMatches(true, condition("q", "boolean", { op: "isTrue" }))).toBe(true);
    expect(fieldFilterMatches("Yes", condition("q", "boolean", { op: "isTrue" }))).toBe(true);
    expect(fieldFilterMatches("false", condition("q", "boolean", { op: "isFalse" }))).toBe(true);
    expect(fieldFilterMatches(true, condition("q", "boolean", { op: "isFalse" }))).toBe(false);
  });
});

describe("fieldsFromSurveyJson", () => {
  const survey: SurveyJson = {
    pages: [
      {
        name: "page1",
        elements: [
          { type: "text", name: "trainingTitle", title: "Training Title" },
          { type: "text", name: "heldOn", title: "Held On", inputType: "date" },
          { type: "text", name: "startsAt", title: "Starts At", inputType: "time" },
          { type: "text", name: "headcount", title: "Headcount", inputType: "number" },
          { type: "dropdown", name: "dept", title: "Department", choices: ["HR", { value: "ops", text: "Operations" }] },
          { type: "boolean", name: "certified", title: "Certified" },
          { type: "html", name: "banner", html: "<p>hi</p>" },
          { type: "signaturepad", name: "sign", title: "Signature" },
          { type: "matrixdynamic", name: "rows", title: "Attendees" },
        ],
      },
      {
        name: "Feedback",
        elements: [
          {
            type: "panel",
            name: "ratings",
            title: "Ratings",
            elements: [{ type: "rating", name: "score", title: "Overall Score" }],
          },
        ],
      },
    ],
  };

  it("maps each question to the kind that decides its operators", () => {
    const fields = fieldsFromSurveyJson(survey);
    const kinds = Object.fromEntries(fields.map((field) => [field.key, field.kind]));
    expect(kinds).toEqual({
      trainingTitle: "text",
      heldOn: "date",
      startsAt: "time",
      headcount: "number",
      dept: "choice",
      certified: "boolean",
      score: "number",
    });
  });

  it("drops display blocks, signatures and matrices", () => {
    const keys = fieldsFromSurveyJson(survey).map((field) => field.key);
    expect(keys).not.toContain("banner");
    expect(keys).not.toContain("sign");
    expect(keys).not.toContain("rows");
  });

  it("reads choices in both the string and the value/text form", () => {
    const dept = fieldsFromSurveyJson(survey).find((field) => field.key === "dept");
    expect(dept?.choices).toEqual([
      { value: "HR", label: "HR" },
      { value: "ops", label: "Operations" },
    ]);
  });

  it("groups questions by the page or panel they sit in", () => {
    const fields = fieldsFromSurveyJson(survey);
    expect(fields.find((field) => field.key === "trainingTitle")?.section).toBe("Page 1");
    expect(fields.find((field) => field.key === "score")?.section).toBe("Ratings");
  });
});

describe("collectFieldCatalog", () => {
  const surveyV1: SurveyJson = {
    pages: [{ name: "page1", elements: [{ type: "dropdown", name: "dept", title: "Department", choices: ["HR"] }] }],
  };
  const surveyV2: SurveyJson = {
    pages: [
      {
        name: "page1",
        elements: [
          { type: "dropdown", name: "dept", title: "Department", choices: ["HR", "Ops"] },
          { type: "text", name: "note", title: "Note" },
        ],
      },
    ],
  };

  it("returns nothing until a form type is chosen", () => {
    const items = [makeSubmission({ surveyJson: surveyV1 })];
    expect(collectFieldCatalog(items, "")).toEqual([]);
  });

  it("narrows to the questions one version asked", () => {
    const items = [
      makeSubmission({ formVersion: "1.0", surveyJson: surveyV1 }),
      makeSubmission({ formVersion: "2.0", surveyJson: surveyV2 }),
    ];
    expect(collectFieldCatalog(items, "Training Feedback", { formVersion: "1.0" }).map((f) => f.key)).toEqual(["dept"]);
    expect(collectFieldCatalog(items, "Training Feedback", { formVersion: "2.0" }).map((f) => f.key)).toEqual([
      "dept",
      "note",
    ]);
  });

  it("narrows to the questions one profile published", () => {
    const items = [
      makeSubmission({ formVersion: "1.0", publishKey: "c-suite", surveyJson: surveyV1 }),
      makeSubmission({ formVersion: "1.0", publishKey: "night-shift", surveyJson: surveyV2 }),
    ];
    expect(collectFieldCatalog(items, "Training Feedback", { publishProfile: "c-suite" }).map((f) => f.key)).toEqual([
      "dept",
    ]);
  });

  it("recovers a catalogue from the answers when no schema was snapshotted", () => {
    const items = [
      makeSubmission({ surveyJson: null, submissionData: { staffName: "Ahmad", score: 8, heldOn: "2026-07-10" } }),
    ];
    const catalog = collectFieldCatalog(items, "Training Feedback");
    expect(Object.fromEntries(catalog.map((field) => [field.key, field.kind]))).toEqual({
      heldOn: "date",
      score: "number",
      staffName: "text",
    });
  });

  it("unions the questions across the versions of one form type", () => {
    const items = [
      makeSubmission({ formVersion: "1.0", surveyJson: surveyV1 }),
      makeSubmission({ formVersion: "2.0", surveyJson: surveyV2 }),
      makeSubmission({ listTitle: "Other Form", surveyJson: surveyV2 }),
    ];
    const catalog = collectFieldCatalog(items, "Training Feedback");
    expect(catalog.map((field) => field.key)).toEqual(["dept", "note"]);
    expect(catalog[0].choices).toEqual([
      { value: "HR", label: "HR" },
      { value: "Ops", label: "Ops" },
    ]);
  });

  it("adds options that only ever appeared in the answers", () => {
    const items = [
      makeSubmission({ surveyJson: surveyV1, submissionData: { dept: "Finance" } }),
    ];
    const dept = collectFieldCatalog(items, "Training Feedback")[0];
    expect(dept.choices).toEqual([
      { value: "HR", label: "HR" },
      { value: "Finance", label: "Finance" },
    ]);
  });
});

describe("collectFormTypes", () => {
  it("counts submissions per form type and keeps forms that have none", () => {
    const items = [
      makeSubmission({ listTitle: "Training Feedback" }),
      makeSubmission({ listTitle: "Training Feedback" }),
      makeSubmission({ listTitle: "Incident Report" }),
    ];
    expect(collectFormTypes(items, ["Leave Request"])).toEqual([
      { title: "Incident Report", count: 1 },
      { title: "Leave Request", count: 0 },
      { title: "Training Feedback", count: 2 },
    ]);
  });
});

describe("collectPublishProfiles", () => {
  it("returns sorted distinct profiles and normalises missing to production", () => {
    const items = [
      makeSubmission({ publishKey: "c-suite" }),
      makeSubmission({ publishKey: undefined }),
      makeSubmission({ publishKey: "c-suite" }),
    ];
    expect(collectPublishProfiles(items)).toEqual(["c-suite", "production"]);
  });

  it("narrows to the selected form type", () => {
    const items = [
      makeSubmission({ listTitle: "Training Feedback", publishKey: "c-suite" }),
      makeSubmission({ listTitle: "Incident Report", publishKey: "night-shift" }),
    ];
    expect(collectPublishProfiles(items, "Training Feedback")).toEqual(["c-suite"]);
  });
});

describe("collectFormVersions", () => {
  it("counts versions that have submissions, newest first", () => {
    const items = [
      makeSubmission({ formVersion: "1.0" }),
      makeSubmission({ formVersion: "2.0" }),
      makeSubmission({ formVersion: "10.0" }),
      makeSubmission({ formVersion: "2.0" }),
      makeSubmission({ listTitle: "Incident Report", formVersion: "5.0" }),
    ];
    expect(collectFormVersions(items, "Training Feedback")).toEqual([
      { version: "10.0", count: 1 },
      { version: "2.0", count: 2 },
      { version: "1.0", count: 1 },
    ]);
  });

  it("narrows to the profile above it", () => {
    const items = [
      makeSubmission({ formVersion: "1.0", publishKey: "c-suite" }),
      makeSubmission({ formVersion: "2.0", publishKey: "night-shift" }),
    ];
    expect(collectFormVersions(items, "Training Feedback", "c-suite")).toEqual([{ version: "1.0", count: 1 }]);
  });

  it("returns nothing until a form is chosen", () => {
    expect(collectFormVersions([makeSubmission()], "")).toEqual([]);
  });
});

describe("walking the filter hierarchy", () => {
  const scoped = {
    ...EMPTY_SUBMISSION_FILTERS,
    formType: "Training Feedback",
    publishProfile: "c-suite",
    formVersion: "2.0",
    search: "keep me",
    fieldFilters: [condition("trainingTitle", "text", { op: "contains", value: "fire" })],
  };

  it("drops profile, version and conditions when the form changes", () => {
    const next = applyFormTypeChange(scoped, "Incident Report");
    expect(next.formType).toBe("Incident Report");
    expect(next.publishProfile).toBe("");
    expect(next.formVersion).toBe("");
    expect(next.fieldFilters).toEqual([]);
    expect(next.search).toBe("keep me");
  });

  it("drops version and conditions when the profile changes, keeping the form", () => {
    const next = applyPublishProfileChange(scoped, "night-shift");
    expect(next.formType).toBe("Training Feedback");
    expect(next.publishProfile).toBe("night-shift");
    expect(next.formVersion).toBe("");
    expect(next.fieldFilters).toEqual([]);
  });

  it("drops only the conditions when the version changes", () => {
    const next = applyFormVersionChange(scoped, "3.0");
    expect(next.formType).toBe("Training Feedback");
    expect(next.publishProfile).toBe("c-suite");
    expect(next.formVersion).toBe("3.0");
    expect(next.fieldFilters).toEqual([]);
  });

  it("leaves the state untouched when a level is re-selected", () => {
    expect(applyFormTypeChange(scoped, "Training Feedback")).toBe(scoped);
    expect(applyPublishProfileChange(scoped, "c-suite")).toBe(scoped);
    expect(applyFormVersionChange(scoped, "2.0")).toBe(scoped);
  });
});

describe("sortSubmissions", () => {
  it("sorts newest first by default and oldest first on request", () => {
    const older = makeSubmission({ id: "a", submittedAt: "2026-07-01T00:00:00.000Z" });
    const newer = makeSubmission({ id: "b", submittedAt: "2026-07-20T00:00:00.000Z" });
    expect(sortSubmissions([older, newer], "newest").map((i) => i.id)).toEqual(["b", "a"]);
    expect(sortSubmissions([older, newer], "oldest").map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const items = [
      makeSubmission({ id: "a", submittedAt: "2026-07-01T00:00:00.000Z" }),
      makeSubmission({ id: "b", submittedAt: "2026-07-20T00:00:00.000Z" }),
    ];
    sortSubmissions(items, "newest");
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("fieldsFromResponses", () => {
  it("keeps answer columns and drops list plumbing and workflow bookkeeping", () => {
    const rows = [
      {
        Id: 4,
        Title: "Training Feedback",
        FileSystemObjectType: 0,
        OData__UIVersionString: "1.0",
        L1_Status: "Approved",
        attendees_Html: "<table/>",
        RawJSON: "{}",
        staffName: "Ahmad",
      },
    ];
    expect(fieldsFromResponses(rows).map((field) => field.key)).toEqual(["staffName"]);
  });

  it("infers the kind that decides the operators offered", () => {
    const rows = [
      {
        note: "hello",
        score: 8,
        certified: true,
        heldOn: "2026-07-10",
        loggedAt: "2026-07-10T09:00:00Z",
        startsAt: "09:30",
        depts: ["HR", "Ops"],
      },
    ];
    expect(Object.fromEntries(fieldsFromResponses(rows).map((f) => [f.key, f.kind]))).toEqual({
      note: "text",
      score: "number",
      certified: "boolean",
      heldOn: "date",
      loggedAt: "datetime",
      startsAt: "time",
      depts: "choice",
    });
  });

  it("widens a column to text when its answers disagree on a kind", () => {
    const rows = [{ ref: "2026-07-10" }, { ref: "TBC" }];
    expect(fieldsFromResponses(rows)[0].kind).toBe("text");
  });

  it("reads a SharePoint-escaped column name as its readable label", () => {
    const [field] = fieldsFromResponses([{ Staff_x0020_Name: "Ahmad" }]);
    expect(field.key).toBe("Staff_x0020_Name");
    expect(field.label).toBe("Staff Name");
  });
});

describe("countActiveFilters", () => {
  it("counts only fields that differ from the empty state", () => {
    expect(countActiveFilters(EMPTY_SUBMISSION_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...EMPTY_SUBMISSION_FILTERS, search: "x", stage: "pending" })).toBe(2);
  });

  it("counts each field condition separately", () => {
    const filters = {
      ...EMPTY_SUBMISSION_FILTERS,
      formType: "Training Feedback",
      fieldFilters: [
        condition("a", "text", { op: "contains", value: "x" }),
        condition("b", "text", { op: "contains", value: "y" }),
      ],
    };
    expect(countActiveFilters(filters)).toBe(3);
  });
});

describe("describeFieldFilter", () => {
  const field = { key: "dept", label: "Department", section: "Page 1", kind: "choice" as const, choices: [
    { value: "ops", label: "Operations" },
    { value: "hr", label: "Human Resources" },
    { value: "fin", label: "Finance" },
  ] };

  it("names the question, the operator and the value", () => {
    expect(describeFieldFilter(condition("dept", "choice", { op: "anyOf", values: ["ops"] }), field)).toBe(
      "Department is any of Operations",
    );
  });

  it("summarises a long option list rather than listing all of it", () => {
    const filter = condition("dept", "choice", { op: "anyOf", values: ["ops", "hr", "fin"] });
    expect(describeFieldFilter(filter, field)).toBe("Department is any of Operations, Human Resources +1");
  });

  it("shows both bounds of a range", () => {
    const filter = condition("heldOn", "date", { op: "between", value: "2026-07-01", value2: "2026-07-31" });
    expect(describeFieldFilter(filter)).toBe("heldOn between 2026-07-01 – 2026-07-31");
  });

  it("needs no value for a presence operator", () => {
    expect(describeFieldFilter(condition("dept", "choice", { op: "isEmpty" }), field)).toBe("Department is blank");
  });
});

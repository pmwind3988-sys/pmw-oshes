import { describe, expect, it } from "vitest";

import { createQuestionNameResolver, createResponseKeyResolver } from "./responseKeys";

/**
 * A question whose name ran past SharePoint's 32-character limit for a column's
 * internal name. The answer is there; it is filed under the shortened name, and
 * every reader that matched by name alone printed it as a stray key under
 * "Other stored answers" instead of under the question that asked it.
 */
describe("createResponseKeyResolver", () => {
  it("finds an answer stored under its own name", () => {
    const resolve = createResponseKeyResolver({ location: "Berth 3" });

    expect(resolve("location")).toBe("location");
  });

  it("finds an answer whose column spells a space the SharePoint way", () => {
    const resolve = createResponseKeyResolver({ PPE_x0020_Worn: "Helmet" });

    expect(resolve("PPE Worn")).toBe("PPE_x0020_Worn");
  });

  it("finds an answer whose name SharePoint shortened to fit", () => {
    const resolve = createResponseKeyResolver({ workPerformerNameInternalExterna: "Test" });

    expect(resolve("workPerformerNameInternalExternal")).toBe("workPerformerNameInternalExterna");
  });

  it("leaves a shorter question its own answer", () => {
    const resolve = createResponseKeyResolver({
      workPerformerName: "Ali bin Osman",
      workPerformerNameInternalExterna: "Internal",
    });

    expect(resolve("workPerformerName")).toBe("workPerformerName");
    expect(resolve("workPerformerNameInternalExternal")).toBe("workPerformerNameInternalExterna");
  });

  it("takes the closest fit when one shortened key starts another", () => {
    const resolve = createResponseKeyResolver({
      contractorSiteSafetyBriefingAtt: "Yes",
      contractorSiteSafetyBriefingAttendedBy: "Ah Meng",
    });

    expect(resolve("contractorSiteSafetyBriefingAttendedByName")).toBe("contractorSiteSafetyBriefingAttendedBy");
  });

  it("does not read a short name as the start of a longer one", () => {
    const resolve = createResponseKeyResolver({ workPerformer: "Ali" });

    expect(resolve("workPerformerNameInternalExternal")).toBeUndefined();
  });

  it("does not shorten a name that never ran past the limit", () => {
    const resolve = createResponseKeyResolver({ briefingAttendedByTheSupervisor: "Yes" });

    expect(resolve("briefingAttendedBy")).toBeUndefined();
  });

  it("reports nothing stored for a question nobody answered", () => {
    const resolve = createResponseKeyResolver({ location: "Berth 3" });

    expect(resolve("hazards")).toBeUndefined();
  });
});

/**
 * The same rule read the other way. A reader holding a record's stored keys —
 * sorting the signatures from the answers — has to get back to what the form
 * called each one, because the form is what says whether a key is ink or text.
 */
describe("createQuestionNameResolver", () => {
  const names = [
    "location",
    "supervisorSignature",
    "workPerformerNameInternalExternal",
    "contractorSignatureConfirmationName",
  ];

  it("returns a key the form asks for under that name", () => {
    expect(createQuestionNameResolver(names)("supervisorSignature")).toBe("supervisorSignature");
  });

  it("reads a shortened key back to the question it was asked under", () => {
    expect(createQuestionNameResolver(names)("workPerformerNameInternalExterna")).toBe(
      "workPerformerNameInternalExternal",
    );
    expect(createQuestionNameResolver(names)("contractorSignatureConfirmatio")).toBe(
      "contractorSignatureConfirmationName",
    );
  });

  it("takes the closest fit when one question's name starts another's", () => {
    const resolve = createQuestionNameResolver([
      "contractorSiteSafetyBriefingAttendedBy",
      "contractorSiteSafetyBriefingAttendedByAndWitnessedBy",
    ]);

    expect(resolve("contractorSiteSafetyBriefingAtt")).toBe("contractorSiteSafetyBriefingAttendedBy");
  });

  it("does not read a short key as the start of a longer question", () => {
    expect(createQuestionNameResolver(names)("workPerformer")).toBeUndefined();
  });

  it("reports nothing for a key no question accounts for", () => {
    expect(createQuestionNameResolver(names)("HotWorkPermitNo")).toBeUndefined();
  });
});

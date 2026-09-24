import { describe, expect, it } from "vitest";
import { deletePrompt } from "./DeleteBreakDialog";
import { formatMalaysiaDateTime } from "../../utils/malaysiaTime";
import type { SmokingBreak } from "../../utils/smoking/schema";

/**
 * The repo has no jsdom / @testing-library, so the dialog's own DOM behaviour
 * (No focused by default, Yes/No wiring) is verified in the browser instead.
 * What is testable in isolation — and what actually varies per record — is the
 * exact sentence the dialog shows, so that is what this covers.
 */

const target: SmokingBreak = {
  id: "12",
  email: "ali@gmail.com",
  fullName: "Ali",
  department: "QA/QC",
  position: "Tech",
  company: "PMW",
  areaInCode: "A",
  areaInName: "Block A",
  areaOutCode: "",
  areaOutName: "",
  timeIn: "2026-09-24T02:42:00Z",
  timeOut: null,
  durationMinutes: null,
  flagReason: "",
};

describe("deletePrompt", () => {
  it("names the record by full name and Malaysian time", () => {
    expect(deletePrompt(target)).toBe(`Delete this break record for Ali, ${formatMalaysiaDateTime(target.timeIn)}?`);
  });

  it("falls back to the email when there is no name on file", () => {
    const noName = { ...target, fullName: "" };
    expect(deletePrompt(noName)).toBe(
      `Delete this break record for ${noName.email}, ${formatMalaysiaDateTime(noName.timeIn)}?`,
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger.js", () => ({ logWarn: vi.fn(), logError: vi.fn() }));

import {
  handleDeleteTestRuns,
  handleMintTestTicket,
  handleRecordTestRunStep,
  handleStampTestRun,
  recordTestRunSteps,
  validateTestRunStepInput,
} from "./testRunActions.js";
import { mintTestTicket, verifyTestTicket } from "./testRun.js";
import { parseTestRunTrail } from "./testRunTrail.js";

/**
 * The authenticated half of a test run: who may start one, which row a ticket
 * may flag, and which rows may be deleted. Every case here is one where a
 * mistake would either mail a real approver during a rehearsal or touch a real
 * submission.
 */

const REGISTRY: Record<string, string> = { "hira-assessment": "HIRA Assessment" };

function mintDeps(owner: string | null = "builder@pmw-group.com") {
  return {
    resolveOwner: vi.fn(async () => owner),
    resolveListTitleForSlug: vi.fn(async (slug: string) => REGISTRY[slug] ?? null),
    ensureColumns: vi.fn(async () => {}),
  };
}

const MINT_BODY = {
  action: "mint-test-ticket",
  slug: "hira-assessment",
  listTitle: "Somebody Else's List",
  testEmail: "Tester@PMW-group.com",
  delegatedToken: "delegated",
};

beforeEach(() => {
  process.env.API_SECRET_KEY = "secret-for-tests";
});

describe("minting a test ticket", () => {
  it("hands a form builder a ticket for the form they asked about", async () => {
    const result = await handleMintTestTicket(MINT_BODY, mintDeps());
    expect(result.status).toBe(200);
    expect(verifyTestTicket(result.payload.ticket, "hira-assessment")).toMatchObject({
      testEmail: "tester@pmw-group.com",
      issuedBy: "builder@pmw-group.com",
    });
  });

  it("refuses anyone who is not a form builder, and provisions nothing", async () => {
    const d = mintDeps(null);
    const result = await handleMintTestTicket(MINT_BODY, d);
    expect(result.status).toBe(403);
    expect(result.payload.ticket).toBeUndefined();
    expect(d.ensureColumns).not.toHaveBeenCalled();
  });

  it("refuses a request with no delegated token to identify the caller", async () => {
    const d = mintDeps();
    const result = await handleMintTestTicket({ ...MINT_BODY, delegatedToken: "" }, d);
    expect(result.status).toBe(401);
    expect(d.resolveOwner).not.toHaveBeenCalled();
  });

  it("refuses an address it could not redirect mail to", async () => {
    const result = await handleMintTestTicket({ ...MINT_BODY, testEmail: "nope" }, mintDeps());
    expect(result.status).toBe(400);
  });

  it("provisions the columns on the slug's own list with the caller's token, ignoring the listTitle it was sent", async () => {
    const d = mintDeps();
    await handleMintTestTicket(MINT_BODY, d);
    expect(d.ensureColumns).toHaveBeenCalledWith("delegated", "HIRA Assessment");
    expect(d.ensureColumns).not.toHaveBeenCalledWith(expect.anything(), "Somebody Else's List");
  });

  it("refuses a slug that names no form", async () => {
    const result = await handleMintTestTicket({ ...MINT_BODY, slug: "nothing-here" }, mintDeps());
    expect(result.status).toBe(400);
    expect(result.payload.ticket).toBeUndefined();
  });

  it("does not hand out a ticket when the columns could not be created", async () => {
    const d = mintDeps();
    d.ensureColumns.mockRejectedValueOnce(new Error("403 accessDenied"));
    const result = await handleMintTestTicket(MINT_BODY, d);
    expect(result.status).toBe(500);
    expect(result.payload.ticket).toBeUndefined();
  });
});

function stampDeps(fields: Record<string, unknown> | null) {
  return {
    resolveListTitleForSlug: vi.fn(async (slug: string) => REGISTRY[slug] ?? null),
    readItem: vi.fn(async () => (fields ? { fields } : null)),
    updateFields: vi.fn(async () => ({})),
  };
}

function ticketFor(issuedBy = "builder@pmw-group.com", slug = "hira-assessment") {
  return mintTestTicket({ slug, testEmail: "tester@pmw-group.com", issuedBy });
}

describe("stamping a signed-in test run", () => {
  const OWN_ROW = { SubmittedBy: "Builder@PMW-group.com", ReferenceNo: "TEST-HIRA-010926-0001" };

  it("flags the ticket holder's own row with the address from the ticket", async () => {
    const d = stampDeps(OWN_ROW);
    const result = await handleStampTestRun("app", { itemId: "12", slug: "hira-assessment", testTicket: ticketFor() }, d);
    expect(result.status).toBe(200);
    expect(d.updateFields).toHaveBeenCalledWith("app", "HIRA Assessment", "12", { IsTest: "true", TestEmail: "tester@pmw-group.com" });
  });

  it("writes to the list the ticket's slug resolves to, never the one in the body", async () => {
    const d = stampDeps(OWN_ROW);
    await handleStampTestRun("app", { itemId: "12", slug: "hira-assessment", listTitle: "Payroll", testTicket: ticketFor() }, d);
    for (const call of d.updateFields.mock.calls as unknown as unknown[][]) expect(call[1]).toBe("HIRA Assessment");
  });

  it("changes nothing without a valid ticket", async () => {
    const d = stampDeps(OWN_ROW);
    const result = await handleStampTestRun("app", { itemId: "12", slug: "hira-assessment", testTicket: "forged.sig" }, d);
    expect(result.status).toBe(400);
    expect(d.updateFields).not.toHaveBeenCalled();
  });

  it("refuses a ticket minted for a different form", async () => {
    const d = stampDeps(OWN_ROW);
    const result = await handleStampTestRun("app", { itemId: "12", slug: "hira-assessment", testTicket: ticketFor(undefined, "other-form") }, d);
    expect(result.status).toBe(400);
    expect(d.updateFields).not.toHaveBeenCalled();
  });

  it("refuses to flag a colleague's real submission with a valid ticket", async () => {
    const d = stampDeps({ SubmittedBy: "colleague@pmw-group.com" });
    const result = await handleStampTestRun("app", { itemId: "12", slug: "hira-assessment", testTicket: ticketFor() }, d);
    expect(result.status).toBe(400);
    expect(d.updateFields).not.toHaveBeenCalled();
  });

  it("refuses a row that is already flagged, or does not exist", async () => {
    const flagged = stampDeps({ ...OWN_ROW, IsTest: "true", TestEmail: "x@y.com" });
    expect((await handleStampTestRun("app", { itemId: "12", slug: "hira-assessment", testTicket: ticketFor() }, flagged)).status).toBe(400);
    expect(flagged.updateFields).not.toHaveBeenCalled();

    const missing = stampDeps(null);
    expect((await handleStampTestRun("app", { itemId: "12", slug: "hira-assessment", testTicket: ticketFor() }, missing)).status).toBe(400);
    expect(missing.updateFields).not.toHaveBeenCalled();
  });

  it("refuses an item id that is not a plain number", async () => {
    const d = stampDeps(OWN_ROW);
    const result = await handleStampTestRun("app", { itemId: "12 or 1=1", slug: "hira-assessment", testTicket: ticketFor() }, d);
    expect(result.status).toBe(400);
    expect(d.readItem).not.toHaveBeenCalled();
  });

  it("starts the checklist with the same steps an anonymous run records", async () => {
    const d = stampDeps(OWN_ROW);
    await handleStampTestRun("app", { itemId: "12", slug: "hira-assessment", testTicket: ticketFor() }, d);
    const trailWrite = (d.updateFields.mock.calls as unknown as unknown[][]).find((call) => "TestRunLog" in (call[3] as Record<string, unknown>));
    const trail = parseTestRunTrail((trailWrite?.[3] as Record<string, unknown>).TestRunLog);
    expect(Object.keys(trail).sort()).toEqual(["row", "ticket"]);
    expect(trail.row.detail).toContain("TEST-HIRA-010926-0001");
  });
});

describe("recording trail steps", () => {
  it("never throws when the trail cannot be written", async () => {
    const deps = {
      readItem: vi.fn(async () => ({ fields: {} })),
      updateFields: vi.fn(async () => { throw new Error("Graph 500"); }),
    };
    await expect(recordTestRunSteps("app", "L", "1", [{ step: "a", label: "A", status: "pass", order: 1 }], deps)).resolves.toBeUndefined();
  });

  it("whitelists the step a browser may record", () => {
    expect(validateTestRunStepInput({ step: "pdf", label: "PDF rendered", status: "pass", order: 1100 })).toMatchObject({ step: "pdf" });
    expect(validateTestRunStepInput({ step: "pdf", label: "PDF rendered", status: "done" })).toBeNull();
    expect(validateTestRunStepInput({ step: "", label: "x", status: "pass" })).toBeNull();
    expect(validateTestRunStepInput({ step: "pdf", label: "x", status: "pass", order: "1" })).toBeNull();
    expect(validateTestRunStepInput(["pdf"])).toBeNull();
  });

  it("records a browser step only on a row already flagged as a test", async () => {
    const make = (fields: Record<string, unknown>) => ({
      resolveOwner: vi.fn(async () => "builder@pmw-group.com"),
      resolveListTitleForSlug: vi.fn(async (slug: string) => REGISTRY[slug] ?? null),
      readItem: vi.fn(async () => ({ fields })),
      updateFields: vi.fn(async () => ({})),
    });
    const body = { delegatedToken: "d", slug: "hira-assessment", itemId: "5", step: { step: "pdf", label: "PDF", status: "pass" } };

    const production = make({});
    expect((await handleRecordTestRunStep("app", body, production)).status).toBe(400);
    expect(production.updateFields).not.toHaveBeenCalled();

    const test = make({ IsTest: "true" });
    expect((await handleRecordTestRunStep("app", body, test)).status).toBe(200);
    expect(test.updateFields).toHaveBeenCalled();

    const outsider = { ...make({ IsTest: "true" }), resolveOwner: vi.fn(async () => null) };
    expect((await handleRecordTestRunStep("app", body, outsider)).status).toBe(403);
  });
});

describe("deleting test runs", () => {
  const ROWS = [
    { id: "1", fields: { IsTest: "true" } },
    { id: "2", fields: {} },
    { id: "3", fields: { IsTest: "TRUE" } },
  ];

  function deleteDeps(owner: string | null = "builder@pmw-group.com") {
    return {
      resolveOwner: vi.fn(async () => owner),
      resolveListTitleForSlug: vi.fn(async (slug: string) => REGISTRY[slug] ?? null),
      listRows: vi.fn(async () => ROWS),
      deleteRow: vi.fn(async () => {}),
    };
  }

  it("clears every test row and never a production one", async () => {
    const d = deleteDeps();
    const result = await handleDeleteTestRuns({ delegatedToken: "d", slug: "hira-assessment" }, d);
    expect(result.payload.deleted).toEqual(["1", "3"]);
    expect(d.deleteRow).not.toHaveBeenCalledWith(expect.anything(), "2");
  });

  it("refuses to delete a named production row", async () => {
    const d = deleteDeps();
    const result = await handleDeleteTestRuns({ delegatedToken: "d", slug: "hira-assessment", itemId: "2" }, d);
    expect(result.status).toBe(400);
    expect(d.deleteRow).not.toHaveBeenCalled();
  });

  it("operates on the slug's own list, never a named one", async () => {
    const d = deleteDeps();
    await handleDeleteTestRuns({ delegatedToken: "d", slug: "hira-assessment", listTitle: "Payroll", itemId: "1" }, d);
    expect(d.listRows).toHaveBeenCalledWith("HIRA Assessment");
    expect(d.deleteRow).toHaveBeenCalledWith("HIRA Assessment", "1");
  });

  it("refuses anyone who is not a form builder", async () => {
    const d = deleteDeps(null);
    const result = await handleDeleteTestRuns({ delegatedToken: "d", slug: "hira-assessment" }, d);
    expect(result.status).toBe(403);
    expect(d.listRows).not.toHaveBeenCalled();
  });
});

/**
 * The scheduled mail runner and test runs.
 *
 * A deferred evaluation email can fall due weeks after the ticket that started
 * a rehearsal expired, and nudges and reassignments from the portal are
 * delivered here too. So the redirect must come off the stored row, and a test
 * row whose address has gone stale must send nothing rather than fall back to
 * the real recipient written in the schedule entry.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirectTestMessage } from "./testRun.js";
import type { WorkflowEmailContext, WorkflowEmailMessage } from "./workflowEmail.js";

const graph = vi.hoisted(() => ({
  getGraphToken: vi.fn(async () => "tok"),
  queryListItems: vi.fn(async (_token: string, _list: string): Promise<{ id: string; fields: Record<string, unknown> }[]> => []),
  updateListItemFields: vi.fn(async (_token: string, _list: string, _id: string, _fields: Record<string, unknown>) => ({})),
}));
const mail = vi.hoisted(() => ({ deliverWorkflowEmail: vi.fn(async () => ({})) }));

vi.mock("./graphClient.js", () => graph);
vi.mock("./auth.js", () => ({ setCorsHeaders: vi.fn(), validateApiKey: vi.fn(() => ({ valid: true })) }));
vi.mock("./logger.js", () => ({ logError: vi.fn(), logWarn: vi.fn() }));
const actualMail = await vi.importActual<typeof import("./workflowEmail.js")>("./workflowEmail.js");
vi.mock("./workflowEmail.js", () => ({ ...actualMail, ...mail }));

// The handler lives one level up; `api/` files are deployed functions, so its
// test cannot sit beside it without counting against the function cap.
const handler = (await import("../workflow-email-cron.js")).default;

function res() {
  const out: { code?: number; body?: Record<string, unknown> } = {};
  const self = {
    status(code: number) { out.code = code; return self; },
    json(body: Record<string, unknown>) { out.body = body; },
    setHeader() {}, end() {},
    result: out,
  };
  return self;
}

const DUE_ENTRY = {
  "2": {
    layer: 2, recipient: "hod@pmw-group.com",
    dueAt: "2020-01-01T00:00:00.000Z", status: "scheduled",
    updatedAt: "2020-01-01T00:00:00.000Z", layerType: "evaluation",
    totalLayers: 2, reviewLink: "https://example.com/2", submittedBy: "s@example.com",
  },
};

async function runCronWith(fields: Record<string, unknown>): Promise<string[]> {
  const sent: string[] = [];
  (mail.deliverWorkflowEmail as unknown as {
    mockImplementation(fn: (token: string, message: WorkflowEmailMessage, context: WorkflowEmailContext) => Promise<Record<string, never>>): void;
  }).mockImplementation(async (_token, message, context) => {
    const outgoing = context.testRun ? redirectTestMessage(message, context.testRun) : message;
    sent.push(([] as string[]).concat(outgoing.to).join(", "));
    return {};
  });
  graph.queryListItems.mockImplementation(async (_t: string, list: string) =>
    list === "Master Form"
      ? [{ id: "f1", fields: { Title: "HIRA Assessment" } }]
      : [{ id: "1", fields: { CurrentLayer: 2, ...fields, WorkflowEmailSchedule: JSON.stringify(DUE_ENTRY) } }]);

  await handler({ method: "GET", headers: {} }, res());
  return sent;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the cron and test runs", () => {
  it("leaves a production deferred email addressed to its real recipient", async () => {
    expect(await runCronWith({})).toEqual(["hod@pmw-group.com"]);
  });

  it("still redirects a deferred test-run email long after the ticket expired", async () => {
    expect(await runCronWith({ IsTest: "true", TestEmail: "tester@pmw-group.com" })).toEqual(["tester@pmw-group.com"]);
  });

  it("refuses a stale test-run redirect rather than mailing a real approver", async () => {
    const sent = await runCronWith({ IsTest: "true", TestEmail: "not-an-email" });
    expect(sent).toEqual([]);
    expect(mail.deliverWorkflowEmail).not.toHaveBeenCalled();
  });

  it("marks a refused entry failed so it is not retried on every run", async () => {
    await runCronWith({ IsTest: "true", TestEmail: "" });
    const write = graph.updateListItemFields.mock.calls.at(-1);
    const schedule = JSON.parse(String(write?.[3].WorkflowEmailSchedule));
    expect(schedule["2"].status).toBe("failed");
  });
});

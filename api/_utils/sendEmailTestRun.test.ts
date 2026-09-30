/**
 * `api/send-email.ts` is driven by the browser, so whether a mail belongs to a
 * test run has to be derived on the server: from the response row the caller
 * names, and from a ticket only this server could have signed. These tests
 * drive the real handler with Graph mocked out and record what would have been
 * sent, and to whom.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mintTestTicket, redirectTestMessage } from "./testRun.js";
import type { WorkflowEmailContext, WorkflowEmailMessage } from "./workflowEmail.js";
import { sendEmailTestRunDispatch } from "./sendEmailTestRun.js";

const graph = vi.hoisted(() => ({
  getGraphToken: vi.fn(async () => "tok"),
  queryListItemById: vi.fn(async (): Promise<{ id: string; fields: Record<string, unknown> } | null> => null),
}));
const mail = vi.hoisted(() => ({
  sendGraphEmail: vi.fn(async () => {}),
  deliverWorkflowEmail: vi.fn(async () => ({})),
  resolveOshesFormSender: vi.fn(() => "oshes@pmw-group.com"),
}));

vi.mock("./graphClient.js", () => graph);
vi.mock("./auth.js", () => ({ setCorsHeaders: vi.fn(), validateApiKey: vi.fn(() => ({ valid: true })) }));
vi.mock("./logger.js", () => ({ logError: vi.fn(), logWarn: vi.fn() }));
vi.mock("./workflowEmail.js", () => mail);

const handler = (await import("../send-email.js")).default;

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

/** What actually left, after the redirect `deliverWorkflowEmail` itself applies. */
function sentTo(): string[] {
  const out: string[] = [];
  for (const call of mail.sendGraphEmail.mock.calls as unknown as [string, WorkflowEmailMessage][]) {
    out.push(([] as string[]).concat(call[1].to).join(", "));
  }
  for (const call of mail.deliverWorkflowEmail.mock.calls as unknown as [string, WorkflowEmailMessage, WorkflowEmailContext][]) {
    const outgoing = call[2].testRun ? redirectTestMessage(call[1], call[2].testRun) : call[1];
    out.push(([] as string[]).concat(outgoing.to).join(", "));
  }
  return out;
}

const WORKFLOW = { listTitle: "HIRA Assessment", responseItemId: 12, layer: 2 };
const LAYER_MAIL = { to: "hod@pmw-group.com", subject: "Action required", body: "<p>Approve</p>", workflow: WORKFLOW };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.API_SECRET_KEY = "secret-for-tests";
  graph.queryListItemById.mockResolvedValue(null);
});

describe("send-email and test runs", () => {
  it("sends production mail exactly as before", async () => {
    graph.queryListItemById.mockResolvedValue({ id: "12", fields: {} });
    await handler({ method: "POST", headers: {}, body: LAYER_MAIL }, res());
    expect(sentTo()).toEqual(["hod@pmw-group.com"]);
  });

  it("redirects a layer notice on a test row, with no ticket anywhere in the request", async () => {
    // The approve/reject click from an emailed link, days after the ticket expired.
    graph.queryListItemById.mockResolvedValue({ id: "12", fields: { IsTest: "true", TestEmail: "tester@pmw-group.com" } });
    await handler({ method: "POST", headers: {}, body: LAYER_MAIL }, res());
    expect(sentTo()).toEqual(["tester@pmw-group.com"]);
  });

  it("sends nothing for a test row whose address is unusable", async () => {
    graph.queryListItemById.mockResolvedValue({ id: "12", fields: { IsTest: "true", TestEmail: "broken" } });
    const r = res();
    await handler({ method: "POST", headers: {}, body: LAYER_MAIL }, r);
    expect(sentTo()).toEqual([]);
    expect(r.result.body?.skipped).toBe("test-run-redirect-unusable");
  });

  it("ignores a testRun the caller smuggles into the workflow context", async () => {
    graph.queryListItemById.mockResolvedValue({ id: "12", fields: {} });
    await handler({
      method: "POST",
      headers: {},
      body: { ...LAYER_MAIL, workflow: { ...WORKFLOW, testRun: { testEmail: "attacker@example.com" } } },
    }, res());
    expect(sentTo()).toEqual(["hod@pmw-group.com"]);
  });

  it("checks the row named by `row` for a submitter notice, without logging it against a layer", async () => {
    graph.queryListItemById.mockResolvedValue({ id: "12", fields: { IsTest: "true", TestEmail: "tester@pmw-group.com" } });
    await handler({
      method: "POST",
      headers: {},
      body: { to: "submitter@pmw-group.com", subject: "Approved", body: "b", row: { listTitle: "HIRA Assessment", responseItemId: 12 } },
    }, res());
    expect(mail.deliverWorkflowEmail).not.toHaveBeenCalled();
    expect(sentTo()).toEqual(["tester@pmw-group.com"]);
  });

  it("redirects a confirmation mail that names no row when a valid ticket for that form is forwarded", async () => {
    const testTicket = mintTestTicket({ slug: "hira-assessment", testEmail: "tester@pmw-group.com", issuedBy: "b@pmw-group.com" });
    await handler({
      method: "POST",
      headers: {},
      body: { sendToConfiguredSender: true, subject: "Manual workflow", body: "b", testTicket, slug: "hira-assessment" },
    }, res());
    expect(sentTo()).toEqual(["tester@pmw-group.com"]);
  });

  it("falls back to the forwarded ticket when the row cannot be read", async () => {
    graph.queryListItemById.mockRejectedValue(new Error("list not found"));
    const testTicket = mintTestTicket({ slug: "hira-assessment", testEmail: "tester@pmw-group.com", issuedBy: "b@pmw-group.com" });
    await handler({ method: "POST", headers: {}, body: { ...LAYER_MAIL, testTicket, slug: "hira-assessment" } }, res());
    expect(sentTo()).toEqual(["tester@pmw-group.com"]);
  });

  it("does not let a ticket for another form redirect anything", async () => {
    const testTicket = mintTestTicket({ slug: "other-form", testEmail: "tester@pmw-group.com", issuedBy: "b@pmw-group.com" });
    await handler({
      method: "POST",
      headers: {},
      body: { to: "someone@pmw-group.com", subject: "s", body: "b", testTicket, slug: "hira-assessment" },
    }, res());
    expect(sentTo()).toEqual(["someone@pmw-group.com"]);
  });
});

describe("sendEmailTestRunDispatch", () => {
  it("prefers the row, lets a ticket only add a redirect, and blocks an unusable test row", () => {
    const ticket = mintTestTicket({ slug: "f", testEmail: "t@pmw-group.com", issuedBy: "b@pmw-group.com" });
    expect(sendEmailTestRunDispatch(null, undefined, undefined)).toEqual({ kind: "production" });
    expect(sendEmailTestRunDispatch(null, ticket, "f")).toEqual({ kind: "redirect", redirect: { testEmail: "t@pmw-group.com" } });
    expect(sendEmailTestRunDispatch({ IsTest: "true" }, undefined, undefined)).toEqual({ kind: "blocked" });
    expect(sendEmailTestRunDispatch({ IsTest: "true" }, ticket, "f")).toEqual({ kind: "redirect", redirect: { testEmail: "t@pmw-group.com" } });
    expect(sendEmailTestRunDispatch({}, "forged.sig", "f")).toEqual({ kind: "production" });
  });
});

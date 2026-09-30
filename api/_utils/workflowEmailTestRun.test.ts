/**
 * `deliverWorkflowEmail` is the one place every workflow email passes through,
 * and the reissued-link sender is the one that does not. Both are checked here
 * against the actual Graph `sendMail` payload, with the list helpers mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./graphClient.js", () => ({
  ensureListColumns: vi.fn(async () => ({ created: [], existing: [] })),
  queryListItemById: vi.fn(async () => ({ id: "7", fields: {} })),
  updateListItemFields: vi.fn(async () => ({})),
}));
vi.mock("./provisioning.js", () => ({ ensureWorkflowColumns: vi.fn(async () => {}) }));
vi.mock("./logger.js", () => ({ logWarn: vi.fn(), logError: vi.fn() }));

const { deliverWorkflowEmail } = await import("./workflowEmail.js");
const { reissueReviewLink } = await import("./linkReissue.js");

let sendMail: ReturnType<typeof vi.fn>;

function recipientsOf(call: unknown[]): string[] {
  const body = JSON.parse(String((call[1] as { body: string }).body)) as {
    message: { toRecipients: { emailAddress: { address: string } }[]; subject: string };
  };
  return body.message.toRecipients.map((entry) => entry.emailAddress.address);
}

function subjectOf(call: unknown[]): string {
  return (JSON.parse(String((call[1] as { body: string }).body)) as { message: { subject: string } }).message.subject;
}

beforeEach(() => {
  process.env.OSHES_FORM_EMAIL_FROM_ADDRESS = "noreply@pmw-group.com";
  sendMail = vi.fn(async () => ({ ok: true, status: 202, json: async () => ({}), text: async () => "" }));
  vi.stubGlobal("fetch", sendMail);
});

describe("deliverWorkflowEmail", () => {
  const MESSAGE = { to: ["hod@pmw-group.com", "safety@pmw-group.com"], subject: "Action required", body: "<p>b</p>" };
  const CONTEXT = { listTitle: "HIRA Assessment", responseItemId: "7", layer: 1 };

  it("collapses every recipient of a test run to the one test address", async () => {
    await deliverWorkflowEmail("tok", MESSAGE, { ...CONTEXT, testRun: { testEmail: "tester@pmw-group.com" } });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(recipientsOf(sendMail.mock.calls[0])).toEqual(["tester@pmw-group.com"]);
    expect(subjectOf(sendMail.mock.calls[0])).toBe("[TEST] Action required");
  });

  it("leaves production mail untouched", async () => {
    await deliverWorkflowEmail("tok", MESSAGE, CONTEXT);
    expect(recipientsOf(sendMail.mock.calls[0])).toEqual(["hod@pmw-group.com", "safety@pmw-group.com"]);
  });
});

describe("reissueReviewLink and test runs", () => {
  const NOW = new Date("2026-09-01T12:00:00Z");
  const ACTIVATED = { L2_NotifyEmails: "reviewer@contractor.example; safety@contractor.example", L2_Email: "reviewer@contractor.example" };

  function params(fields: Record<string, unknown>) {
    return {
      graphToken: "tok",
      responseListName: "HIRA Assessment",
      responseItemId: "7",
      fields,
      layerNumber: 2,
      layer: { type: "approval", authMode: "public", publicToken: "pub-tok" },
      formTitle: "HIRA Assessment",
      formSlug: "hira-assessment",
      totalLayers: 3,
      baseUrl: "https://example.com",
      now: NOW,
    };
  }

  it("sends a reissued link on a test row to the test address", async () => {
    await reissueReviewLink(params({ ...ACTIVATED, IsTest: "true", TestEmail: "tester@pmw-group.com" }));
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(recipientsOf(sendMail.mock.calls[0])).toEqual(["tester@pmw-group.com"]);
  });

  it("sends nothing at all for a test row with no usable address", async () => {
    await reissueReviewLink(params({ ...ACTIVATED, IsTest: "true", TestEmail: "" }));
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("leaves an ordinary row's reissued link unchanged", async () => {
    await reissueReviewLink(params({ ...ACTIVATED }));
    expect(recipientsOf(sendMail.mock.calls[0])).toEqual(["reviewer@contractor.example", "safety@contractor.example"]);
  });
});

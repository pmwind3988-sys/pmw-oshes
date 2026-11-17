/**
 * Sending a workflow email and noting it on the response row are two steps, and
 * only the first one is the email. A live PTW submission showed what happens
 * when they are treated as one: the note could not be written ("list item not
 * found"), the request answered 500, and the log named the note — so nobody
 * could tell whether the approver had actually been emailed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateListItemFields = vi.fn(async () => {});
vi.mock("./graphClient.js", () => ({
  ensureListColumns: vi.fn(async () => ({ created: [], existing: [] })),
  queryListItemById: vi.fn(async () => null),
  updateListItemFields,
}));
const logWarn = vi.fn();
vi.mock("./logger.js", () => ({ logWarn, logError: vi.fn(), logInfo: vi.fn() }));

const { deliverWorkflowEmail } = await import("./workflowEmail.js");

const MESSAGE = { to: ["approver@pmw-group.com"], subject: "Action required", body: "<p>b</p>" };
const CONTEXT = { listTitle: "PERMIT TO WORK", responseItemId: "12", layer: 2 };
const NOTE_FAILURE = new Error("Graph PATCH fields 404: itemNotFound");

beforeEach(() => {
  process.env.OSHES_FORM_EMAIL_FROM_ADDRESS = "noreply@pmw-group.com";
  updateListItemFields.mockReset();
  updateListItemFields.mockRejectedValue(NOTE_FAILURE);
  logWarn.mockReset();
});

describe("deliverWorkflowEmail when the row cannot be noted", () => {
  it("reports a delivered email as sent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 202 })));

    const entry = await deliverWorkflowEmail("tok", MESSAGE, CONTEXT);

    expect(entry.status).toBe("sent");
    expect(entry.recipient).toBe("approver@pmw-group.com");
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logWarn.mock.calls[0])).toContain("itemNotFound");
  });

  it("reports why the email failed, not why the note failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: "ErrorAccessDenied" } }), { status: 403 })));

    await expect(deliverWorkflowEmail("tok", MESSAGE, CONTEXT)).rejects.toThrow("not allowed to send as");
    expect(logWarn).toHaveBeenCalledTimes(1);
  });
});

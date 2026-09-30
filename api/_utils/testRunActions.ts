/**
 * testRunActions.ts — the authenticated half of test runs.
 *
 * Lives in `_utils` and rides on `api/submit-form.ts` as actions
 * (`mint-test-ticket`, `stamp-test-run`, `delete-test-runs`,
 * `record-test-run-step`) so the deployment does not gain a serverless
 * function; see `api/AGENTS.md`.
 *
 * Column provisioning happens at mint time rather than at submit time for a
 * reason that is easy to get wrong: the app-only credential the submit path
 * uses cannot create columns on this tenant. Only a signed-in form builder's
 * delegated SharePoint token can, and a mint request is the one moment in the
 * feature where such a token is in hand.
 *
 * Every handler here re-derives the response list from the form's slug on the
 * server. A caller-supplied `listTitle` is never trusted: these handlers run on
 * an app-only token that can reach every list on the site.
 *
 * Ported from pmw-hrform (`api/_utils/testRunActions.ts`). The owner check is
 * OSHES's own form-builder gate (`formBuilderAccess.ts`), not HR's.
 */
import { mintTestTicket, verifyTestTicket, testRunFieldsFor, isTestRow } from "./testRun.js";
import { appendTestRunStep, TEST_RUN_LOG_FIELD, type TestRunStep, type TestRunStepStatus } from "./testRunTrail.js";
import { logWarn } from "./logger.js";
import { REFERENCE_NO_FIELD } from "./referenceNumber.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ActionResult {
  status: number;
  payload: Record<string, unknown>;
}

export interface MintTestTicketDeps {
  /** The caller's sign-in address when they are a form builder, else null. */
  resolveOwner(delegatedToken: string): Promise<string | null>;
  /** The response list a slug's form writes to, looked up on the server. */
  resolveListTitleForSlug(slug: string): Promise<string | null>;
  /** Provisions `IsTest`, `TestEmail` and `TestRunLog` with the delegated token. */
  ensureColumns(delegatedToken: string, listTitle: string): Promise<void>;
}

export async function handleMintTestTicket(
  body: Record<string, unknown>,
  deps: MintTestTicketDeps,
): Promise<ActionResult> {
  const delegatedToken = String(body.delegatedToken ?? "").trim();
  if (!delegatedToken) return { status: 401, payload: { error: "Sign in to start a test run." } };

  const owner = await deps.resolveOwner(delegatedToken);
  if (!owner) return { status: 403, payload: { error: "Only a form builder can start a test run." } };

  const slug = String(body.slug ?? "").trim();
  if (!slug) return { status: 400, payload: { error: "A form is required to start a test run." } };

  const testEmail = String(body.testEmail ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(testEmail)) {
    return { status: 400, payload: { error: "Enter a valid email address to receive the test run." } };
  }

  const listTitle = await deps.resolveListTitleForSlug(slug);
  if (!listTitle) return { status: 400, payload: { error: "This form could not be found." } };

  try {
    await deps.ensureColumns(delegatedToken, listTitle);
  } catch (error) {
    return {
      status: 500,
      payload: {
        error: "Could not prepare this form's response list for test runs.",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }

  return { status: 200, payload: { ticket: mintTestTicket({ slug, testEmail, issuedBy: owner }) } };
}

export interface TestRunStepDeps {
  readItem(token: string, listTitle: string, itemId: string): Promise<{ fields: Record<string, unknown> } | null>;
  updateFields(token: string, listTitle: string, itemId: string, fields: Record<string, unknown>): Promise<unknown>;
}

export interface StampTestRunDeps extends TestRunStepDeps {
  resolveListTitleForSlug(slug: string): Promise<string | null>;
}

/**
 * Flags a just-created response row as a test run, for the signed-in path.
 *
 * A signed-in submission writes its row straight to SharePoint from the
 * browser, so it never passes through the anonymous submit flow that stamps
 * `IsTest`/`TestEmail` at create time. The browser must never be trusted to
 * assert test-ness itself — a client that could set `IsTest` with an arbitrary
 * `TestEmail` on any row could divert a real approval's mail — so the only
 * values written here are re-derived from a ticket verified on the server.
 *
 * Bound three ways, because the ticket lives four hours and is not single use:
 * to the ticket's own slug (the list is looked up from it, `body.listTitle` is
 * ignored), to a row that exists in that list, and to a row submitted by the
 * person the ticket was issued to and not already flagged. Anything else is
 * refused and the row is left exactly as it was.
 */
export async function handleStampTestRun(
  token: string,
  body: Record<string, unknown>,
  deps: StampTestRunDeps,
): Promise<ActionResult> {
  const itemId = String(body.itemId ?? "").trim();
  const slug = String(body.slug ?? "").trim();
  if (!itemId || !/^\d+$/.test(itemId) || !slug) {
    return { status: 400, payload: { error: "A response row and slug are required to mark a test run." } };
  }

  const ticket = verifyTestTicket(body.testTicket, slug);
  if (!ticket) {
    logWarn("api:test-run", "Refused to stamp a test run: the test ticket is invalid or expired", { slug });
    return { status: 400, payload: { error: "This test ticket is invalid or has expired." } };
  }

  const listTitle = await deps.resolveListTitleForSlug(ticket.slug);
  if (!listTitle) return { status: 400, payload: { error: "This test ticket's form could not be found." } };

  const row = await deps.readItem(token, listTitle, itemId);
  if (!row) {
    logWarn("api:test-run", "Refused to stamp a test run: the row does not exist in the ticket's own list", { listTitle, itemId });
    return { status: 400, payload: { error: "That submission could not be found in this form's response list." } };
  }
  if (isTestRow(row.fields)) {
    logWarn("api:test-run", "Refused to stamp a test run: the row is already flagged", { listTitle, itemId });
    return { status: 400, payload: { error: "That submission is already marked as a test run." } };
  }
  const submittedBy = String(row.fields.SubmittedBy ?? "").trim().toLowerCase();
  if (!submittedBy || submittedBy !== ticket.issuedBy) {
    logWarn("api:test-run", "Refused to stamp a test run: the row was not submitted by the ticket holder", { listTitle, itemId });
    return { status: 400, payload: { error: "That submission does not belong to this test run." } };
  }

  await deps.updateFields(token, listTitle, itemId, testRunFieldsFor(ticket));

  // Same step ids and order numbers the anonymous path writes, so both read as
  // one checklist vocabulary.
  const referenceNo = String(row.fields[REFERENCE_NO_FIELD] ?? "").trim();
  await recordTestRunSteps(token, listTitle, itemId, [
    { step: "ticket", label: "Test ticket validated", status: "pass", detail: `Issued by ${ticket.issuedBy}`, order: 1 },
    {
      step: "row",
      label: "Response row created",
      status: "pass",
      detail: referenceNo ? `Item ${itemId} (${referenceNo})` : `Item ${itemId}`,
      order: 4,
    },
  ], deps);

  return { status: 200, payload: { ok: true } };
}

/**
 * Appends one step to a run's trail, and swallows anything that goes wrong.
 * The trail is a report on the submission, not part of it.
 */
export async function recordTestRunStep(
  token: string,
  listTitle: string,
  itemId: string,
  step: Omit<TestRunStep, "at">,
  deps: TestRunStepDeps,
): Promise<void> {
  return recordTestRunSteps(token, listTitle, itemId, [step], deps);
}

/**
 * Appends several steps in one read and one write. Same never-throws contract
 * as `recordTestRunStep`: a rehearsal must not fail because its report did.
 */
export async function recordTestRunSteps(
  token: string,
  listTitle: string,
  itemId: string,
  steps: Omit<TestRunStep, "at">[],
  deps: TestRunStepDeps,
): Promise<void> {
  if (steps.length === 0) return;
  try {
    const item = await deps.readItem(token, listTitle, itemId);
    let raw: unknown = item?.fields?.[TEST_RUN_LOG_FIELD];
    for (const step of steps) raw = appendTestRunStep(raw, step);
    await deps.updateFields(token, listTitle, itemId, { [TEST_RUN_LOG_FIELD]: raw });
  } catch (error) {
    logWarn("api:test-run", "Could not record test run steps", {
      listTitle,
      steps: steps.map((step) => step.step).join(", "),
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

const TEST_RUN_STEP_STATUSES: TestRunStepStatus[] = ["pass", "fail", "warn", "skip", "pending"];

/**
 * Whitelists a `record-test-run-step` body before it reaches the trail, which
 * stores whatever it is given verbatim.
 */
export function validateTestRunStepInput(value: unknown): Omit<TestRunStep, "at"> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.step !== "string" || !record.step.trim() || record.step.length > 64) return null;
  if (typeof record.label !== "string" || !record.label.trim() || record.label.length > 200) return null;
  if (typeof record.status !== "string" || !TEST_RUN_STEP_STATUSES.includes(record.status as TestRunStepStatus)) return null;
  if (record.detail !== undefined && (typeof record.detail !== "string" || record.detail.length > 500)) return null;
  if (record.order !== undefined && (typeof record.order !== "number" || !Number.isFinite(record.order))) return null;
  return {
    step: record.step,
    label: record.label,
    status: record.status as TestRunStepStatus,
    detail: typeof record.detail === "string" ? record.detail : undefined,
    order: typeof record.order === "number" ? record.order : 0,
  };
}

export interface RecordTestRunStepDeps extends TestRunStepDeps {
  resolveOwner(delegatedToken: string): Promise<string | null>;
  resolveListTitleForSlug(slug: string): Promise<string | null>;
}

/**
 * The browser records the one step only it can perform (rendering the PDF).
 * Form builders only, against a slug-resolved list, and only on a row that is
 * already flagged `IsTest`.
 */
export async function handleRecordTestRunStep(
  token: string,
  body: Record<string, unknown>,
  deps: RecordTestRunStepDeps,
): Promise<ActionResult> {
  const delegatedToken = String(body.delegatedToken ?? "").trim();
  if (!delegatedToken) return { status: 401, payload: { error: "Sign in to record a test run step." } };
  const owner = await deps.resolveOwner(delegatedToken);
  if (!owner) return { status: 403, payload: { error: "Only a form builder can record a test run step." } };

  const slug = String(body.slug ?? "").trim();
  const itemId = String(body.itemId ?? "").trim();
  const step = validateTestRunStepInput(body.step);
  if (!slug || !/^\d+$/.test(itemId) || !step) {
    return { status: 400, payload: { error: "A response row and a valid step are required to record a test run step." } };
  }

  const listTitle = await deps.resolveListTitleForSlug(slug);
  if (!listTitle) return { status: 400, payload: { error: "This form could not be found." } };

  const item = await deps.readItem(token, listTitle, itemId);
  if (!item || !isTestRow(item.fields)) {
    return { status: 400, payload: { error: "That submission is not a test run." } };
  }
  await recordTestRunStep(token, listTitle, itemId, step, deps);
  return { status: 200, payload: { ok: true } };
}

export interface DeleteTestRunsDeps {
  resolveOwner(delegatedToken: string): Promise<string | null>;
  resolveListTitleForSlug(slug: string): Promise<string | null>;
  listRows(listTitle: string): Promise<{ id: string; fields: Record<string, unknown> }[]>;
  deleteRow(listTitle: string, id: string): Promise<void>;
}

/**
 * Deletes test-run rows from a form's response list, all of them or one.
 *
 * Destructive and driven by an id the browser sends, so the row is always
 * re-read from SharePoint and re-checked with `isTestRow` here — without that,
 * `itemId` would permanently delete any submission, production included.
 */
export async function handleDeleteTestRuns(
  body: Record<string, unknown>,
  deps: DeleteTestRunsDeps,
): Promise<ActionResult> {
  const delegatedToken = String(body.delegatedToken ?? "").trim();
  if (!delegatedToken) return { status: 401, payload: { error: "Sign in to delete test runs." } };

  const owner = await deps.resolveOwner(delegatedToken);
  if (!owner) return { status: 403, payload: { error: "Only a form builder can delete test runs." } };

  const slug = String(body.slug ?? "").trim();
  if (!slug) return { status: 400, payload: { error: "A form is required to delete test runs." } };

  const listTitle = await deps.resolveListTitleForSlug(slug);
  if (!listTitle) return { status: 400, payload: { error: "This form could not be found." } };

  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  const rows = await deps.listRows(listTitle);

  if (itemId) {
    const row = rows.find((candidate) => candidate.id === itemId);
    if (!row || !isTestRow(row.fields)) {
      return { status: 400, payload: { error: "That submission is not a test run and cannot be deleted here." } };
    }
    await deps.deleteRow(listTitle, itemId);
    return { status: 200, payload: { deleted: [itemId] } };
  }

  const testRows = rows.filter((row) => isTestRow(row.fields));
  for (const row of testRows) await deps.deleteRow(listTitle, row.id);
  return { status: 200, payload: { deleted: testRows.map((row) => row.id) } };
}

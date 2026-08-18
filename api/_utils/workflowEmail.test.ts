import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildWorkflowActionEmail,
  isPublicReviewLink,
  recordWorkflowEmailAttempt,
  resolveWorkflowEmailDueAt,
  getDueWorkflowEmailSchedules,
  setWorkflowEmailSchedule,
} from "./workflowEmail.js";

describe("recordWorkflowEmailAttempt", () => {
  it("replaces a failed delivery with a successful forced resend while preserving the attempt count", () => {
    const failed = recordWorkflowEmailAttempt("", {
      layer: 2,
      recipient: "evaluator@example.com",
      status: "failed",
      attemptedAt: "2026-06-24T01:00:00.000Z",
      error: "Email delivery failed",
    });

    const resent = recordWorkflowEmailAttempt(JSON.stringify(failed), {
      layer: 2,
      recipient: "evaluator@example.com",
      status: "sent",
      attemptedAt: "2026-06-24T01:05:00.000Z",
    });

    expect(resent["2"]).toEqual({
      layer: 2,
      recipient: "evaluator@example.com",
      status: "sent",
      attempts: 2,
      lastAttemptAt: "2026-06-24T01:05:00.000Z",
      sentAt: "2026-06-24T01:05:00.000Z",
    });
  });
});

describe("workflow email schedules", () => {
  it("supports a three-month deferred evaluator email", () => {
    expect(resolveWorkflowEmailDueAt(
      { mode: "three_months" },
      new Date("2026-01-31T08:00:00.000Z"),
    )).toBe("2026-04-30T08:00:00.000Z");
  });

  it("replaces the schedule for one item layer without changing other layers", () => {
    const initial = setWorkflowEmailSchedule("", {
      layer: 1,
      recipient: "first@example.com",
      dueAt: "2026-07-01T00:00:00.000Z",
      status: "scheduled",
      updatedAt: "2026-06-24T00:00:00.000Z",
      layerType: "evaluation",
      totalLayers: 2,
      reviewLink: "https://example.com/eval/1",
      submittedBy: "submitter@example.com",
    });
    const updated = setWorkflowEmailSchedule(JSON.stringify(initial), {
      layer: 2,
      recipient: "hod@example.com",
      dueAt: "2026-09-24T00:00:00.000Z",
      status: "scheduled",
      updatedAt: "2026-06-24T00:00:00.000Z",
      layerType: "evaluation",
      totalLayers: 2,
      reviewLink: "https://example.com/eval/2",
      submittedBy: "submitter@example.com",
    });

    expect(Object.keys(updated)).toEqual(["1", "2"]);
  });

  it("returns only due scheduled entries", () => {
    const raw = JSON.stringify({
      "1": {
        layer: 1,
        recipient: "due@example.com",
        dueAt: "2026-06-24T07:59:00.000Z",
        status: "scheduled",
        updatedAt: "2026-06-24T00:00:00.000Z",
        layerType: "evaluation",
        totalLayers: 2,
        reviewLink: "https://example.com/1",
        submittedBy: "submitter@example.com",
      },
      "2": {
        layer: 2,
        recipient: "later@example.com",
        dueAt: "2026-06-25T08:00:00.000Z",
        status: "scheduled",
        updatedAt: "2026-06-24T00:00:00.000Z",
        layerType: "evaluation",
        totalLayers: 2,
        reviewLink: "https://example.com/2",
        submittedBy: "submitter@example.com",
      },
    });

    expect(getDueWorkflowEmailSchedules(raw, new Date("2026-06-24T08:00:00.000Z")))
      .toHaveLength(1);
  });
});

describe("isPublicReviewLink", () => {
  it("recognises a token link and rejects a slug/item/layer link", () => {
    expect(isPublicReviewLink("https://pmw-oshes.vercel.app/eval/abc123?item=42")).toBe(true);
    expect(isPublicReviewLink("https://pmw-oshes.vercel.app/eval/hira-form/42/2")).toBe(false);
    expect(isPublicReviewLink("not a url")).toBe(false);
  });
});

describe("buildWorkflowActionEmail", () => {
  const base = {
    formTitle: "HIRA Assessment",
    submittedBy: "submitter@example.com",
    responseItemId: 42,
    layer: 2,
    totalLayers: 3,
    recipient: "reviewer@example.com",
    layerType: "approval" as const,
    submittedAt: "2026-06-24T01:00:00.000Z",
  };

  beforeEach(() => {
    process.env.APP_BASE_URL = "https://pmw-oshes.vercel.app";
  });
  afterEach(() => {
    delete process.env.APP_BASE_URL;
  });

  it("puts the reference in the subject and body", () => {
    const email = buildWorkflowActionEmail({
      ...base,
      reviewLink: "https://pmw-oshes.vercel.app/eval/abc/42/2",
      authMode: "365",
      referenceNo: "OSH-040826-0007",
    });
    expect(email.subject).toContain("[OSH-040826-0007]");
    expect(email.body).toContain("Reference no.");
    expect(email.body).toContain("OSH-040826-0007");
  });

  it("carries the reference into a public layer's subject too", () => {
    const email = buildWorkflowActionEmail({
      ...base,
      reviewLink: "https://pmw-oshes.vercel.app/eval/abc123?item=42",
      authMode: "public",
      referenceNo: "OSH-040826-0007",
    });
    expect(email.subject).toContain("[OSH-040826-0007]");
  });

  it("leaves the subject and body unchanged when the form issues no reference", () => {
    const email = buildWorkflowActionEmail({
      ...base,
      reviewLink: "https://pmw-oshes.vercel.app/eval/abc/42/2",
      authMode: "365",
    });
    expect(email.subject).not.toContain("[");
    expect(email.body).not.toContain("Reference no.");
  });

  it("treats a blank reference as absent rather than printing empty brackets", () => {
    const email = buildWorkflowActionEmail({
      ...base,
      reviewLink: "https://pmw-oshes.vercel.app/eval/abc/42/2",
      authMode: "365",
      referenceNo: "   ",
    });
    expect(email.subject).not.toContain("[");
    expect(email.body).not.toContain("Reference no.");
  });

  it("leads a public layer with a copy button pointing at the share page", () => {
    const reviewLink = "https://pmw-oshes.vercel.app/eval/abc123?item=42";
    const email = buildWorkflowActionEmail({ ...base, reviewLink, authMode: "public" });

    expect(email.subject).toBe(
      "Action required: share the approval link for HIRA Assessment",
    );
    expect(email.body).toContain(
      `href="https://pmw-oshes.vercel.app/share-link?u=${encodeURIComponent(reviewLink)}"`,
    );
    expect(email.body).toContain("Copy review link");
    // The raw link is printed too, so a reader can copy it without leaving the mail.
    expect(email.body).toContain("/eval/abc123?item=42");
    expect(email.body).toContain("Public link — no sign-in needed");
  });

  it("centres a single open button for a 365 layer and never offers the share page", () => {
    const reviewLink = "https://pmw-oshes.vercel.app/eval/hira-form/42/2";
    const email = buildWorkflowActionEmail({ ...base, reviewLink, authMode: "365" });

    expect(email.subject).toBe("Action required: HIRA Assessment needs your approval");
    expect(email.body).not.toContain("/share-link?u=");
    expect(email.body).not.toContain("Copy review link");
    expect(email.body).toContain(`<td align="center" style="padding:22px 0 0">`);
    expect(email.body).toContain(">Open approval</a>");
    expect(email.body).toContain("PMW OSHE account sign-in");
  });

  it("falls back to the link shape when a stored schedule entry has no authMode", () => {
    const email = buildWorkflowActionEmail({
      ...base,
      reviewLink: "https://pmw-oshes.vercel.app/eval/abc123?item=42",
    });

    expect(email.body).toContain("/share-link?u=");
  });

  it("carries the comprehensive submission details every variant shares", () => {
    const email = buildWorkflowActionEmail({
      ...base,
      layerType: "evaluation",
      reviewLink: "https://pmw-oshes.vercel.app/eval/hira-form/42/2",
      authMode: "365",
    });

    for (const label of [
      "Form",
      "Submission ID",
      "Submitted by",
      "Submitted on",
      "Workflow stage",
      "Step type",
      "Action needed",
      "Access",
    ]) {
      expect(email.body).toContain(`>${label}</td>`);
    }
    expect(email.body).toContain("#42");
    expect(email.body).toContain("Layer 2 of 3");
    expect(email.body).toContain("24 Jun 2026, 09:00 (MYT)");
    expect(email.body).toContain("@media only screen and (max-width:600px)");
  });
});

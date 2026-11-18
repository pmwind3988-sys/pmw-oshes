import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PortalProvider, type PortalContextValue } from "../../contexts/PortalContext";
import { fixtureContext } from "../../devPreview/fixtures";
import { recordKey } from "../../utils/portalRecords";
import { allowedScreens, canConfirmDelete, derivePortalAccess } from "../../utils/portalRole";
import type { PortalRecord, PortalRole } from "../../types";
import RecordPage from "./RecordPage";

/**
 * The record page, read as markup: what each account is offered on it.
 *
 * Interaction (the dialogs opening, the writes) is not exercised here: the test
 * environment renders static markup only. Those paths are checked in the browser.
 */

function pageFor(role: PortalRole, record: PortalRecord): string {
  const value: PortalContextValue = fixtureContext(role, { drawerRef: recordKey(record) });
  return renderToStaticMarkup(
    <PortalProvider {...value}>
      <RecordPage />
    </PortalProvider>,
  );
}

function fixtureRecords(role: PortalRole): PortalRecord[] {
  return fixtureContext(role).records;
}

describe("record page actions", () => {
  const inFlight = fixtureRecords("admin").find((record) => record.hasWorkflow && !record.done && !record.returned);

  it("offers an administrator the More actions menu on a record still in flight", () => {
    expect(inFlight).toBeDefined();
    const markup = pageFor("admin", inFlight!);

    // "Change who signs" lives inside the ⋯ menu, which is closed in static markup,
    // so the menu's trigger is what can be asserted here.
    expect(markup).toContain('aria-label="More actions"');
  });

  it("offers no More actions trigger on a record with nothing to reassign, withdraw or delete", () => {
    // The ⋯ menu is empty for an account with no gates open, so its trigger is not drawn.
    // The menu's contents are tested directly in recordDisplay.test.ts.
    const auditorRecord = fixtureRecords("auditor")[0];
    expect(pageFor("auditor", auditorRecord)).not.toContain('aria-label="More actions"');
  });

  it("names the filer, not the approver, as who a returned form waits on", () => {
    const returned = fixtureRecords("admin").find((record) => record.returned);
    expect(returned).toBeDefined();
    expect(pageFor("admin", returned!)).toContain("(to fix and resend)");
  });

  it("offers an auditor no action buttons at all", () => {
    expect(inFlight).toBeDefined();
    const markup = pageFor("auditor", inFlight!);

    expect(markup).not.toContain("Change who signs");
    expect(markup).not.toContain("Approve and sign");
    expect(markup).not.toContain("Evaluate and release");
    expect(markup).not.toContain("aria-label=\"More actions\"");
    // The read-only PDF download stays available.
    expect(markup).toContain("Download PDF");
  });
});

describe("record page layout", () => {
  const record = fixtureRecords("admin")[0];

  it("shows the breadcrumb as Submissions, the form, then the reference", () => {
    const markup = pageFor("admin", record);

    expect(markup).toContain('aria-label="Breadcrumb"');
    expect(markup).toContain("Submissions");
    expect(markup).toContain(record.formName);
    expect(markup).toContain(record.reference);
    expect(markup.indexOf("Submissions")).toBeLessThan(markup.indexOf(record.formName));
    expect(markup.indexOf(record.formName)).toBeLessThan(markup.indexOf(record.reference));
  });

  it("leaves the Due row out for a form with no SLA", () => {
    const withoutSla = fixtureRecords("admin").find((item) => !item.hasSla);
    expect(withoutSla).toBeDefined();
    const markup = pageFor("admin", withoutSla!);

    expect(markup).not.toContain(">Due<");
  });

  it("shows the Due row for a form with an SLA", () => {
    const withSla = fixtureRecords("admin").find((item) => item.hasSla);
    expect(withSla).toBeDefined();
    const markup = pageFor("admin", withSla!);

    expect(markup).toContain(">Due<");
  });

  it("says so when the record cannot be found", () => {
    const value = fixtureContext("admin", { drawerRef: "No Such Form::999" });
    const markup = renderToStaticMarkup(
      <PortalProvider {...value}>
        <RecordPage />
      </PortalProvider>,
    );

    expect(markup).toContain("We cannot find that");
    expect(markup).toContain("It may have been deleted, or you may not have access.");
    expect(markup).toContain("Back to submissions");
  });
});

describe("delete confirmation", () => {
  it("stays disarmed until the reference is typed", () => {
    expect(canConfirmDelete("", "PTW-0417")).toBe(false);
    expect(canConfirmDelete("PTW-041", "PTW-0417")).toBe(false);
  });

  it("arms once the reference is typed, ignoring case and surrounding spaces", () => {
    expect(canConfirmDelete("PTW-0417", "PTW-0417")).toBe(true);
    expect(canConfirmDelete("  ptw-0417 ", "PTW-0417")).toBe(true);
  });

  it("never arms against an empty reference", () => {
    expect(canConfirmDelete("", "")).toBe(false);
  });
});

describe("record screen reachability", () => {
  it("is on the list of allowed screens for every kind of account", () => {
    const base = { userEmail: "someone@example.com", catalogue: [], records: [] };
    const accounts = [
      derivePortalAccess({ ...base, isAdmin: true, isAuditor: false }),
      derivePortalAccess({ ...base, isAdmin: false, isAuditor: true }),
      derivePortalAccess({ ...base, isAdmin: false, isAuditor: false }),
    ];

    for (const access of accounts) {
      expect(allowedScreens(access)).toContain("record");
    }
  });
});

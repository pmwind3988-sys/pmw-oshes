import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import ErrorBoundary from "../ErrorBoundary";
import SignInScreen from "./SignInScreen";
import GuestLanding from "./GuestLanding";
import LoadingScreen, { LoadingScreenBody, SLOW_AFTER_MS, isLoadSlow } from "./LoadingScreen";
import ErrorScreen from "./ErrorScreen";
import RestrictedAccessScreen from "./RestrictedAccessScreen";
import WrongTenantScreen from "./WrongTenantScreen";
import AdminGuard, { ADMIN_REDIRECT_PATH } from "./AdminGuard";

/**
 * Markup-level checks for the auth screens. There is no DOM in this test setup,
 * so clicks and effects are not run; what a reader sees and which buttons are
 * offered is checked here.
 */
const noop = () => {};

describe("sign-in and guest pages", () => {
  it("shows the welcome, the Microsoft button and the guest option", () => {
    const markup = renderToStaticMarkup(<SignInScreen onLogin={noop} />);

    expect(markup).toContain("File a safety form in a minute. See where it is at any time.");
    expect(markup).toContain("Welcome");
    expect(markup).toContain("Sign in with Microsoft 365");
    expect(markup).toContain("Continue without signing in");
    expect(markup).toContain('href="/privacy"');
  });

  it("shows the guest page with a way back to the sign-in options", () => {
    const markup = renderToStaticMarkup(<GuestLanding onLogin={noop} onForgetChoice={noop} />);

    expect(markup).toContain("Welcome");
    expect(markup).toContain("Sign in with Microsoft 365");
    expect(markup).toContain("Back to sign-in options");
    expect(markup).not.toContain("Continue without signing in");
  });
});

describe("loading and error screens", () => {
  it("shows the loading view with the status line", () => {
    const markup = renderToStaticMarkup(<LoadingScreen status="Fetching submissions" steps={[]} />);

    expect(markup).toContain("Getting things ready");
    expect(markup).toContain("Fetching submissions");
  });

  it("asks a quiet session to sign in again", () => {
    const markup = renderToStaticMarkup(
      <ErrorScreen errorMsg="Timed out" onRetry={noop} title="Re-login needed" primaryActionLabel="Re-login" primaryActionIcon="login" />,
    );

    expect(markup).toContain("You have been away a while");
    expect(markup).not.toContain("Re-login needed");
    expect(markup).toContain("Re-login");
    expect(markup).toContain("Show details");
  });

  it("shows a plain error with the message behind details", () => {
    const markup = renderToStaticMarkup(<ErrorScreen errorMsg="Network down" onRetry={noop} onSignOut={noop} />);

    expect(markup).toContain("Something went wrong");
    expect(markup).toContain("Try again");
    expect(markup).toContain("Sign out");
    expect(markup).toContain("Show details");
    expect(markup).not.toContain("Network down</pre>");
  });

  it("renders the boundary fallback as the error card", () => {
    const boundary = new ErrorBoundary({ children: null });
    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error("boom"));
    const markup = renderToStaticMarkup(<>{boundary.render()}</>);

    expect(markup).toContain("Something went wrong");
    expect(markup).toContain("Try again");
  });
});

describe("access screens", () => {
  it("explains a restricted account and offers retry or another account", () => {
    const markup = renderToStaticMarkup(
      <RestrictedAccessScreen userEmail="a@example.test" onRetry={noop} onSwitch={noop} onSignOut={noop} />,
    );

    expect(markup).toContain("No access yet");
    expect(markup).toContain("Try again");
    expect(markup).toContain("Use another account");
  });

  it("explains a wrong tenant and offers switch or sign out", () => {
    const markup = renderToStaticMarkup(<WrongTenantScreen userEmail="a@example.test" onLogout={noop} onSwitch={noop} />);

    expect(markup).toContain("Wrong account");
    expect(markup).toContain("Switch account");
    expect(markup).toContain("Sign out");
  });

  it("shows the admin notice to a non-admin", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <AdminGuard isAdmin={false}>
          <p>secret</p>
        </AdminGuard>
      </MemoryRouter>,
    );

    expect(markup).toContain("This page is for OSHES admins");
    expect(markup).not.toContain("secret");
  });

  it("sends non-admins to the portal rather than the dashboard", () => {
    expect(ADMIN_REDIRECT_PATH).toBe("/portal");
  });
});

describe("slow loading", () => {
  it("offers a way out only once the load has run long enough", () => {
    expect(isLoadSlow(SLOW_AFTER_MS - 1)).toBe(false);
    expect(isLoadSlow(SLOW_AFTER_MS)).toBe(true);
  });

  it("hides the retry notice until the load is slow", () => {
    const markup = renderToStaticMarkup(<LoadingScreenBody status="Working" slow={false} />);

    expect(markup).not.toContain("Taking longer than usual.");
    expect(markup).not.toContain("Try again");
  });

  it("shows the notice and a retry button when the load is slow", () => {
    const markup = renderToStaticMarkup(<LoadingScreenBody status="Working" slow={true} />);

    expect(markup).toContain("Taking longer than usual.");
    expect(markup).toContain("Try again");
    expect(markup).toContain("Getting things ready");
  });
});

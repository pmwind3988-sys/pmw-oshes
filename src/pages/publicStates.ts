import type { MascotMood } from "../components/simple/Mascot";

/**
 * The words, picture, announcement and actions for each full-page state a
 * public form or approval link can land on. Kept as data so the copy and the
 * state-to-screen mapping are one place and can be checked without rendering.
 */

/** A button the page knows how to wire up. The page supplies the handlers. */
export type StateAction = "tryAgain" | "backHome" | "signIn" | "report";

export interface StateButton {
  action: StateAction;
  label: string;
}

export interface FormState {
  mood: MascotMood;
  title: string;
  body: string;
  /** "alert" for failures and closed links, "status" for neutral notices. */
  role?: "alert" | "status";
  primary?: StateButton;
  secondary?: StateButton;
}

/** The states a form link can show. The loader's error kinds map onto these. */
export type PublicStateKind = "notReady" | "closed" | "expired" | "notFound" | "failed" | "signIn";

const BACK_HOME: StateButton = { action: "backHome", label: "Back to home" };

const FORM_STATES: Record<PublicStateKind, FormState> = {
  notReady: {
    mood: "closed",
    title: "This form isn't ready yet",
    body: "This link has no published form content. Please ask an OSHES Forms Owner to republish the form and share the link again.",
    role: "alert",
    secondary: BACK_HOME,
  },
  closed: {
    mood: "closed",
    title: "This form is closed",
    body: "It isn't taking responses right now. Ask the OSHES team if you think it should be open.",
    role: "alert",
    secondary: BACK_HOME,
  },
  expired: {
    mood: "expired",
    title: "This form has expired",
    body: "Its publishing period has ended. Ask the OSHES team for a current link.",
    role: "alert",
    secondary: BACK_HOME,
  },
  notFound: {
    mood: "notfound",
    title: "We couldn't find this form",
    body: "Check the link, or scan the poster again.",
    role: "alert",
    secondary: BACK_HOME,
  },
  failed: {
    mood: "error",
    title: "We couldn't load this form",
    body: "Something went wrong on the way. Try again in a moment.",
    role: "alert",
    primary: { action: "tryAgain", label: "Try again" },
    secondary: BACK_HOME,
  },
  signIn: {
    mood: "locked",
    title: "Sign in to open this form",
    body: "This form is for PMW staff only. Sign in with your work account to continue.",
    role: "status",
    primary: { action: "signIn", label: "Sign in with Microsoft 365" },
    secondary: { action: "report", label: "Report something without signing in" },
  },
};

/** The screen a public form link shows for one state. */
export function formStateFor(kind: PublicStateKind): FormState {
  return FORM_STATES[kind];
}

/** Approval link opened by someone the approval is not assigned to. */
export const NOT_YOURS_STATE = {
  mood: "locked",
  title: "This one isn't for you",
  body: "This approval is not assigned to your account.",
  role: "status",
} as const satisfies FormState;

import type { MascotMood } from "../components/simple/Mascot";

/**
 * The words and picture for each full-page state a public form or approval
 * link can land on. Kept as data so the copy is one place and each state can
 * be checked without rendering the page.
 */
export interface PublicStateCopy {
  mood: MascotMood;
  title: string;
  body: string;
}

export const FORM_STATE_COPY = {
  notReady: {
    mood: "closed",
    title: "This form isn't ready yet",
    body: "This link has no published form content. Please ask an OSHES Forms Owner to republish the form and share the link again.",
  },
  closed: {
    mood: "closed",
    title: "This form is closed",
    body: "It isn't taking responses right now. Ask the OSHES team if you think it should be open.",
  },
  expired: {
    mood: "expired",
    title: "This form has expired",
    body: "Its publishing period has ended. Ask the OSHES team for a current link.",
  },
  notFound: {
    mood: "notfound",
    title: "We couldn't find this form",
    body: "Check the link, or scan the poster again.",
  },
  failed: {
    mood: "error",
    title: "We couldn't load this form",
    body: "Something went wrong on the way. Try again in a moment.",
  },
  signIn: {
    mood: "locked",
    title: "Sign in to open this form",
    body: "This form is for PMW staff only. Sign in with your work account to continue.",
  },
} as const satisfies Record<string, PublicStateCopy>;

export type FormStateKind = keyof typeof FORM_STATE_COPY;

/** Approval link opened by someone the layer is not assigned to. */
export const NOT_YOURS_COPY = {
  mood: "locked",
  title: "This one isn't for you",
  body: "This approval is not assigned to your account.",
} as const satisfies PublicStateCopy;

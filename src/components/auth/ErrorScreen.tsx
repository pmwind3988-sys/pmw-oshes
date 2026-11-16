import { MessageCard } from "../simple/MessageCard";
import type { LoadingStep } from "./LoadingScreen";

interface ErrorScreenProps {
  errorMsg: string;
  onRetry: () => void;
  onSignOut?: () => void;
  title?: string;
  primaryActionLabel?: string;
  primaryActionIcon?: "refresh" | "login";
  /** Accepted so the caller compiles; the steps are not shown in the simple design. */
  recoverySteps?: LoadingStep[];
}

/**
 * A failed load, with one way forward. A "login" primary action means the
 * session has gone quiet, so the reader is asked to sign in again and sees the
 * "away a while" picture; anything else is a plain error. The raw error text
 * sits behind "Show details".
 */
export default function ErrorScreen({
  errorMsg,
  onRetry,
  onSignOut,
  title = "Something went wrong",
  primaryActionLabel = "Try again",
  primaryActionIcon = "refresh",
}: ErrorScreenProps) {
  const isReauth = primaryActionIcon === "login";

  return (
    <MessageCard
      mood={isReauth ? "expired" : "error"}
      title={isReauth ? "You have been away a while" : title}
      body={isReauth ? "For your safety, sign in again to pick up where you left off." : "Something did not load. Try again in a moment."}
      primary={{ label: primaryActionLabel, onClick: onRetry }}
      secondary={onSignOut ? { label: "Sign out", onClick: onSignOut } : undefined}
      details={errorMsg || undefined}
    />
  );
}

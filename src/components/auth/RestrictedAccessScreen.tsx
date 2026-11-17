import { MessageCard } from "../simple/MessageCard";

interface RestrictedAccessScreenProps {
  userEmail: string;
  onRetry: () => void;
  onSwitch: () => void;
  onSignOut: () => void;
}

/** The account signed in fine but is not set up for OSHES. The caller still passes the email and sign-out handler. */
export default function RestrictedAccessScreen({ onRetry, onSwitch }: RestrictedAccessScreenProps) {
  return (
    <MessageCard
      mood="locked"
      title="No access yet"
      body="This account is not set up for OSHES. Ask the OSHES team to add you, then try again."
      primary={{ label: "Try again", onClick: onRetry }}
      secondary={{ label: "Use another account", onClick: onSwitch }}
    />
  );
}

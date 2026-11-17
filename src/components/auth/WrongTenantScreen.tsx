import { MessageCard } from "../simple/MessageCard";

interface WrongTenantScreenProps {
  userEmail: string;
  onLogout: () => void;
  onSwitch: () => void;
}

/** Signed in with a Microsoft account from outside PMW. The caller still passes the email for context. */
export default function WrongTenantScreen({ onLogout, onSwitch }: WrongTenantScreenProps) {
  return (
    <MessageCard
      mood="switch"
      title="Wrong account"
      body="You are signed in with an account from outside PMW. Switch to your work account."
      primary={{ label: "Switch account", onClick: onSwitch }}
      secondary={{ label: "Sign out", onClick: onLogout }}
    />
  );
}

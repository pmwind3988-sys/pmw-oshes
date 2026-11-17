import { SignInPage } from "./SignInScreen";

interface GuestLandingProps {
  onLogin: () => void;
  onForgetChoice: () => void;
}

/** The sign-in page for someone who chose to carry on without signing in. */
export default function GuestLanding({ onLogin, onForgetChoice }: GuestLandingProps) {
  return (
    <SignInPage
      onSignIn={onLogin}
      secondaryAction={{ label: "Back to sign-in options", onClick: onForgetChoice }}
      smallPrint="You are not signed in. Public forms and tracking by reference no. still work."
    />
  );
}

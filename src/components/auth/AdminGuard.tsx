/**
 * AdminGuard.tsx — Route guard for admin-only pages
 *
 * Wraps admin routes and sends non-admin users to the portal with a plain
 * "for admins" message, preventing accidental access.
 */
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import theme from "../../theme";
import { OSHES_APP } from "../../config/oshes";
import { MessageCard } from "../simple/MessageCard";

/** Where a non-admin is sent. Exported so the redirect target can be tested without a DOM. */
export const ADMIN_REDIRECT_PATH = "/portal";

interface AdminGuardProps {
  isAdmin: boolean;
  restrictedTo?: string;
  children: React.ReactNode;
}

// Name the group this deployment actually checks. A hard-coded name sends the
// denied user to ask for membership of a group that may not exist.
export default function AdminGuard({
  isAdmin,
  restrictedTo = OSHES_APP.adminGroup || "the OSHES admin group",
  children,
}: AdminGuardProps) {
  const navigate = useNavigate();
  const [showRedirect, setShowRedirect] = useState(false);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (isAdmin) {
      setShowRedirect(false);
      return;
    }

    // Only trigger once — prevents re-render loops
    if (!redirectedRef.current) {
      redirectedRef.current = true;

      const redirectTimer = setTimeout(() => {
        setShowRedirect(true);
        navigate(ADMIN_REDIRECT_PATH, { replace: true });
      }, 4000);

      return () => {
        clearTimeout(redirectTimer);
      };
    }
  }, [isAdmin, navigate]);

  // While admin status is being determined, show nothing (the loading screen
  // in App.tsx handles the initial loading state)
  if (isAdmin) {
    return <>{children}</>;
  }

  if (showRedirect) {
    return null;
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MessageCard
        mood="locked"
        title="This page is for OSHES admins"
        body={`Only ${restrictedTo} can open this page. You will be taken to the portal shortly.`}
        primary={{ label: "Go to the portal", onClick: () => navigate(ADMIN_REDIRECT_PATH, { replace: true }) }}
      />
    </ThemeProvider>
  );
}

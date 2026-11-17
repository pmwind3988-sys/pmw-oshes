import { Alert, Snackbar } from "@mui/material";
import { usePortal } from "../contexts/PortalContext";
import PortalShell from "../components/portal/PortalShell";
import SubmissionDrawer from "../components/portal/SubmissionDrawer";
import HomeScreen from "./portal/HomeScreen";
import RecordsScreen from "./portal/RecordsScreen";
import PeopleScreen from "./portal/PeopleScreen";
import AuditScreen from "./portal/AuditScreen";
import SmokingLogScreen from "./portal/SmokingLogScreen";
import SettingsScreen from "./portal/SettingsScreen";

function ScreenBody() {
  const { screen, focusForm, focusStatus, focusSubsScope, searchSeedAt } = usePortal();
  switch (screen) {
    case "people":
      return <PeopleScreen />;
    case "audit":
      return <AuditScreen />;
    case "smoking":
      return <SmokingLogScreen />;
    case "settings":
      return <SettingsScreen />;
    // Manage has no page of its own yet; its tab opens Home, which links to each
    // of the pages inside it.
    case "manage":
      return <HomeScreen />;
    // Submissions. Keyed on the scope it was opened with, so arriving from a
    // pressed statistic, the shell's search box or a Home card remounts it with
    // those filters seeded. Without the key React reuses the mounted instance
    // and keeps the filter state from wherever you were last.
    case "subs":
      return <RecordsScreen key={`${focusSubsScope}-${focusForm}-${focusStatus}-${searchSeedAt}`} />;
    case "home":
    default:
      return <HomeScreen />;
  }
}

/**
 * The portal: sidebar, the current role screen, the detail drawer, and a single
 * toast slot shared by every action.
 */
export default function PortalPage({ toastMessage, onCloseToast }: { toastMessage: string; onCloseToast: () => void }) {
  return (
    <>
      <PortalShell>
        <ScreenBody />
      </PortalShell>
      <SubmissionDrawer />
      <Snackbar
        open={Boolean(toastMessage)}
        autoHideDuration={3400}
        onClose={onCloseToast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ maxWidth: 560 }}
      >
        <Alert severity="info" onClose={onCloseToast} sx={{ width: "100%" }}>
          {toastMessage}
        </Alert>
      </Snackbar>
    </>
  );
}

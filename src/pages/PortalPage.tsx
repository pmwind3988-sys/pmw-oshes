import { Alert, Snackbar } from "@mui/material";
import { usePortal } from "../contexts/PortalContext";
import PortalShell from "../components/portal/PortalShell";
import SubmissionDrawer from "../components/portal/SubmissionDrawer";
import HomeScreen from "./portal/HomeScreen";
import FormHubScreen from "./portal/FormHubScreen";
import TodayScreen from "./portal/TodayScreen";
import QueueScreen from "./portal/QueueScreen";
import RecordsScreen from "./portal/RecordsScreen";
import FileFormScreen from "./portal/FileFormScreen";
import CatalogueScreen from "./portal/CatalogueScreen";
import PeopleScreen from "./portal/PeopleScreen";
import AuditScreen from "./portal/AuditScreen";
import SettingsScreen from "./portal/SettingsScreen";

function ScreenBody() {
  const { screen, focusForm, focusStatus } = usePortal();
  switch (screen) {
    case "form":
      return <FormHubScreen />;
    case "today":
      return <TodayScreen />;
    case "queue":
      return <QueueScreen />;
    case "file":
      return <FileFormScreen />;
    case "cat":
      return <CatalogueScreen />;
    case "people":
      return <PeopleScreen />;
    case "audit":
      return <AuditScreen />;
    case "settings":
      return <SettingsScreen />;
    // Two framings of one table: what you filed, and everything you may see.
    //
    // Keyed on the scope it was opened with, so arriving from a form hub door
    // or a pressed statistic remounts the table with those filters seeded.
    // Without the key React reuses the mounted instance and keeps the filter
    // state from wherever you were last — which is how "All Permit to Work"
    // used to open showing the previous form.
    case "mine":
      return <RecordsScreen key={`mine-${focusForm}-${focusStatus}`} scope="mine" />;
    case "subs":
      return <RecordsScreen key={`all-${focusForm}-${focusStatus}`} scope="all" />;
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

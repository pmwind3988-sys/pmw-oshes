import { useEffect, useMemo, useState } from "react";
import type {
  AuditEntry,
  CatalogueEntry,
  DiscoveredList,
  LoadedConfig,
  PortalRecord,
  PortalScreen,
  SharePointClient,
  Submission,
  SurveyJson,
} from "../../types";
import { PortalProvider } from "../../contexts/PortalContext";
import PortalPage from "../../pages/PortalPage";
import { buildCatalogue, findCatalogueEntry } from "../../utils/portalCatalogue";
import { toPortalRecord, queueFor } from "../../utils/portalRecords";
import { allowedScreens, derivePortalRole, portalHome } from "../../utils/portalRole";
import { deriveAuditFromRecords, readAuditTrail, sortAudit } from "../../utils/portalAudit";
import { applySubmissionPatch } from "../../utils/portalPatch";
import { displayName, normalizeEmail, type PeopleDirectory } from "../../utils/portalPeople";
import { parseWorkflowAssignmentData } from "../../utils/workflowAssignmentData";
import { readDevRole } from "../../utils/devRoleOverride";

interface PortalContainerProps {
  userEmail: string;
  isAdmin: boolean;
  isAuditor: boolean;
  canUseFormBuilder: boolean;
  submissions: Submission[];
  visibleLists: DiscoveredList[];
  loadedConfig: LoadedConfig | null;
  spClient: SharePointClient;
  onSignOut: () => void;
  onSwitchAccount: () => void;
  onOpenBuilder: () => void;
  onRefresh: () => void;
}

/** Per-submission layer reassignments, keyed by layer number. */
function overridesOf(submission: Submission): Record<string, string> {
  const parsed = parseWorkflowAssignmentData(submission.workflowAssignmentRaw);
  const result: Record<string, string> = {};
  for (const [layer, entry] of Object.entries(parsed.layers)) {
    if (entry.source === "manual-override" && entry.email) result[layer] = entry.email;
  }
  return result;
}

/**
 * Assembles everything the role screens read: the catalogue, the derived
 * records, the role that follows from them, and the session's mutations.
 */
export default function PortalContainer({
  userEmail,
  isAdmin,
  isAuditor,
  canUseFormBuilder,
  submissions,
  visibleLists,
  loadedConfig,
  spClient,
  onSignOut,
  onSwitchAccount,
  onOpenBuilder,
  onRefresh,
}: PortalContainerProps) {
  const [patched, setPatched] = useState<Record<string, Submission>>({});
  const [catalogueOverrides, setCatalogueOverrides] = useState<Record<string, Partial<CatalogueEntry>>>({});
  const [addedForms, setAddedForms] = useState<CatalogueEntry[]>([]);
  const [sessionAudit, setSessionAudit] = useState<AuditEntry[]>([]);
  const [storedAudit, setStoredAudit] = useState<AuditEntry[]>([]);
  const [directory, setDirectory] = useState<PeopleDirectory>({});
  const [nudged, setNudged] = useState<Record<string, boolean>>({});
  const [drawerRef, setDrawerRef] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [screen, setScreenState] = useState<PortalScreen | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const users = await spClient.getSiteUsers();
        if (cancelled) return;
        const map: PeopleDirectory = {};
        for (const user of users) {
          const email = normalizeEmail(user.email);
          if (email && user.name) map[email] = user.name;
        }
        setDirectory(map);
      } catch {
        // Without the site user list the portal falls back to names derived from emails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spClient]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await readAuditTrail(spClient);
      if (!cancelled) setStoredAudit(entries);
    })();
    return () => {
      cancelled = true;
    };
  }, [spClient]);

  const effectiveSubmissions = useMemo(
    () => submissions.map((submission) => patched[`${submission.listTitle}::${submission.id}`] ?? submission),
    [submissions, patched],
  );

  const catalogue = useMemo(() => {
    const titles = new Set<string>(visibleLists.map((list) => list.title));
    for (const title of loadedConfig?.allowedTitles ?? []) titles.add(title);

    const base = buildCatalogue([...titles], loadedConfig?.layerConfigs, effectiveSubmissions, directory);
    return [...base, ...addedForms].map((entry) => ({ ...entry, ...catalogueOverrides[entry.listTitle] }));
  }, [visibleLists, loadedConfig, effectiveSubmissions, directory, addedForms, catalogueOverrides]);

  const records = useMemo<PortalRecord[]>(() => {
    return effectiveSubmissions
      .map((submission) => {
        const entry = findCatalogueEntry(catalogue, submission.listTitle);
        if (!entry) return null;
        return toPortalRecord(submission, entry, directory, overridesOf(submission));
      })
      .filter((record): record is PortalRecord => record !== null)
      .sort((a, b) => (b.filedAt?.getTime() ?? 0) - (a.filedAt?.getTime() ?? 0));
  }, [effectiveSubmissions, catalogue, directory]);

  const derivedRole = useMemo(
    () => derivePortalRole({ userEmail, isAdmin, isAuditor, catalogue, records }),
    [userEmail, isAdmin, isAuditor, catalogue, records],
  );
  const role = (import.meta.env.DEV ? readDevRole() : null) ?? derivedRole;

  const email = normalizeEmail(userEmail);
  const visibleRecords = useMemo(
    () => (role === "submitter" ? records.filter((record) => record.submitterEmail === email) : records),
    [records, role, email],
  );
  const queue = useMemo(() => queueFor(records, userEmail), [records, userEmail]);

  const audit = useMemo(
    () => sortAudit([...sessionAudit, ...storedAudit, ...deriveAuditFromRecords(records)]),
    [sessionAudit, storedAudit, records],
  );

  const surveyJsonByForm = useMemo(() => {
    const map: Record<string, SurveyJson | null> = {};
    for (const [title, versions] of Object.entries(loadedConfig?.surveyJsonByFormVersion ?? {})) {
      map[title] = Object.values(versions).find((json): json is SurveyJson => json !== null) ?? null;
    }
    return map;
  }, [loadedConfig]);

  // A deep link into a screen this role does not get lands on its own home instead.
  const permitted = allowedScreens(role);
  const activeScreen = screen && permitted.includes(screen) ? screen : portalHome(role);

  const value = {
    role,
    userEmail,
    userName: displayName(email, directory),
    userTitle: userEmail,
    isAdmin,
    canUseFormBuilder,
    spClient,
    directory,
    records,
    visibleRecords,
    queue,
    catalogue,
    audit,
    surveyJsonByForm,
    refresh: onRefresh,
    screen: activeScreen,
    setScreen: (next: PortalScreen) => setScreenState(next),
    drawerRef,
    openDrawer: (reference: string) => setDrawerRef(reference),
    closeDrawer: () => setDrawerRef(null),
    nudged,
    markNudged: (reference: string) => setNudged((current) => ({ ...current, [reference]: true })),
    applyPatch: (record: PortalRecord, fields: Record<string, unknown>) =>
      setPatched((current) => ({
        ...current,
        [`${record.listTitle}::${record.itemId}`]: applySubmissionPatch(
          current[`${record.listTitle}::${record.itemId}`] ?? record.submission,
          fields,
        ),
      })),
    appendAudit: (entry: AuditEntry) => setSessionAudit((current) => [entry, ...current]),
    updateCatalogue: (listTitle: string, changes: Partial<CatalogueEntry>) =>
      setCatalogueOverrides((current) => ({ ...current, [listTitle]: { ...current[listTitle], ...changes } })),
    addCatalogueEntry: (entry: CatalogueEntry) => setAddedForms((current) => [...current, entry]),
    toast: (message: string) => setToastMessage(message),
    onSignOut,
    onSwitchAccount,
    onOpenBuilder,
  };

  return (
    <PortalProvider {...value}>
      <PortalPage toastMessage={toastMessage} onCloseToast={() => setToastMessage("")} />
    </PortalProvider>
  );
}

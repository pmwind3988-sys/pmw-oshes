import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  AuditEntry,
  CatalogueEntry,
  DiscoveredList,
  FiledScope,
  LoadedConfig,
  ManageView,
  PortalRecord,
  PortalScreen,
  SharePointClient,
  StatFilter,
  SubsScope,
  Submission,
  SurveyJson,
} from "../../types";
import { PortalProvider } from "../../contexts/PortalContext";
import PortalPage from "../../pages/PortalPage";
import { buildCatalogue, findCatalogueEntry } from "../../utils/portalCatalogue";
import { recordKey, toPortalRecord, queueFor } from "../../utils/portalRecords";
import { allowedScreens, derivePortalAccess, portalHome } from "../../utils/portalRole";
import { readPortalDeepLink } from "../../utils/portalDeepLink";
import { DEFAULT_PORTAL_PREFS, readPortalPrefs, startScreenOf, writePortalPrefs, type PortalPrefs } from "../../utils/portalPrefs";
import { deriveAuditFromRecords, readAuditTrail, sortAudit } from "../../utils/portalAudit";
import { applySubmissionPatch } from "../../utils/portalPatch";
import { displayName, normalizeEmail, type PeopleDirectory } from "../../utils/portalPeople";
import { parseWorkflowAssignmentData } from "../../utils/workflowAssignmentData";
import { readDevRole } from "../../utils/devRoleOverride";
import { pushRecentRef } from "../../utils/portalWork";

interface PortalContainerProps {
  userEmail: string;
  isAdmin: boolean;
  isAuditor: boolean;
  submissions: Submission[];
  visibleLists: DiscoveredList[];
  loadedConfig: LoadedConfig | null;
  spClient: SharePointClient;
  onSignOut: () => void;
  onRefresh: () => void;
  canRunTestRuns: boolean;
  formSlugs: Record<string, string>;
}

/** The screen and scopes a record page was opened from. */
interface ReturnPoint {
  screen: PortalScreen | null;
  formScope: string | null;
  statusScope: StatFilter | null;
  subsScope: SubsScope | null;
  filedScope: FiledScope | null;
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
  submissions,
  visibleLists,
  loadedConfig,
  spClient,
  onSignOut,
  onRefresh,
  canRunTestRuns,
  formSlugs,
}: PortalContainerProps) {
  const [patched, setPatched] = useState<Record<string, Submission>>({});
  /** Keys of records deleted this session — held until the next read from SharePoint. */
  const [deleted, setDeleted] = useState<Record<string, true>>({});
  const [catalogueOverrides, setCatalogueOverrides] = useState<Record<string, Partial<CatalogueEntry>>>({});
  const [sessionAudit, setSessionAudit] = useState<AuditEntry[]>([]);
  const [storedAudit, setStoredAudit] = useState<AuditEntry[]>([]);
  const [directory, setDirectory] = useState<PeopleDirectory>({});
  const [nudged, setNudged] = useState<Record<string, boolean>>({});
  // A portal link is read once, when the portal mounts, and its address is then
  // cleared so a refresh does not repeat it. The page it names opens at once;
  // the record it names opens on the record page as soon as that record has loaded.
  const location = useLocation();
  const navigate = useNavigate();
  const [deepLink] = useState(() => readPortalDeepLink(location.search));
  useEffect(() => {
    if (location.search) navigate({ search: "" }, { replace: true });
  }, [location.search, navigate]);

  /** Null until a record is opened from the portal; then the record key it shows, or null when none. */
  const [drawerChoice, setDrawerChoice] = useState<{ ref: string | null } | null>(null);
  /** Where the record page was opened from, so leaving it returns there. Null after a deep link or a nav click. */
  const [returnTo, setReturnTo] = useState<ReturnPoint | null>(null);
  const [recentRefs, setRecentRefs] = useState<string[]>([]);
  const [manageView, setManageView] = useState<ManageView>("overview");
  const [toastMessage, setToastMessage] = useState("");
  const [screen, setScreenState] = useState<PortalScreen | null>(() =>
    deepLink.form && deepLink.item ? "record" : (deepLink.screen ?? null),
  );
  const [focusForm, setFocusForm] = useState<string | null>(() => deepLink.form ?? null);
  const [focusStatus, setFocusStatus] = useState<StatFilter | null>(null);
  const [focusSubsScope, setFocusSubsScope] = useState<SubsScope | null>(() => deepLink.scope ?? null);
  const [focusFiled, setFocusFiled] = useState<FiledScope | null>(null);
  const [search, setSearch] = useState<{ query: string; at: number }>({ query: "", at: 0 });
  const [prefs, setPrefsState] = useState<PortalPrefs>(() =>
    typeof window === "undefined" ? DEFAULT_PORTAL_PREFS : readPortalPrefs(),
  );

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

  // Everything the portal shows is derived from this one set, so a deletion
  // removed here disappears from the records table, the queue and every
  // statistic at once — there is no second place holding a stale copy.
  const effectiveSubmissions = useMemo(
    () =>
      submissions
        .filter((submission) => !deleted[`${submission.listTitle}::${submission.id}`])
        .map((submission) => patched[`${submission.listTitle}::${submission.id}`] ?? submission),
    [submissions, patched, deleted],
  );

  const catalogue = useMemo(() => {
    const titles = new Set<string>(visibleLists.map((list) => list.title));
    for (const title of loadedConfig?.allowedTitles ?? []) titles.add(title);

    const base = buildCatalogue({
      listTitles: [...titles],
      layerConfigs: loadedConfig?.layerConfigs,
      submissions: effectiveSubmissions,
      visibility: loadedConfig?.formVisibility,
      slugs: loadedConfig?.formSlugMap,
      directory,
    });
    return base.map((entry) => ({ ...entry, ...catalogueOverrides[entry.listTitle] }));
  }, [visibleLists, loadedConfig, effectiveSubmissions, directory, catalogueOverrides]);

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

  const derivedAccess = useMemo(
    () => derivePortalAccess({ userEmail, isAdmin, isAuditor, catalogue, records }),
    [userEmail, isAdmin, isAuditor, catalogue, records],
  );

  // The dev override still names a role; the capabilities that role implies are
  // rebuilt from it, so overriding to "approver" also drops the admin screens.
  const devRole = import.meta.env.DEV ? readDevRole() : null;
  const access = useMemo(() => {
    if (!devRole || devRole === derivedAccess.role) return derivedAccess;
    return derivePortalAccess({
      userEmail,
      isAdmin: devRole === "admin",
      isAuditor: devRole === "auditor",
      catalogue,
      records,
    });
  }, [devRole, derivedAccess, userEmail, catalogue, records]);
  const role = access.role;

  const email = normalizeEmail(userEmail);
  const myRecords = useMemo(
    () => records.filter((record) => record.submitterEmail === email),
    [records, email],
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

  // The linked record, once it is in the loaded set. Until a record is opened
  // from the portal, it is the one the record page shows.
  const linkedRecord =
    deepLink.form && deepLink.item
      ? records.find((item) => item.listTitle === deepLink.form && item.itemId === deepLink.item)
      : undefined;
  const drawerRef = drawerChoice ? drawerChoice.ref : linkedRecord ? recordKey(linkedRecord) : null;

  // A screen this account cannot reach — a stale preference, or a link shared
  // between two different kinds of account — lands on Home instead.
  const permitted = allowedScreens(access);
  const start = startScreenOf(prefs.startScreen);
  const preferredStart = permitted.includes(start) ? start : portalHome();
  const activeScreen = screen && permitted.includes(screen) ? screen : preferredStart;

  const setPrefs = (changes: Partial<PortalPrefs>) =>
    setPrefsState((current) => {
      const next = { ...current, ...changes };
      writePortalPrefs(next);
      return next;
    });

  /** Leave the record page for the screen it was opened from. */
  const leaveRecord = () => {
    setScreenState(returnTo?.screen ?? null);
    setFocusForm(returnTo?.formScope ?? null);
    setFocusStatus(returnTo?.statusScope ?? null);
    setFocusSubsScope(returnTo?.subsScope ?? null);
    setFocusFiled(returnTo?.filedScope ?? null);
    setReturnTo(null);
    setDrawerChoice({ ref: null });
  };

  const value = {
    role,
    access,
    userEmail,
    userName: displayName(email, directory),
    userTitle: userEmail,
    isAdmin,
    spClient,
    directory,
    records,
    myRecords,
    queue,
    catalogue,
    audit,
    surveyJsonByForm,
    refresh: onRefresh,
    screen: activeScreen,
    setScreen: (
      next: PortalScreen,
      formScope: string | null = null,
      statusScope: StatFilter | null = null,
      subsScope: SubsScope | null = null,
      filedScope: FiledScope | null = null,
    ) => {
      setScreenState(next);
      setManageView("overview");
      setFocusForm(formScope);
      setFocusStatus(statusScope);
      setFocusSubsScope(subsScope);
      setFocusFiled(filedScope);
      // A deliberate navigation is not a way back from a record, and it closes any open one.
      setReturnTo(null);
      setDrawerChoice({ ref: null });
      // Any deliberate navigation drops the search, for the same reason it drops
      // the form scope: clicking "All submissions" must show all submissions,
      // not the last thing that was typed into the bar.
      setSearch({ query: "", at: 0 });
    },
    // A form hub with no form is the form picker, so a stale scope can never
    // strand the screen on a form this account can no longer see.
    focusForm: focusForm && catalogue.some((entry) => entry.listTitle === focusForm) ? focusForm : null,
    focusStatus,
    focusSubsScope,
    focusFiled,
    searchSeed: search.query,
    searchSeedAt: search.at,
    // Searching is a navigation: it takes you to the table that can answer,
    // unscoped, rather than filtering whichever screen happened to be open.
    // `at` is what makes the same words twice count twice — see PortalContext.
    // Deliberately calls the state setters rather than `setScreen` above, which
    // would clear the very search being submitted.
    submitSearch: (query: string) => {
      setSearch({ query, at: Date.now() });
      setScreenState("subs");
      setFocusForm(null);
      setFocusStatus(null);
      setFocusSubsScope(null);
      setFocusFiled(null);
      setReturnTo(null);
      setDrawerChoice({ ref: null });
    },
    prefs,
    setPrefs,
    drawerRef,
    // Opening a record from a list remembers that list; opening one from the
    // record page keeps the list the reader came from in the first place.
    openDrawer: (reference: string) => {
      if (activeScreen !== "record") {
        setReturnTo({
          screen: activeScreen,
          formScope: focusForm,
          statusScope: focusStatus,
          subsScope: focusSubsScope,
          filedScope: focusFiled,
        });
      }
      setScreenState("record");
      setDrawerChoice({ ref: reference });
      setRecentRefs((current) => pushRecentRef(current, reference));
    },
    closeDrawer: leaveRecord,
    recentRefs,
    canRunTestRuns,
    formSlugs,
    manageView,
    setManageView,
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
    removeRecord: (record: PortalRecord) => {
      const key = recordKey(record);
      setDeleted((current) => ({ ...current, [key]: true }));
      // Nothing is left to show — an open drawer on a deleted record would
      // otherwise sit there rendering a submission that no longer exists.
      if (drawerRef === key) leaveRecord();
    },
    appendAudit: (entry: AuditEntry) => setSessionAudit((current) => [entry, ...current]),
    updateCatalogue: (listTitle: string, changes: Partial<CatalogueEntry>) =>
      setCatalogueOverrides((current) => ({ ...current, [listTitle]: { ...current[listTitle], ...changes } })),
    toast: (message: string) => setToastMessage(message),
    onSignOut,
  };

  return (
    <PortalProvider {...value}>
      <PortalPage toastMessage={toastMessage} onCloseToast={() => setToastMessage("")} />
    </PortalProvider>
  );
}

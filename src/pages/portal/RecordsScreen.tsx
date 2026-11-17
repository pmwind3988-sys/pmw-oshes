import { useMemo, useState, type ReactNode } from "react";
import {
  Box,
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  ArrowLeft as ArrowBackIcon,
  LayoutGrid as BoardIcon,
  Table as ListIcon,
} from "../../components/ui/Icons";
import type { Theme } from "@mui/material";
import { TINTS } from "../../theme/simple";
import { radius } from "../../theme/surfaces";
import { MessageCard } from "../../components/simple/MessageCard";
import { Pager } from "../../components/simple/Pager";
import ExportCsvButton from "../../components/portal/ExportCsvButton";
import { usePortal } from "../../contexts/PortalContext";
import { exportRecordsCsv } from "../../utils/portalExport";
import {
  boardColumns,
  doneBeyondWindow,
  formTint,
  isOnYourLayer,
  lastMovedAt,
  recordTone,
} from "../../utils/boardColumns";
import { paginate } from "../../utils/paginate";
import type { SubsView } from "../../utils/portalPrefs";
import { subsScopes } from "../../utils/portalRole";
import {
  anySla,
  filedWithin,
  matchesStatusChoice,
  recordKey,
  recordMatchesQuery,
  type FiledRange,
  type StatusChoice,
} from "../../utils/portalRecords";
import { formatAgo, hoursBetween } from "../../utils/portalTime";
import type { PortalRecord, SubsScope } from "../../types";
import SubmissionsBoard, { PersonAvatar, StatusLozenge } from "./SubmissionsBoard";

const BASE_STATUS_OPTIONS: { value: StatusChoice; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Still moving" },
  { value: "settled", label: "Done" },
  { value: "In approval", label: "In approval" },
  { value: "Past SLA", label: "Past SLA" },
  { value: "Recorded", label: "Recorded — no approval" },
  { value: "Approved", label: "Approved" },
  { value: "Returned", label: "Returned" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "Rejected", label: "Rejected" },
];

const FILED_OPTIONS: { value: FiledRange; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

const SCOPE_ORDER: SubsScope[] = ["all", "mine", "needs"];

const VIEW_OPTIONS: { value: SubsView; label: string; icon: ReactNode }[] = [
  { value: "list", label: "List", icon: <ListIcon sx={{ fontSize: 15 }} /> },
  { value: "board", label: "Board", icon: <BoardIcon sx={{ fontSize: 15 }} /> },
];

/** Filter fields in the Jira-style bar: a bordered 10px control, not an outlined form box. */
const fieldSx = {
  minWidth: { xs: "calc(50% - 6px)", sm: 170 },
  "& .MuiOutlinedInput-root": {
    minHeight: 40,
    borderRadius: radius.xs,
    backgroundColor: "background.paper",
    fontSize: 13.5,
    fontWeight: 700,
  },
  "& .MuiOutlinedInput-notchedOutline": { borderWidth: 1.5, borderColor: "divider" },
} as const;

/** A scope chip: a 40px bordered control, blue-tinted when it is the one showing. */
function chipSx(on: boolean) {
  return {
    height: 40,
    px: 1.75,
    minWidth: 0,
    borderRadius: radius.xs,
    border: "1.5px solid",
    borderColor: on ? "primary.main" : "divider",
    backgroundColor: on ? TINTS.blue : "background.paper",
    color: on ? "primary.dark" : "text.primary",
    fontSize: 13.5,
    fontWeight: 800,
    textTransform: "none",
    "&:hover": { backgroundColor: on ? TINTS.blue : "action.hover" },
  } as const;
}

const headCellSx = {
  py: 1.5,
  px: 1,
  borderBottom: "1.5px solid",
  borderColor: "divider",
  fontSize: 12,
  fontWeight: 800,
  color: "text.secondary",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
} as const;

const cellSx = { py: 1.25, px: 1, borderBottom: "none", fontSize: 13.5, verticalAlign: "middle" } as const;

const linkButtonSx = {
  p: 0,
  border: 0,
  backgroundColor: "transparent",
  font: "inherit",
  fontSize: 13.5,
  fontWeight: 800,
  color: "primary.main",
  cursor: "pointer",
  textAlign: "left",
  "&:focus-visible": { outline: "3px solid", outlineColor: (theme: Theme) => theme.palette.primary.light, outlineOffset: 2, borderRadius: radius.tag },
} as const;

const visuallyHidden = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

function sameEmail(a: string, b: string): boolean {
  return a.trim() !== "" && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** "2 d ago" within a week, the date after that. The moment is the record's last signature, or its filing. */
function updatedLabel(record: PortalRecord, now: Date): string {
  const moved = lastMovedAt(record);
  if (!moved) return "—";
  const hours = hoursBetween(moved, now);
  if (hours < 24 * 7) return formatAgo(hours);
  return moved.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });
}

/**
 * The submissions screen: a list of everything this account may see, or a
 * board of the open work. Both views share one set of scope chips and filters,
 * so switching view never changes which records are in question.
 *
 * Filters can arrive already set. A form hub door or a pressed statistic opens
 * this screen scoped to exactly what it named; PortalPage keys the screen on
 * that scope, so arriving from elsewhere remounts it with the filters seeded.
 */
export default function RecordsScreen() {
  const {
    access,
    records,
    myRecords,
    queue,
    catalogue,
    userEmail,
    userName,
    openDrawer,
    prefs,
    setPrefs,
    setScreen,
    focusForm,
    focusStatus,
    focusSubsScope,
    focusFiled,
    searchSeed,
  } = usePortal();

  const scopes = useMemo(() => subsScopes(access), [access]);
  const [scope, setScope] = useState<SubsScope>(
    focusSubsScope && scopes.includes(focusSubsScope) ? focusSubsScope : "all",
  );
  const [formFilter, setFormFilter] = useState(focusForm ?? "all");
  const [statusFilter, setStatusFilter] = useState<StatusChoice>(
    // Text from the shell's bar is unscoped by construction, so a search opens
    // on every status: hiding settled rows would drop matches the operator can
    // see no reason for. Only a plain visit honours the "hide settled" pref.
    focusStatus ?? (searchSeed ? "all" : prefs.hideSettled ? "open" : "all"),
  );
  const [filedRange, setFiledRange] = useState<FiledRange>(focusFiled ?? "any");
  // Seeded from the shell's search bar, then owned here. PortalPage keys this
  // component on `searchSeedAt`, so each submitted search remounts it.
  const [query, setQuery] = useState(searchSeed);
  const [page, setPage] = useState(1);

  const view = prefs.subsView;
  const now = new Date();

  // The SLA filter option exists only where some form actually declared an SLA.
  const slaInUse = useMemo(() => anySla(catalogue), [catalogue]);
  const statusOptions = useMemo(
    () => BASE_STATUS_OPTIONS.filter((option) => slaInUse || option.value !== "Past SLA"),
    [slaInUse],
  );

  // `records` is already scoped to what this account may see, so each scope
  // narrows it and never widens it.
  const source = scope === "mine" ? myRecords : scope === "needs" ? queue : records;

  const rows = useMemo(() => {
    const instant = new Date();
    return source.filter((record) => {
      if (formFilter !== "all" && record.listTitle !== formFilter) return false;
      if (!matchesStatusChoice(record, statusFilter)) return false;
      if (!filedWithin(record, filedRange, instant)) return false;
      return recordMatchesQuery(record, query);
    });
  }, [source, formFilter, statusFilter, filedRange, query]);

  const current = paginate(rows, page, prefs.pageSize);
  const scopedForm = catalogue.find((entry) => entry.listTitle === formFilter) ?? null;
  const openRecord = (record: PortalRecord) => openDrawer(recordKey(record));

  /** Switching to the list for the settled records the board left out. */
  const showSettledInList = () => {
    setStatusFilter("settled");
    setPage(1);
    setPrefs({ subsView: "list" });
  };

  /** Who holds a record, for the With column. Null when nobody does. */
  const withLine = (record: PortalRecord): { name: string; label: string; isYou: boolean } | null => {
    if (record.done || !record.hasWorkflow) return null;
    if (record.returned) {
      const filerIsYou = sameEmail(record.submitterEmail, userEmail);
      return { name: record.submitter, label: filerIsYou ? "You" : record.submitter, isYou: filerIsYou };
    }
    if (isOnYourLayer(record, userEmail)) return { name: userName, label: "You", isYou: true };
    if (!record.currentAssignee) return null;
    return { name: record.currentAssignee, label: record.currentAssignee, isYou: false };
  };

  const emptySource = source.length === 0;

  return (
    <Box>
      {focusForm && scopedForm && (
        <Button
          onClick={() => setScreen("home")}
          startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
          sx={{ minHeight: 36, px: 0.75, ml: -0.75, mb: 1, fontSize: 12.5, color: "text.secondary" }}
        >
          {scopedForm.name}
        </Button>
      )}

      <Stack direction="row" sx={{ flexWrap: "wrap", alignItems: "center", gap: 1.5, mb: 2 }}>
        <Typography component="h1" sx={{ flex: 1, minWidth: 200, m: 0, fontSize: 26, fontWeight: 800 }}>
          Submissions
        </Typography>
        <Box
          role="group"
          aria-label="View"
          sx={{ display: "flex", p: "3px", backgroundColor: "divider", borderRadius: radius.xs }}
        >
          {VIEW_OPTIONS.map((option) => {
            const on = view === option.value;
            return (
              <Button
                key={option.value}
                onClick={() => setPrefs({ subsView: option.value })}
                aria-pressed={on}
                startIcon={option.icon}
                sx={{
                  height: 36,
                  px: 1.75,
                  minWidth: 0,
                  borderRadius: radius.tag,
                  fontSize: 13.5,
                  fontWeight: on ? 800 : 700,
                  textTransform: "none",
                  color: "text.primary",
                  backgroundColor: on ? "background.paper" : "transparent",
                  boxShadow: on ? 1 : 0,
                  "&:hover": { backgroundColor: on ? "background.paper" : "action.hover" },
                }}
              >
                {option.label}
              </Button>
            );
          })}
        </Box>
        {access.canExport && (
          <ExportCsvButton
            label="Export"
            done={(count) =>
              `Exported ${count} record${count === 1 ? "" : "s"} in full: every answer, every decision, signatures as images, times in Malaysian time.`
            }
            run={(token) => exportRecordsCsv(rows, { token })}
            sx={{
              height: 40,
              px: 2,
              borderRadius: radius.xs,
              border: "1.5px solid",
              borderColor: "divider",
              backgroundColor: "background.paper",
              color: "text.primary",
              fontSize: 13.5,
              fontWeight: 700,
              textTransform: "none",
              "&:hover": { backgroundColor: "action.hover" },
            }}
          />
        )}
      </Stack>

      <Stack direction="row" sx={{ flexWrap: "wrap", alignItems: "center", gap: 1, mb: 2 }}>
        <TextField
          size="small"
          label="Search submissions"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          sx={{ width: { xs: "100%", sm: 260 }, ...fieldSx, minWidth: { xs: "100%", sm: 180 } }}
        />

        <Stack role="group" aria-label="Whose" direction="row" sx={{ gap: 0.75, flexWrap: "wrap" }}>
          {SCOPE_ORDER.filter((value) => scopes.includes(value)).map((value) => {
            const label = value === "all" ? "All" : value === "mine" ? "Mine" : `Needs me · ${queue.length}`;
            return (
              <Button
                key={value}
                aria-pressed={scope === value}
                onClick={() => {
                  setScope(value);
                  setPage(1);
                }}
                sx={chipSx(scope === value)}
              >
                {label}
              </Button>
            );
          })}
        </Stack>

        <Box aria-hidden="true" sx={{ width: 1, height: 24, mx: 0.5, backgroundColor: "divider", display: { xs: "none", sm: "block" } }} />

        <TextField
          select
          size="small"
          label="Form"
          value={formFilter}
          onChange={(event) => {
            setFormFilter(event.target.value);
            setPage(1);
          }}
          sx={fieldSx}
        >
          <MenuItem value="all">All forms</MenuItem>
          {catalogue.map((entry) => (
            <MenuItem key={entry.listTitle} value={entry.listTitle}>
              {entry.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as StatusChoice);
            setPage(1);
          }}
          sx={fieldSx}
        >
          {statusOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label="Filed"
          value={filedRange}
          onChange={(event) => {
            setFiledRange(event.target.value as FiledRange);
            setPage(1);
          }}
          sx={fieldSx}
        >
          {FILED_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {rows.length === 0 ? (
        <MessageCard
          mood="notfound"
          title={emptySource ? "Nothing filed yet" : "Nothing matches"}
          body={emptySource ? "Nothing has been filed here yet." : "Try a different search or filter."}
          fullPage={false}
        />
      ) : view === "board" ? (
        <SubmissionsBoard
          columns={boardColumns(rows, userEmail, now)}
          olderDone={doneBeyondWindow(rows, now)}
          onOpen={openRecord}
          onShowAll={showSettledInList}
        />
      ) : (
        <>
          <Box
            sx={{
              backgroundColor: "background.paper",
              border: "1.5px solid",
              borderColor: "divider",
              borderRadius: radius.md,
              overflowX: "auto",
            }}
          >
            <Table sx={{ minWidth: 900, borderCollapse: "collapse" }}>
              <TableHead>
                <TableRow>
                  <TableCell scope="col" sx={{ ...headCellSx, pl: 2, width: 36 }}>
                    <Box component="span" sx={visuallyHidden}>
                      Form type
                    </Box>
                  </TableCell>
                  <TableCell scope="col" sx={headCellSx}>Reference</TableCell>
                  <TableCell scope="col" sx={headCellSx}>Summary</TableCell>
                  <TableCell scope="col" sx={headCellSx}>Filed by</TableCell>
                  <TableCell scope="col" sx={headCellSx}>With</TableCell>
                  <TableCell scope="col" sx={headCellSx}>Status</TableCell>
                  <TableCell scope="col" sx={{ ...headCellSx, pr: 2 }}>Updated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {current.rows.map((record) => {
                  const filedByYou = sameEmail(record.submitterEmail, userEmail);
                  const holder = withLine(record);
                  return (
                    // The row opens the record. Its reference and summary are
                    // buttons too, so the keyboard reaches the same action.
                    <TableRow
                      key={recordKey(record)}
                      hover
                      onClick={() => openRecord(record)}
                      sx={{ cursor: "pointer", "& > td": { borderBottom: `1px solid ${TINTS.grey}` } }}
                    >
                      <TableCell sx={{ ...cellSx, pl: 2 }}>
                        <Box
                          aria-hidden="true"
                          sx={{ width: 28, height: 28, borderRadius: radius.xs, backgroundColor: formTint(record.listTitle) }}
                        />
                      </TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                        <Box
                          component="button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openRecord(record);
                          }}
                          sx={{ ...linkButtonSx, whiteSpace: "nowrap" }}
                        >
                          {record.reference}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ ...cellSx, maxWidth: 340 }}>
                        <Box
                          component="button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openRecord(record);
                          }}
                          sx={{ ...linkButtonSx, display: "block", color: "text.primary", fontWeight: 600 }}
                        >
                          {record.subject}
                        </Box>
                        <Box component="span" sx={{ display: "block", fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
                          {record.formName}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", fontWeight: 600 }}>
                          <PersonAvatar name={filedByYou ? userName : record.submitter} />
                          <span>{filedByYou ? "You" : record.submitter}</span>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                        {holder ? (
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center", fontWeight: 600 }}>
                            <PersonAvatar name={holder.name} isYou={holder.isYou} />
                            <span>{holder.label}</span>
                          </Stack>
                        ) : (
                          <span>—</span>
                        )}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <StatusLozenge tone={recordTone(record, userEmail)}>
                          {isOnYourLayer(record, userEmail) ? "Waiting for you" : record.status}
                        </StatusLozenge>
                      </TableCell>
                      <TableCell sx={{ ...cellSx, pr: 2, whiteSpace: "nowrap", color: "text.secondary", fontWeight: 600 }}>
                        {updatedLabel(record, now)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>

          <Box sx={{ mt: 2 }}>
            <Pager
              total={rows.length}
              page={current.page}
              size={prefs.pageSize}
              onPage={setPage}
              onSize={(size) => {
                setPrefs({ pageSize: size });
                setPage(1);
              }}
            />
          </Box>
        </>
      )}
    </Box>
  );
}

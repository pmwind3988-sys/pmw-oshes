import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Stack, Typography } from "@mui/material";
import {
  ClipboardClock as PendingActionsOutlinedIcon,
  FileText as DescriptionOutlinedIcon,
  Undo2 as ReplayOutlinedIcon,
} from "../../components/ui/Icons";
import { TINTS } from "../../theme/simple";
import { radius } from "../../theme/surfaces";
import FormPickerDialog from "../../components/portal/FormPickerDialog";
import { MessageCard } from "../../components/simple/MessageCard";
import { usePortal } from "../../contexts/PortalContext";
import { recordKey } from "../../utils/portalRecords";
import {
  defaultWorkTab,
  emptyWorkCopy,
  recentlyViewed,
  signOffLabel,
  statusTone,
  visibleWorkTabs,
  workGreeting,
  WORK_ROW_LIMIT,
  type StatusTone,
  type WorkTab,
} from "../../utils/portalWork";
import type { CatalogueEntry, PortalRecord } from "../../types";

/** Lozenge and row-icon colours per tone. Tints are the fixed accents; the text is the ink on each. */
const TONE_STYLE: Record<StatusTone, { backgroundColor: string; color: string }> = {
  waiting: { backgroundColor: TINTS.amber, color: "#7A4A00" },
  progress: { backgroundColor: TINTS.blue, color: "#174AA6" },
  done: { backgroundColor: TINTS.green, color: "#0F5C38" },
  returned: { backgroundColor: TINTS.red, color: "#9B231B" },
  neutral: { backgroundColor: TINTS.grey, color: "#5B6577" },
};

/** The rotation of tints behind the Start a form icons. */
const START_TINTS = [TINTS.amber, TINTS.red, TINTS.violet, TINTS.green, TINTS.blue, TINTS.grey];

const TAB_LABEL: Record<WorkTab, string> = {
  needs: "Needs you",
  mine: "Filed by you",
  viewed: "Viewed recently",
};

/** How many forms the Start a form row offers. */
const START_FORM_LIMIT = 4;

function Lozenge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        flex: "none",
        px: 1,
        py: 0.5,
        borderRadius: radius.tag,
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1.2,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
        ...TONE_STYLE[tone],
      }}
    >
      {children}
    </Box>
  );
}

/** A form type with its sign-off count and a route into filing it. */
function StartFormCard({
  entry,
  tint,
  onOpen,
}: {
  entry: CatalogueEntry;
  tint: string;
  onOpen: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      disabled={!entry.slug}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        width: "100%",
        p: 1.75,
        border: "1.5px solid",
        borderColor: "divider",
        borderRadius: radius.sm,
        backgroundColor: "background.paper",
        color: "text.primary",
        font: "inherit",
        textAlign: "left",
        cursor: "pointer",
        "&:hover": { borderColor: "primary.main" },
        "&:disabled": { cursor: "default", opacity: 0.6 },
      }}
    >
      <Box
        sx={{
          flex: "none",
          width: 44,
          height: 44,
          borderRadius: radius.xs,
          backgroundColor: tint,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          "& svg": { width: 24, height: 24 },
        }}
      >
        <DescriptionOutlinedIcon />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 14, fontWeight: 800 }}>
          {entry.name}
        </Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary" }}>
          {signOffLabel(entry.chain.length)}
        </Typography>
      </Box>
    </Box>
  );
}

/** One record as a row. On Needs you the whole row opens the record and carries the Review action. */
function WorkRow({ record, tab, onOpen }: { record: PortalRecord; tab: WorkTab; onOpen: () => void }) {
  const needs = tab === "needs";
  const tone: StatusTone = needs ? "waiting" : statusTone(record.status);
  const Icon = record.returned ? ReplayOutlinedIcon : needs ? PendingActionsOutlinedIcon : DescriptionOutlinedIcon;
  const filed = record.filedAt
    ? record.filedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" })
    : "";

  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: { xs: 1.25, sm: 1.75 },
        width: "100%",
        px: 2.5,
        py: 1.5,
        border: 0,
        borderBottom: "1px solid",
        borderColor: "#EEF1F6",
        backgroundColor: "transparent",
        color: "text.primary",
        font: "inherit",
        textAlign: "left",
        cursor: "pointer",
        "&:last-child": { borderBottom: 0 },
        "&:hover": { backgroundColor: "#F4F6FA" },
      }}
    >
      <Box
        sx={{
          flex: "none",
          width: 32,
          height: 32,
          borderRadius: radius.xs,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: TONE_STYLE[tone].backgroundColor,
          "& svg": { width: 18, height: 18 },
        }}
      >
        <Icon />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 14.5, fontWeight: 700 }}>
          {record.subject}
        </Typography>
        <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 600, color: "text.secondary" }}>
          {`${record.reference} · ${record.formName} · ${record.submitter}`}
        </Typography>
      </Box>
      <Lozenge tone={tone}>{needs ? `Waiting ${record.ageOnLayerLabel}` : record.status}</Lozenge>
      {filed && (
        <Typography
          sx={{ display: { xs: "none", sm: "block" }, flex: "none", fontSize: 12.5, fontWeight: 600, color: "text.secondary", whiteSpace: "nowrap" }}
        >
          {filed}
        </Typography>
      )}
      {needs && (
        <Box
          component="span"
          sx={{
            flex: "none",
            display: { xs: "none", sm: "flex" },
            alignItems: "center",
            justifyContent: "center",
            height: 34,
            px: 2,
            borderRadius: radius.xs,
            backgroundColor: "primary.main",
            color: "primary.contrastText",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          Review
        </Box>
      )}
    </Box>
  );
}

/**
 * Your work — the page an account lands on.
 *
 * Three questions in order: what is the greeting, what can I start, and what
 * is waiting on me or already mine. The work card holds the lists; which tab
 * opens first, and what each empty tab says, is decided in `portalWork.ts`.
 */
export default function HomeScreen() {
  const { access, userName, setScreen, openDrawer, records, myRecords, queue, catalogue, recentRefs } = usePortal();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenTab, setChosenTab] = useState<WorkTab | null>(null);

  const tabs = visibleWorkTabs(access.readOnly);
  const tab: WorkTab =
    chosenTab && tabs.includes(chosenTab) ? chosenTab : defaultWorkTab(queue.length, access.readOnly);

  const rows =
    tab === "needs" ? queue : tab === "mine" ? myRecords : recentlyViewed(records, recentRefs);
  const shown = rows.slice(0, WORK_ROW_LIMIT);

  const seeAll = () =>
    tab === "needs" ? setScreen("subs", null, null, "needs") : setScreen("subs", null, "all", "mine");

  // The busiest forms first, so the four offered are the ones this site uses.
  const startForms = [...catalogue]
    .sort((a, b) => b.volume - a.volume || a.name.localeCompare(b.name))
    .slice(0, START_FORM_LIMIT);

  const firstName = userName ? userName.split(" ")[0] : null;
  const copy = emptyWorkCopy(tab);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3.5 }}>
      <Stack direction="row" sx={{ flexWrap: "wrap", alignItems: "center", gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <Typography component="h1" sx={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}>
            Your work
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: 14.5, fontWeight: 500, color: "text.secondary" }}>
            {workGreeting(firstName, queue.length)}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          onClick={() => setScreen("subs")}
          sx={{
            minHeight: 44,
            px: 2.25,
            borderRadius: radius.xs,
            borderWidth: 1.5,
            borderColor: "divider",
            backgroundColor: "background.paper",
            color: "text.primary",
            fontSize: 14,
            fontWeight: 700,
            textTransform: "none",
            "&:hover": { borderWidth: 1.5, borderColor: "divider", backgroundColor: "#F4F6FA" },
          }}
        >
          View all submissions
        </Button>
      </Stack>

      {access.canFile && catalogue.length > 0 && (
        <Box component="section" aria-labelledby="start-a-form-heading" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
            <Typography
              id="start-a-form-heading"
              component="h2"
              sx={{ fontSize: 15, fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em" }}
            >
              Start a form
            </Typography>
            <Button
              variant="text"
              onClick={() => setPickerOpen(true)}
              sx={{ minHeight: 44, px: 1, fontSize: 13.5, fontWeight: 700, textTransform: "none", color: "primary.main" }}
            >
              All forms
            </Button>
          </Stack>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 1.5 }}>
            {startForms.map((entry, index) => (
              <StartFormCard
                key={entry.listTitle}
                entry={entry}
                tint={START_TINTS[index % START_TINTS.length]}
                onOpen={() => navigate(`/form/${encodeURIComponent(entry.slug)}`)}
              />
            ))}
          </Box>
        </Box>
      )}

      <Box
        component="section"
        aria-label="Your work"
        sx={{ backgroundColor: "background.paper", border: "1.5px solid", borderColor: "divider", borderRadius: radius.sm, overflow: "hidden" }}
      >
        <Box
          role="tablist"
          aria-label="Your work"
          sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, px: 2, borderBottom: "1px solid", borderColor: "divider" }}
        >
          {tabs.map((id) => {
            const selected = id === tab;
            return (
              <Box
                key={id}
                component="button"
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="your-work-panel"
                onClick={() => setChosenTab(id)}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.75,
                  minHeight: 48,
                  px: 1.5,
                  border: 0,
                  borderBottom: "2px solid",
                  borderColor: selected ? "primary.main" : "transparent",
                  backgroundColor: "transparent",
                  color: selected ? "text.primary" : "text.secondary",
                  font: "inherit",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {TAB_LABEL[id]}
                {id === "needs" && (
                  <Box
                    component="span"
                    sx={{
                      minWidth: 20,
                      height: 20,
                      px: 0.75,
                      boxSizing: "border-box",
                      borderRadius: radius.full,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 800,
                      ...(queue.length > 0 ? TONE_STYLE.returned : TONE_STYLE.neutral),
                    }}
                  >
                    {queue.length}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        <Box id="your-work-panel" role="tabpanel">
          {rows.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <MessageCard
                fullPage={false}
                mood={tab === "needs" ? "success" : "hello"}
                title={copy.title}
                body={copy.body}
                primary={
                  tab === "mine" && access.canFile
                    ? { label: "Create", onClick: () => setPickerOpen(true) }
                    : undefined
                }
              />
            </Box>
          ) : (
            <>
              {shown.map((record) => (
                <WorkRow
                  key={recordKey(record)}
                  record={record}
                  tab={tab}
                  onOpen={() => openDrawer(recordKey(record))}
                />
              ))}
              {rows.length > WORK_ROW_LIMIT && tab !== "viewed" && (
                <Box sx={{ p: 1.5, textAlign: "center" }}>
                  <Button
                    variant="text"
                    onClick={seeAll}
                    sx={{ minHeight: 44, fontSize: 13.5, fontWeight: 700, textTransform: "none", color: "primary.main" }}
                  >
                    See all
                  </Button>
                </Box>
              )}
            </>
          )}
        </Box>
      </Box>

      <FormPickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </Box>
  );
}

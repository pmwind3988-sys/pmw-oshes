import { useMemo, useState } from "react";
import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import { editorial } from "../../theme/editorial";
import { liftSx, panelSx, radius } from "../../theme/surfaces";
import ReferenceTag from "../../components/ReferenceTag";
import {
  CtaButton,
  PageHeader,
  SectionLabel,
  TaskRow,
  Widget,
  WidgetCount,
  WidgetEmpty,
  WidgetGrid,
} from "../../components/Widget";
import { usePortal } from "../../contexts/PortalContext";
import { StatusPill } from "../../components/portal/PortalPills";
import {
  DonutGauge,
  IntakeChart,
  StatTile,
  StatTileRow,
  StatusMix,
  type GaugeSegment,
} from "../../components/portal/PortalStats";
import { recordKey } from "../../utils/portalRecords";
import { portalStats, scopeToForm } from "../../utils/portalStats";
import { portalSections } from "../../utils/portalRole";
import { formatTodayDate } from "../../utils/portalTime";
import type { CatalogueEntry, PortalRecord, PortalScreen, StatFilter } from "../../types";

/**
 * A form type as a door into its own workspace.
 *
 * The card carries the three numbers that decide whether you need to go in —
 * how many are yours, how many are open, how many arrived today — so the
 * dashboard answers "is there anything for me on permits?" without a click. The
 * whole card is the target, not a link buried in it.
 */
function FormCard({
  entry,
  mine,
  open,
  waiting,
  onOpen,
}: {
  entry: CatalogueEntry;
  mine: number;
  open: number;
  waiting: number;
  onOpen: () => void;
}) {
  const urgent = waiting > 0;
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      sx={{
        ...panelSx,
        ...liftSx,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        textAlign: "left",
        font: "inherit",
        color: "inherit",
        p: { xs: 1.75, sm: 2 },
        borderColor: urgent ? editorial.error : editorial.border,
        cursor: "pointer",
        "&:hover": { ...liftSx["&:hover"], borderColor: urgent ? editorial.error : editorial.pmwBlue },
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", width: "100%", mb: 0.75, minWidth: 0 }}>
        <ReferenceTag value={entry.code} sx={{ flex: "none" }} />
        {urgent && (
          <Box
            component="span"
            sx={{
              flex: "none",
              ml: "auto",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              px: 0.8,
              py: 0.3,
              borderRadius: radius.full,
              color: editorial.onStatus,
              backgroundColor: editorial.errorFill,
            }}
          >
            {waiting} on you
          </Box>
        )}
      </Stack>

      <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>{entry.name}</Typography>
      <Typography sx={{ fontSize: 11.5, color: editorial.muted, mt: 0.3, lineHeight: 1.35 }}>
        {entry.hasWorkflow ? entry.workflow.label : "No approval step"}
      </Typography>

      <Stack
        direction="row"
        spacing={2}
        sx={{
          mt: "auto",
          pt: 1.5,
          width: "100%",
          borderTop: `1px solid ${editorial.border}`,
          alignItems: "flex-end",
        }}
      >
        {[
          { value: mine, label: "yours" },
          { value: open, label: "open" },
          { value: entry.today, label: "today" },
        ].map((stat) => (
          <Box key={stat.label}>
            <Typography sx={{ fontSize: 17, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {stat.value}
            </Typography>
            <Typography sx={{ fontSize: 10.5, color: editorial.muted }}>{stat.label}</Typography>
          </Box>
        ))}
        <Typography sx={{ ml: "auto", fontSize: 12.5, fontWeight: 800, color: editorial.pmwBlueDark }}>
          Open →
        </Typography>
      </Stack>
    </Box>
  );
}

/** A small link tile for the pages that are not a form: catalogue, people, audit, settings. */
function LinkTile({
  label,
  hint,
  count,
  onOpen,
}: {
  label: string;
  hint: string;
  count?: number | null;
  onOpen: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      sx={{
        ...panelSx,
        display: "block",
        width: "100%",
        height: "100%",
        textAlign: "left",
        font: "inherit",
        color: "inherit",
        p: 1.5,
        borderRadius: radius.base,
        cursor: "pointer",
        transition: "border-color 0.16s ease, background-color 0.16s ease",
        "&:hover": { borderColor: editorial.pmwBlue, backgroundColor: editorial.blueWash },
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700 }} noWrap>
          {label}
        </Typography>
        {count !== null && count !== undefined && (
          <Typography
            sx={{ fontSize: 12.5, color: editorial.muted, fontVariantNumeric: "tabular-nums", flex: "none" }}
          >
            {count}
          </Typography>
        )}
      </Stack>
      <Typography sx={{ fontSize: 11, color: editorial.muted, mt: 0.25, lineHeight: 1.35 }}>{hint}</Typography>
    </Box>
  );
}

/**
 * Home — the dashboard, organised around the thing people actually arrive
 * holding: a form.
 *
 * It used to be a grid of section cards, one per page of the portal, which
 * meant the first decision it asked for was "which of our nine pages is this?"
 * — a question about the app rather than about the work. The order is now:
 * what is waiting on you, then the forms themselves (each opening its own
 * workspace with file / everyone's / yours behind it), then how the whole set
 * is moving, then the pages that are not forms.
 *
 * Every number here is pressable and opens exactly the rows it counted, so
 * reading the dashboard and acting on it are the same gesture. The work rows
 * carry their own action as well, because a queue that makes you open an item
 * to discover the button is two clicks where the list already knew there was
 * one thing to do.
 */
export default function HomeScreen() {
  const {
    access,
    userName,
    userEmail,
    setScreen,
    openDrawer,
    records,
    myRecords,
    queue,
    catalogue,
    audit,
  } = usePortal();

  const [formQuery, setFormQuery] = useState("");

  const stats = useMemo(() => portalStats({ records, userEmail, catalogue }), [records, userEmail, catalogue]);
  const openMine = useMemo(
    () => myRecords.filter((record) => record.hasWorkflow && !record.done && !record.returned).length,
    [myRecords],
  );

  // Busiest first: the dashboard should put the forms this site actually uses
  // in front of the ones that were published and never filed.
  const forms = useMemo(() => {
    const needle = formQuery.trim().toLowerCase();
    const counted = catalogue.map((entry) => {
      const scoped = scopeToForm(records, entry.listTitle);
      return {
        entry,
        mine: scopeToForm(myRecords, entry.listTitle).length,
        open: scoped.filter((record) => record.hasWorkflow && !record.done && !record.returned).length,
        waiting: scopeToForm(queue, entry.listTitle).length,
        weight: scoped.length,
      };
    });
    const matching = needle
      ? counted.filter(
          (row) =>
            row.entry.name.toLowerCase().includes(needle) || row.entry.code.toLowerCase().includes(needle),
        )
      : counted;
    return matching.sort(
      (a, b) => b.waiting - a.waiting || b.weight - a.weight || a.entry.name.localeCompare(b.entry.name),
    );
  }, [catalogue, records, myRecords, queue, formQuery]);

  /**
   * The ring: everything on record, split by whether it still needs somebody.
   *
   * Zero-count states are dropped rather than drawn as a legend entry with no
   * arc — a deployment that has never rejected anything should not carry the
   * word "Rejected" on its dashboard.
   */
  const gaugeSegments = useMemo<GaugeSegment<StatFilter>[]>(() => {
    const all: GaugeSegment<StatFilter>[] = [
      { id: "open", label: "Still moving", count: stats.open, tone: "ink", hint: "in a chain now" },
      { id: "Returned", label: "Sent back", count: stats.returned, tone: "alert", hint: "with the filer" },
      {
        id: "Approved",
        label: "Settled",
        count: stats.approved + stats.recorded,
        tone: "positive",
        hint: "signed off or recorded",
      },
      {
        id: "Cancelled",
        label: "Ended",
        count: stats.rejected + stats.cancelled,
        tone: "muted",
        hint: "rejected or cancelled",
      },
    ];
    return all.filter((segment) => segment.count > 0);
  }, [stats]);

  const sections = portalSections(access, {
    queue: queue.length,
    allRecords: records.length,
    myRecords: myRecords.length,
    catalogue: catalogue.length,
    audit: audit.length,
  });
  const hint = (screen: PortalScreen): string =>
    sections.flatMap((section) => section.items).find((item) => item.screen === screen)?.hint ?? "";
  const has = (screen: PortalScreen): boolean =>
    sections.some((section) => section.items.some((item) => item.screen === screen));

  const greeting = userName ? `Hello, ${userName.split(" ")[0]}` : "Hello";
  const headline = access.readOnly
    ? "Read-only account — everything below is a record of what others did."
    : queue.length > 0
      ? `${queue.length} ${queue.length === 1 ? "item is" : "items are"} waiting on you.`
      : openMine > 0
        ? `Nothing is waiting on you. ${openMine} of your own ${openMine === 1 ? "filing is" : "filings are"} still moving.`
        : "Nothing is waiting on you.";

  const extras = (["today", "cat", "people", "audit"] as const).filter((screen) => has(screen));

  /** The one line under a work row: which form, which step, how long it has sat. */
  const waitLine = (record: PortalRecord): string =>
    `${record.formName} · ${record.hasWorkflow ? record.layerLabel : "no approval step"}`;

  return (
    <Box>
      <PageHeader
        title={greeting}
        subtitle={headline}
        meta={formatTodayDate()}
        actions={
          has("file") && access.canFile ? (
            <Button variant="outlined" onClick={() => setScreen("file")} sx={{ minHeight: 40 }}>
              File a form
            </Button>
          ) : undefined
        }
      />

      <Box sx={{ mb: 3 }}>
        <StatTileRow>
          {has("queue") && (
            <StatTile
              value={queue.length}
              label="Waiting on you"
              hint="on your layer now"
              tone={queue.length > 0 ? "alert" : "ink"}
              onClick={() => setScreen("queue")}
            />
          )}
          <StatTile
            value={myRecords.length}
            label="Filed by you"
            hint="all time"
            onClick={() => setScreen("mine", null, "all")}
          />
          {records.length > myRecords.length && (
            <StatTile
              value={stats.open}
              label="Still moving"
              hint="in a chain now"
              onClick={() => setScreen("subs", null, "open")}
            />
          )}
          {access.canSeeEveryRecord && (
            <StatTile
              value={stats.filedToday}
              label="Filed today"
              hint="since midnight"
              onClick={() => setScreen("subs", null, "all")}
            />
          )}
          {/* Absent entirely where no form declared an SLA — this deployment
              does not carry the vocabulary of a feature it does not use. */}
          {stats.hasSla && access.canSeeOperations && (
            <StatTile
              value={stats.overdue}
              label="Past SLA"
              hint="over their target"
              tone="alert"
              onClick={() => setScreen("subs", null, "Past SLA")}
            />
          )}
        </StatTileRow>
      </Box>

      <WidgetGrid min={330} sx={{ mb: 3.5 }}>
        {has("queue") && (
          <Widget
            title={access.isEvaluator ? "To evaluate" : "To approve"}
            caption={hint("queue")}
            meta={<WidgetCount value={queue.length} tone={queue.length > 0 ? "alert" : "ink"} />}
            onOpen={() => setScreen("queue")}
            openLabel="Open your queue"
            footer={
              <Button
                onClick={() => setScreen("queue")}
                size="small"
                sx={{ px: 0, minWidth: 0, fontWeight: 800 }}
              >
                Open your queue →
              </Button>
            }
          >
            {queue.length === 0 ? (
              <WidgetEmpty>Your queue is clear.</WidgetEmpty>
            ) : (
              <Box>
                {queue.slice(0, 4).map((record) => (
                  <TaskRow
                    key={recordKey(record)}
                    icon={<PendingActionsOutlinedIcon />}
                    tone={record.overdue ? "alert" : "ink"}
                    title={record.subject}
                    description={waitLine(record)}
                    timestamp={record.waitNote || `waiting ${record.ageOnLayerLabel}`}
                    onOpen={() => openDrawer(recordKey(record))}
                    action={
                      <CtaButton size="small" onClick={() => openDrawer(recordKey(record))}>
                        Review
                      </CtaButton>
                    }
                  />
                ))}
              </Box>
            )}
          </Widget>
        )}

        <Widget
          title="Your recent filings"
          caption={hint("mine")}
          meta={<WidgetCount value={myRecords.length} />}
          onOpen={() => setScreen("mine", null, "all")}
          openLabel="See everything you filed"
          footer={
            <Button
              onClick={() => setScreen("mine", null, "all")}
              size="small"
              sx={{ px: 0, minWidth: 0, fontWeight: 800 }}
            >
              See everything you filed →
            </Button>
          }
        >
          {myRecords.length === 0 ? (
            <WidgetEmpty>You have not filed anything yet. Pick a form below to start one.</WidgetEmpty>
          ) : (
            <Box>
              {myRecords.slice(0, 4).map((record) => (
                <TaskRow
                  key={recordKey(record)}
                  icon={record.returned ? <ReplayOutlinedIcon /> : <DescriptionOutlinedIcon />}
                  tone={record.returned ? "alert" : "muted"}
                  title={record.subject}
                  description={waitLine(record)}
                  timestamp={`filed ${record.filedLabel}`}
                  onOpen={() => openDrawer(recordKey(record))}
                  action={<StatusPill status={record.status} />}
                />
              ))}
            </Box>
          )}
        </Widget>

        {has("subs") && records.length > 0 && (
          <Widget
            title="Where records stand"
            caption="press a slice to open that list"
            onOpen={() => setScreen("subs", null, "all")}
            openLabel="Open all records"
          >
            <DonutGauge
              segments={gaugeSegments}
              total={stats.total}
              centreLabel="On record"
              onPick={(segment) => setScreen("subs", null, segment.id)}
            />
          </Widget>
        )}
      </WidgetGrid>

      <Box sx={{ mb: 3.5 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ alignItems: { sm: "flex-end" }, justifyContent: "space-between", mb: 1.75 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: { xs: 18, sm: 20 }, fontWeight: 700 }}>Your forms</Typography>
            <Typography sx={{ fontSize: 12.5, color: editorial.muted }}>
              pick one to file it, see everyone's, or see your own
            </Typography>
          </Box>
          {catalogue.length > 6 && (
            <TextField
              size="small"
              placeholder="Find a form"
              value={formQuery}
              onChange={(event) => setFormQuery(event.target.value)}
              sx={{ width: { xs: "100%", sm: 220 } }}
            />
          )}
        </Stack>

        {forms.length === 0 ? (
          <Widget bare>
            <WidgetEmpty>
              {catalogue.length === 0
                ? "No form types are published yet. Forms are authored in the PMW form builder; once one is published there it appears here."
                : "No form matches that search."}
            </WidgetEmpty>
          </Widget>
        ) : (
          <WidgetGrid min={244}>
            {forms.map((row) => (
              <FormCard
                key={row.entry.listTitle}
                entry={row.entry}
                mine={row.mine}
                open={row.open}
                waiting={row.waiting}
                onOpen={() => setScreen("form", row.entry.listTitle)}
              />
            ))}
          </WidgetGrid>
        )}
      </Box>

      {has("subs") && (
        <WidgetGrid min={340} sx={{ mb: 3.5 }}>
          <Widget
            title="Where everything stands"
            caption="press a status to open that list"
            onOpen={() => setScreen("subs", null, "all")}
            openLabel="Open all records"
          >
            <StatusMix buckets={stats.breakdown} onPick={(bucket) => setScreen("subs", null, bucket.id)} />
          </Widget>

          <Widget
            title="Intake, last 14 days"
            caption="today is the last bar"
            meta={<WidgetCount value={stats.last7} tone="muted" />}
            onOpen={() => setScreen("subs", null, "all")}
            openLabel="Open all records"
          >
            <IntakeChart days={stats.daily} onPickDay={() => setScreen("subs", null, "all")} />
          </Widget>
        </WidgetGrid>
      )}

      {extras.length > 0 && (
        <Box sx={{ mt: 3.5 }}>
          <SectionLabel>{access.canSeeEveryRecord ? "Oversight" : "More"}</SectionLabel>
          <WidgetGrid min={200}>
            {extras.includes("today") && (
              <LinkTile label="Today" hint={hint("today")} onOpen={() => setScreen("today")} />
            )}
            {extras.includes("cat") && (
              <LinkTile
                label="Form catalogue"
                hint={hint("cat")}
                count={catalogue.length}
                onOpen={() => setScreen("cat")}
              />
            )}
            {extras.includes("people") && (
              <LinkTile label="People & roles" hint={hint("people")} onOpen={() => setScreen("people")} />
            )}
            {extras.includes("audit") && (
              <LinkTile label="Audit trail" hint={hint("audit")} count={audit.length} onOpen={() => setScreen("audit")} />
            )}
            <LinkTile label="Settings" hint={hint("settings")} onOpen={() => setScreen("settings")} />
          </WidgetGrid>
        </Box>
      )}
    </Box>
  );
}

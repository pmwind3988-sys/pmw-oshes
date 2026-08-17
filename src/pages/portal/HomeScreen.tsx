import { useMemo, useState } from "react";
import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import ReferenceTag from "../../components/ReferenceTag";
import { usePortal } from "../../contexts/PortalContext";
import { StatusPill } from "../../components/portal/PortalPills";
import { IntakeChart, StatTile, StatTileRow, StatusMix } from "../../components/portal/PortalStats";
import { recordKey } from "../../utils/portalRecords";
import { portalStats, scopeToForm } from "../../utils/portalStats";
import { portalSections } from "../../utils/portalRole";
import { formatTodayDate } from "../../utils/portalTime";
import type { CatalogueEntry, PortalRecord, PortalScreen } from "../../types";

const PANEL_SX = {
  backgroundColor: editorial.panel,
  border: editorialHairline,
  borderRadius: "14px",
  p: { xs: 1.75, sm: 2 },
} as const;

function PanelHead({ title, caption, right }: { title: string; caption: string; right?: React.ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 1.5, minWidth: 0 }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{title}</Typography>
        <Typography sx={{ fontSize: 12, color: editorial.muted }}>{caption}</Typography>
      </Box>
      {right}
    </Stack>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ fontSize: 13, color: editorial.muted, py: 1 }}>{children}</Typography>;
}

/** One record, one line — the same row shape every panel on this page uses. */
function RecordLine({
  record,
  onOpen,
  right,
}: {
  record: PortalRecord;
  onOpen: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: "center", justifyContent: "space-between", py: 1.1, minWidth: 0 }}
    >
      <Box
        component="button"
        type="button"
        onClick={onOpen}
        sx={{
          minWidth: 0,
          flex: 1,
          textAlign: "left",
          border: "none",
          background: "none",
          p: 0,
          font: "inherit",
          color: "inherit",
          cursor: "pointer",
          "&:hover .home-line-title": { color: editorial.pmwBlueDark },
        }}
      >
        <Typography className="home-line-title" sx={{ fontSize: 13.5, fontWeight: 700 }} noWrap>
          {record.subject}
        </Typography>
        <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", minWidth: 0, mt: 0.2 }}>
          <ReferenceTag value={record.reference} sx={{ flex: "none" }} />
          <Typography sx={{ fontSize: 11, color: editorial.muted, minWidth: 0 }} noWrap>
            {record.formName} · {record.hasWorkflow ? record.layerLabel : "no approval step"}
          </Typography>
        </Stack>
      </Box>
      <Box sx={{ flex: "none" }}>{right}</Box>
    </Stack>
  );
}

/**
 * A form type as a door into its own workspace.
 *
 * The card carries the three numbers that decide whether you need to go in —
 * how many are yours, how many are open, how many are on your layer — so the
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
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        textAlign: "left",
        font: "inherit",
        color: "inherit",
        p: { xs: 1.75, sm: 2 },
        borderRadius: "14px",
        border: `1px solid ${waiting > 0 ? editorial.error : editorial.border}`,
        backgroundColor: editorial.panel,
        cursor: "pointer",
        transition: "border-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease",
        "&:hover": {
          borderColor: waiting > 0 ? editorial.error : editorial.pmwBlue,
          transform: "translateY(-2px)",
          boxShadow: "0 10px 26px rgba(0, 90, 158, 0.12)",
        },
        "&:active": { transform: "translateY(0)" },
        "@media (prefers-reduced-motion: reduce)": { transition: "none", "&:hover": { transform: "none" } },
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", width: "100%", mb: 0.75, minWidth: 0 }}>
        <ReferenceTag value={entry.code} sx={{ flex: "none" }} />
        {waiting > 0 && (
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
              borderRadius: "999px",
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
        sx={{ mt: "auto", pt: 1.5, width: "100%", borderTop: editorialHairline }}
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
        <Typography sx={{ ml: "auto", alignSelf: "flex-end", fontSize: 12.5, fontWeight: 800, color: editorial.pmwBlueDark }}>
          Open →
        </Typography>
      </Stack>
    </Box>
  );
}

/** A small link tile for the pages that are not a form: catalogue, people, audit, settings. */
function LinkTile({ label, hint, count, onOpen }: { label: string; hint: string; count?: number | null; onOpen: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      sx={{
        display: "block",
        width: "100%",
        textAlign: "left",
        font: "inherit",
        color: "inherit",
        p: 1.5,
        borderRadius: "12px",
        border: editorialHairline,
        backgroundColor: editorial.panel,
        cursor: "pointer",
        "&:hover": { borderColor: editorial.pmwBlue, backgroundColor: editorial.blueSoft },
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700 }} noWrap>
          {label}
        </Typography>
        {count !== null && count !== undefined && (
          <Typography sx={{ fontSize: 12.5, color: editorial.muted, fontVariantNumeric: "tabular-nums", flex: "none" }}>
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
 * reading the dashboard and acting on it are the same gesture.
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
    return matching.sort((a, b) => b.waiting - a.waiting || b.weight - a.weight || a.entry.name.localeCompare(b.entry.name));
  }, [catalogue, records, myRecords, queue, formQuery]);

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

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={{ fontSize: { xs: 27, sm: 34 }, fontWeight: 700, lineHeight: 1.1 }}>
          {greeting}
        </Typography>
        <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>{formatTodayDate()}</Typography>
        <Typography sx={{ fontSize: { xs: 14, sm: 15 }, mt: 1.5, fontWeight: 600 }}>{headline}</Typography>
      </Box>

      <Box sx={{ mb: 3.5 }}>
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
          <Box sx={PANEL_SX}>
            <Empty>
              {catalogue.length === 0
                ? "No form types are published yet. Forms are authored in the PMW form builder; once one is published there it appears here."
                : "No form matches that search."}
            </Empty>
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                lg: "repeat(3, minmax(0, 1fr))",
                xl: "repeat(4, minmax(0, 1fr))",
              },
              gap: { xs: 1.5, sm: 2 },
            }}
          >
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
          </Box>
        )}
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" },
          gap: { xs: 2, md: 2.5 },
          mb: 2.5,
        }}
      >
        {has("queue") && (
          <Box sx={PANEL_SX}>
            <PanelHead
              title={access.isEvaluator ? "To evaluate" : "To approve"}
              caption={hint("queue")}
              right={
                <Typography sx={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", flex: "none" }}>
                  {queue.length}
                </Typography>
              }
            />
            {queue.length === 0 ? (
              <Empty>Your queue is clear.</Empty>
            ) : (
              <Stack divider={<Box sx={{ borderTop: editorialHairline }} />}>
                {queue.slice(0, 4).map((record) => (
                  <RecordLine
                    key={recordKey(record)}
                    record={record}
                    onOpen={() => openDrawer(recordKey(record))}
                    right={
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => openDrawer(recordKey(record))}
                        sx={{ minHeight: 32 }}
                      >
                        Review
                      </Button>
                    }
                  />
                ))}
              </Stack>
            )}
            <Button
              onClick={() => setScreen("queue")}
              size="small"
              sx={{ alignSelf: "flex-start", mt: 1.25, px: 0, minWidth: 0, fontWeight: 800 }}
            >
              Open your queue →
            </Button>
          </Box>
        )}

        <Box sx={PANEL_SX}>
          <PanelHead
            title="Your recent filings"
            caption={hint("mine")}
            right={
              <Typography sx={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", flex: "none" }}>
                {myRecords.length}
              </Typography>
            }
          />
          {myRecords.length === 0 ? (
            <Empty>You have not filed anything yet. Pick a form above to start one.</Empty>
          ) : (
            <Stack divider={<Box sx={{ borderTop: editorialHairline }} />}>
              {myRecords.slice(0, 4).map((record) => (
                <RecordLine
                  key={recordKey(record)}
                  record={record}
                  onOpen={() => openDrawer(recordKey(record))}
                  right={<StatusPill status={record.status} />}
                />
              ))}
            </Stack>
          )}
          <Button
            onClick={() => setScreen("mine", null, "all")}
            size="small"
            sx={{ alignSelf: "flex-start", mt: 1.25, px: 0, minWidth: 0, fontWeight: 800 }}
          >
            See everything you filed →
          </Button>
        </Box>
      </Box>

      {has("subs") && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) minmax(0, 1fr)" },
            gap: { xs: 2, md: 2.5 },
            mb: 2.5,
          }}
        >
          <Box sx={PANEL_SX}>
            <PanelHead title="Where everything stands" caption="press a status to open that list" />
            <StatusMix buckets={stats.breakdown} onPick={(bucket) => setScreen("subs", null, bucket.id)} />
          </Box>

          <Box sx={PANEL_SX}>
            <PanelHead title="Intake, last 14 days" caption="today is the last bar" />
            <IntakeChart days={stats.daily} onPickDay={() => setScreen("subs", null, "all")} />
          </Box>
        </Box>
      )}

      {extras.length > 0 && (
        <Box sx={{ mt: 3.5 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: editorial.softMuted, mb: 1.25 }}>
            {access.canSeeEveryRecord ? "Oversight" : "More"}
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(auto-fit, minmax(200px, 1fr))" },
              gap: 1.5,
            }}
          >
            {extras.includes("today") && (
              <LinkTile label="Today" hint={hint("today")} onOpen={() => setScreen("today")} />
            )}
            {extras.includes("cat") && (
              <LinkTile label="Form catalogue" hint={hint("cat")} count={catalogue.length} onOpen={() => setScreen("cat")} />
            )}
            {extras.includes("people") && (
              <LinkTile label="People & roles" hint={hint("people")} onOpen={() => setScreen("people")} />
            )}
            {extras.includes("audit") && (
              <LinkTile label="Audit trail" hint={hint("audit")} count={audit.length} onOpen={() => setScreen("audit")} />
            )}
            <LinkTile label="Settings" hint={hint("settings")} onOpen={() => setScreen("settings")} />
          </Box>
        </Box>
      )}
    </Box>
  );
}

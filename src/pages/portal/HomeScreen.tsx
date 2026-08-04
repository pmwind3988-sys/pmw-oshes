import { useMemo } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { usePortal } from "../../contexts/PortalContext";
import { SeverityPill, StatusPill } from "../../components/portal/PortalPills";
import { severeRecords, stuckRecords } from "../../utils/portalRecords";
import { portalSections } from "../../utils/portalRole";
import { formatTodayDate } from "../../utils/portalTime";
import type { PortalRecord, PortalScreen } from "../../types";

const PANEL_SX = {
  backgroundColor: editorial.panel,
  border: editorialHairline,
  borderRadius: "14px",
  p: 2,
} as const;

function Stat({ value, label, tone = "ink" }: { value: number | string; label: string; tone?: "ink" | "alert" }) {
  return (
    <Box sx={{ minWidth: 96 }}>
      <Typography
        sx={{
          fontSize: 30,
          fontWeight: 700,
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
          color: tone === "alert" ? editorial.error : editorial.ink,
        }}
      >
        {value}
      </Typography>
      <Typography sx={{ fontSize: 11.5, color: editorial.muted }}>{label}</Typography>
    </Box>
  );
}

/** One record, one line. Used by every card so the home page reads as one list. */
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
        <Typography sx={{ fontSize: 11, color: editorial.muted }} noWrap>
          {record.reference} · {record.formName} · {record.hasWorkflow ? record.layerLabel : "no approval step"}
        </Typography>
      </Box>
      <Box sx={{ flex: "none" }}>{right}</Box>
    </Stack>
  );
}

/**
 * A card for one section of the portal. It answers its section's question in
 * place — the count, and the two or three rows that matter — and its footer is
 * the way into the full page. Nothing here is a duplicate screen: it is the
 * first screenful of one, so a person who only needs the answer never has to
 * navigate at all.
 */
function SectionCard({
  title,
  hint,
  count,
  action,
  onOpen,
  children,
}: {
  title: string;
  hint: string;
  count?: number | null;
  action: string;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ ...PANEL_SX, display: "flex", flexDirection: "column" }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 0.25 }}>
        <Typography sx={{ fontSize: 16.5, fontWeight: 700 }}>{title}</Typography>
        {count !== null && count !== undefined && (
          <Typography sx={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", flex: "none" }}>
            {count}
          </Typography>
        )}
      </Stack>
      <Typography sx={{ fontSize: 12, color: editorial.muted, mb: 1.25 }}>{hint}</Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
      <Button
        onClick={onOpen}
        size="small"
        sx={{ alignSelf: "flex-start", mt: 1.25, px: 0, minWidth: 0, fontWeight: 800 }}
      >
        {action} →
      </Button>
    </Box>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ fontSize: 13, color: editorial.muted, py: 1 }}>{children}</Typography>;
}

/**
 * Home — one page that shows every part of the portal this account can reach.
 *
 * The portal used to land each role on a different screen and hide the rest, so
 * an administrator who also approved things had no route to their own queue,
 * and a submitter had no idea the rest existed. Home replaces that: the same
 * page for everyone, made of the sections that account actually has, each
 * showing its own first few rows and linking to its full page.
 */
export default function HomeScreen() {
  const {
    access,
    userName,
    setScreen,
    openDrawer,
    records,
    myRecords,
    queue,
    catalogue,
    audit,
  } = usePortal();

  const severe = useMemo(() => severeRecords(records), [records]);
  const stuck = useMemo(() => stuckRecords(records), [records]);
  const filedToday = useMemo(() => records.filter((record) => record.hoursSinceFiled <= 24).length, [records]);
  const openMine = useMemo(
    () => myRecords.filter((record) => record.hasWorkflow && !record.done && !record.returned).length,
    [myRecords],
  );

  const publicForms = useMemo(() => catalogue.filter((entry) => entry.isPublic).length, [catalogue]);
  const unsetForms = useMemo(() => catalogue.filter((entry) => entry.visibility.unset).length, [catalogue]);
  const noWorkflowForms = useMemo(() => catalogue.filter((entry) => !entry.hasWorkflow).length, [catalogue]);

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

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
          {greeting}
        </Typography>
        {/* The account itself is named in the profile menu now, so the page
            header states the day and nothing it already says elsewhere. */}
        <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>{formatTodayDate()}</Typography>
        <Typography sx={{ fontSize: 15, mt: 1.5, fontWeight: 600 }}>{headline}</Typography>
      </Box>

      <Stack
        direction="row"
        spacing={4}
        sx={{ ...PANEL_SX, mb: 3, flexWrap: "wrap", rowGap: 2 }}
      >
        {has("queue") && <Stat value={queue.length} label="waiting on you" tone={queue.length > 0 ? "alert" : "ink"} />}
        <Stat value={myRecords.length} label="filed by you" />
        {records.length > myRecords.length && <Stat value={records.length} label="records you can see" />}
        {access.canSeeEveryRecord && <Stat value={filedToday} label="filed in the last 24 h" />}
        {access.canSeeOperations && (
          <Stat value={stuck.length} label="past SLA" tone={stuck.length > 0 ? "alert" : "ink"} />
        )}
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" },
          gap: 2.5,
          alignItems: "stretch",
        }}
      >
        {has("queue") && (
          <SectionCard
            title={access.isEvaluator ? "To evaluate" : "To approve"}
            hint={hint("queue")}
            count={queue.length}
            action={access.isEvaluator ? "Open the evaluation queue" : "Open your approvals"}
            onOpen={() => setScreen("queue")}
          >
            {queue.length === 0 ? (
              <Empty>Your queue is clear.</Empty>
            ) : (
              <Stack divider={<Box sx={{ borderTop: editorialHairline }} />}>
                {queue.slice(0, 3).map((record) => (
                  <RecordLine
                    key={record.reference}
                    record={record}
                    onOpen={() => openDrawer(record.reference)}
                    right={
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => openDrawer(record.reference)}
                        sx={{ minHeight: 32 }}
                      >
                        Review
                      </Button>
                    }
                  />
                ))}
              </Stack>
            )}
          </SectionCard>
        )}

        <SectionCard
          title="My submissions"
          hint={hint("mine")}
          count={myRecords.length}
          action="See everything you filed"
          onOpen={() => setScreen("mine")}
        >
          {myRecords.length === 0 ? (
            <Empty>You have not filed anything yet.</Empty>
          ) : (
            <Stack divider={<Box sx={{ borderTop: editorialHairline }} />}>
              {myRecords.slice(0, 3).map((record) => (
                <RecordLine
                  key={record.reference}
                  record={record}
                  onOpen={() => openDrawer(record.reference)}
                  right={<StatusPill status={record.status} />}
                />
              ))}
            </Stack>
          )}
        </SectionCard>

        {has("file") && (
          <SectionCard
            title="File a form"
            hint={hint("file")}
            count={catalogue.length}
            action="Pick a form type"
            onOpen={() => setScreen("file")}
          >
            {catalogue.length === 0 ? (
              <Empty>No form types are published yet.</Empty>
            ) : (
              <Stack divider={<Box sx={{ borderTop: editorialHairline }} />}>
                {[...catalogue]
                  .sort((a, b) => b.volume - a.volume)
                  .slice(0, 3)
                  .map((entry) => (
                    <Stack
                      key={entry.listTitle}
                      direction="row"
                      spacing={1.5}
                      sx={{ alignItems: "center", justifyContent: "space-between", py: 1.1 }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 700 }} noWrap>
                          {entry.name}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: editorial.muted }} noWrap>
                          {entry.workflow.shortLabel}
                          {entry.firstApprover ? ` · first to ${entry.firstApprover}` : ""}
                        </Typography>
                      </Box>
                      <Button size="small" onClick={() => setScreen("file")} sx={{ flex: "none", minHeight: 32 }}>
                        File
                      </Button>
                    </Stack>
                  ))}
              </Stack>
            )}
          </SectionCard>
        )}

        {has("today") && (
          <SectionCard
            title="Today"
            hint={hint("today")}
            count={severe.length + stuck.length}
            action="Open the operations view"
            onOpen={() => setScreen("today")}
          >
            {severe.length === 0 && stuck.length === 0 ? (
              <Empty>Nothing high-severity and nothing past its SLA.</Empty>
            ) : (
              <Stack divider={<Box sx={{ borderTop: editorialHairline }} />}>
                {severe.slice(0, 2).map((record) => (
                  <RecordLine
                    key={`severe-${record.reference}`}
                    record={record}
                    onOpen={() => openDrawer(record.reference)}
                    right={<SeverityPill label={record.severity} tone={record.tone} />}
                  />
                ))}
                {stuck.slice(0, 2).map((record) => (
                  <RecordLine
                    key={`stuck-${record.reference}`}
                    record={record}
                    onOpen={() => openDrawer(record.reference)}
                    right={
                      <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: editorial.error, whiteSpace: "nowrap" }}>
                        {record.ageOnLayerLabel}
                      </Typography>
                    }
                  />
                ))}
              </Stack>
            )}
          </SectionCard>
        )}

        {has("subs") && (
          <SectionCard
            title={access.isAuditor ? "Records" : access.canSeeEveryRecord ? "All submissions" : "Records you are on"}
            hint={hint("subs")}
            count={records.length}
            action="Browse and filter everything"
            onOpen={() => setScreen("subs")}
          >
            {records.length === 0 ? (
              <Empty>Nothing has been filed yet.</Empty>
            ) : (
              <Stack divider={<Box sx={{ borderTop: editorialHairline }} />}>
                {records.slice(0, 3).map((record) => (
                  <RecordLine
                    key={record.reference}
                    record={record}
                    onOpen={() => openDrawer(record.reference)}
                    right={<StatusPill status={record.status} />}
                  />
                ))}
              </Stack>
            )}
          </SectionCard>
        )}

        {has("cat") && (
          <SectionCard
            title="Form catalogue"
            hint={hint("cat")}
            count={catalogue.length}
            action="Review what each form does"
            onOpen={() => setScreen("cat")}
          >
            <Stack spacing={0.9} sx={{ py: 0.5 }}>
              <Typography sx={{ fontSize: 13 }}>
                <strong>{publicForms}</strong> reachable without signing in ·{" "}
                <strong>{catalogue.length - publicForms}</strong> internal
              </Typography>
              <Typography sx={{ fontSize: 13 }}>
                <strong>{noWorkflowForms}</strong> with no approval step ·{" "}
                <strong>{catalogue.length - noWorkflowForms}</strong> with a chain
              </Typography>
              {unsetForms > 0 && (
                <Typography sx={{ fontSize: 12.5, color: editorial.warning, fontWeight: 700 }}>
                  {unsetForms} {unsetForms === 1 ? "form has" : "forms have"} no public/internal setting, so the link is
                  open by default.
                </Typography>
              )}
            </Stack>
          </SectionCard>
        )}

        {has("people") && (
          <SectionCard
            title="People & roles"
            hint={hint("people")}
            count={null}
            action="See who holds which role"
            onOpen={() => setScreen("people")}
          >
            <Empty>An approval layer points at a role, not a person — which is what makes reassignment safe.</Empty>
          </SectionCard>
        )}

        {has("audit") && (
          <SectionCard
            title="Audit trail"
            hint={hint("audit")}
            count={audit.length}
            action="Open the full trail"
            onOpen={() => setScreen("audit")}
          >
            {audit.length === 0 ? (
              <Empty>Nothing has been recorded yet.</Empty>
            ) : (
              <Stack divider={<Box sx={{ borderTop: editorialHairline }} />}>
                {audit.slice(0, 3).map((entry, index) => (
                  <Box key={`${entry.at}-${entry.reference}-${index}`} sx={{ py: 1.1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13 }} noWrap>
                      {entry.event}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: editorial.muted }} noWrap>
                      {entry.whenLabel} · {entry.reference} · {entry.who}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </SectionCard>
        )}

        <SectionCard
          title="Settings"
          hint={hint("settings")}
          count={null}
          action="Open settings"
          onOpen={() => setScreen("settings")}
        >
          <Empty>Choose where you land, how dense the tables are, and review exactly what this account can do.</Empty>
        </SectionCard>
      </Box>
    </Box>
  );
}

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Stack, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { editorial } from "../../theme/editorial";
import { liftSx, panelSx, radius } from "../../theme/surfaces";
import ReferenceTag from "../../components/ReferenceTag";
import { PageHeader, TaskRow, Widget, WidgetCount, WidgetEmpty, WidgetGrid } from "../../components/Widget";
import { usePortal } from "../../contexts/PortalContext";
import { StatusPill } from "../../components/portal/PortalPills";
import { IntakeChart, StatTile, StatTileRow, StatusMix } from "../../components/portal/PortalStats";
import { FlowPanel, blueprintSteps } from "../../components/portal/FlowStrip";
import { portalStats, scopeToForm } from "../../utils/portalStats";
import { recordKey } from "../../utils/portalRecords";
import { normalizeEmail } from "../../utils/portalPeople";
import type { CatalogueEntry, StatFilter } from "../../types";

/**
 * One of the three doors out of this screen.
 *
 * Deliberately large and deliberately explicit about what is behind it: this
 * screen exists because "open the dashboard and work out where the permits
 * are" was the actual task people faced, and a door labelled with its own count
 * answers that before it is opened. A door with nowhere to go is rendered
 * disabled with the reason on it rather than hidden, so the absence is
 * explained instead of being mistaken for a missing feature.
 */
function Door({
  eyebrow,
  title,
  detail,
  count,
  tone = "ink",
  primary = false,
  disabledReason,
  onOpen,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  count?: number;
  tone?: "ink" | "alert";
  primary?: boolean;
  disabledReason?: string;
  onOpen: () => void;
}) {
  const disabled = Boolean(disabledReason);
  const accent = tone === "alert" ? editorial.error : editorial.pmwBlue;

  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      onClick={onOpen}
      sx={{
        ...panelSx,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: 128,
        textAlign: "left",
        font: "inherit",
        color: "inherit",
        p: { xs: 1.75, sm: 2 },
        borderColor: primary ? accent : editorial.border,
        backgroundColor: primary ? editorial.blueWash : editorial.panel,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.62 : 1,
        transition: liftSx.transition,
        "&:hover:not(:disabled)": { ...liftSx["&:hover"], borderColor: accent },
        "&:active:not(:disabled)": { transform: "translateY(0)" },
        "@media (prefers-reduced-motion: reduce)": {
          transition: "none",
          "&:hover:not(:disabled)": { transform: "none" },
        },
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", justifyContent: "space-between", width: "100%" }}>
        <Typography
          sx={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: primary ? editorial.pmwBlueDark : editorial.softMuted,
          }}
        >
          {eyebrow}
        </Typography>
        {count !== undefined && (
          <Typography
            sx={{
              fontSize: 24,
              fontWeight: 700,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              flex: "none",
              color: count === 0 ? editorial.softMuted : tone === "alert" ? editorial.error : editorial.ink,
            }}
          >
            {count}
          </Typography>
        )}
      </Stack>

      <Typography sx={{ fontSize: { xs: 17, sm: 18.5 }, fontWeight: 700, lineHeight: 1.25, mt: 0.75 }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 0.4, lineHeight: 1.4 }}>
        {disabledReason ?? detail}
      </Typography>

      {!disabled && (
        <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: editorial.pmwBlueDark, mt: "auto", pt: 1.25 }}>
          Open →
        </Typography>
      )}
    </Box>
  );
}

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "blue" | "purple" }) {
  const colours = {
    muted: { color: editorial.muted, backgroundColor: editorial.paper, borderColor: editorial.border },
    blue: { color: editorial.pmwBlueDark, backgroundColor: editorial.blueWash, borderColor: editorial.pmwBlueSoft },
    purple: { color: editorial.pmwPurpleDark, backgroundColor: editorial.pmwPurpleSoft, borderColor: editorial.pmwPurpleSoft },
  }[tone];

  return (
    <Box
      component="span"
      sx={{
        ...colours,
        display: "inline-flex",
        alignItems: "center",
        fontSize: 11,
        fontWeight: 700,
        px: 0.9,
        py: 0.3,
        borderRadius: radius.full,
        border: "1px solid",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Box>
  );
}

/**
 * One form type's workspace.
 *
 * The portal used to answer "what can I do here?" with a nav of nine pages, all
 * of them cross-form: you picked *an activity* and then filtered down to the
 * form you cared about. People do not work that way — they arrive holding a
 * permit to work, not an intention to browse submissions. So this screen turns
 * it around: pick the form first, and every route it has is on one page — file
 * a new one, see all of them, see your own, or deal with the ones on your
 * layer — alongside what that form actually does after submit.
 */
export default function FormHubScreen() {
  const { catalogue, focusForm, setScreen, records, myRecords, queue, access, userEmail, openDrawer } = usePortal();
  const navigate = useNavigate();

  const entry = useMemo<CatalogueEntry | null>(
    () => catalogue.find((item) => item.listTitle === focusForm) ?? null,
    [catalogue, focusForm],
  );

  const email = normalizeEmail(userEmail);
  const formRecords = useMemo(() => scopeToForm(records, entry?.listTitle ?? null), [records, entry]);
  const formMine = useMemo(() => scopeToForm(myRecords, entry?.listTitle ?? null), [myRecords, entry]);
  const formQueue = useMemo(() => scopeToForm(queue, entry?.listTitle ?? null), [queue, entry]);
  const stats = useMemo(
    () => portalStats({ records: formRecords, userEmail, catalogue: entry ? [entry] : [] }),
    [formRecords, userEmail, entry],
  );

  // A scope that no longer resolves — a form withdrawn from the catalogue mid
  // session — lands on the picker rather than an empty page about nothing.
  if (!entry) {
    return (
      <Box sx={{ maxWidth: 640 }}>
        <Typography component="h1" sx={{ fontSize: { xs: 26, sm: 32 }, fontWeight: 700 }}>
          Pick a form
        </Typography>
        <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5, mb: 2.5 }}>
          That form type is not in the catalogue any more.
        </Typography>
        <Button variant="contained" onClick={() => setScreen("home")} sx={{ minHeight: 44 }}>
          Back to the dashboard
        </Button>
      </Box>
    );
  }

  const short = entry.name;
  // "Everything" is only a wider set than "mine" when this account is actually
  // on somebody else's filings — otherwise the two doors would be one list
  // twice, which is what made the old dashboard feel redundant.
  const seesBeyondOwn = access.canSeeEveryRecord || formRecords.length > formMine.length;

  const openList = (scope: "all" | "mine", filter?: StatFilter) =>
    setScreen(scope === "mine" ? "mine" : "subs", entry.listTitle, filter);

  return (
    <Box>
      <PageHeader
        title={short}
        subtitle={
          entry.hasWorkflow
            ? `${entry.workflow.label}${entry.firstApprover ? ` · first to ${entry.firstApprover}` : ""}`
            : "no approval step — filing it is the whole of it"
        }
        back={
          <Button
            onClick={() => setScreen("home")}
            startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
            sx={{ minHeight: 36, px: 0.75, ml: -0.75, mb: 1.5, fontSize: 12.5, color: editorial.muted }}
          >
            All forms
          </Button>
        }
        eyebrow={
          <Stack
            component="span"
            direction="row"
            spacing={0.75}
            sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}
          >
            <ReferenceTag value={entry.code} size="md" />
            <Badge tone={entry.workflow.kind === "evaluation" ? "purple" : entry.hasWorkflow ? "blue" : "muted"}>
              {entry.workflow.shortLabel}
            </Badge>
            <Badge tone={entry.isPublic ? "blue" : "muted"}>{entry.visibility.label}</Badge>
            {/* Only a form that declared an SLA advertises one. */}
            {entry.hasSla && <Badge>{entry.slaDays}-day SLA per layer</Badge>}
          </Stack>
        }
      />

      <WidgetGrid min={230} sx={{ mb: 3.5 }}>
        <Door
          primary
          eyebrow="File"
          title={`New ${short}`}
          detail={
            entry.hasWorkflow
              ? `Opens the published form · goes to ${entry.firstApprover || "the first approver"}`
              : "Opens the published form · filed straight to the record"
          }
          disabledReason={
            !access.canFile
              ? "This account is read only and cannot file forms."
              : !entry.slug
                ? "No published link yet — republish this form in the form builder."
                : undefined
          }
          onOpen={() => navigate(`/form/${encodeURIComponent(entry.slug)}`)}
        />

        {formQueue.length > 0 && (
          <Door
            eyebrow="Take action"
            title="On your layer now"
            detail={
              access.isEvaluator
                ? "Evaluate, and each one routes onward"
                : "Signing releases each one to the next approver"
            }
            count={formQueue.length}
            tone="alert"
            onOpen={() => setScreen("queue", entry.listTitle)}
          />
        )}

        <Door
          eyebrow="Yours"
          title={`My ${short}`}
          detail="Everything you filed, including from a QR poster with this email"
          count={formMine.length}
          onOpen={() => openList("mine")}
        />

        {seesBeyondOwn && (
          <Door
            eyebrow={access.canSeeEveryRecord ? "Everything" : "Beyond your own"}
            title={`All ${short}`}
            detail={
              access.canSeeEveryRecord
                ? "Every one on record, whichever door it came through"
                : "Everything you are on a layer of, including what you signed"
            }
            count={formRecords.length}
            onOpen={() => openList("all")}
          />
        )}
      </WidgetGrid>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.15fr) minmax(0, 1fr)" },
          gap: { xs: 1.5, sm: 2 },
          mb: 2.5,
          alignItems: "stretch",
        }}
      >
        <FlowPanel
          title="What happens after you submit"
          caption={
            entry.hasWorkflow
              ? `${entry.workflow.totalLayers} ${entry.workflow.totalLayers === 1 ? "step" : "steps"}, in this order`
              : "one step, and it is yours"
          }
          steps={blueprintSteps(entry)}
        />

        <Widget
          title="Where they stand"
          caption="press a status to open that list"
          meta={<WidgetCount value={stats.total} />}
          onOpen={() => openList("all")}
          openLabel={`Open all ${short}`}
        >
          <StatusMix buckets={stats.breakdown} onPick={(bucket) => openList("all", bucket.id)} />
        </Widget>
      </Box>

      <Box sx={{ mb: 2.5 }}>
        <StatTileRow>
          <StatTile
            value={stats.total}
            label="On record"
            hint="all time"
            onClick={() => openList("all", "all")}
          />
          <StatTile
            value={stats.open}
            label="Still moving"
            hint="in the chain now"
            onClick={() => openList("all", "open")}
          />
          {/* An SLA nobody set is not a target of zero — the tile is absent. */}
          {stats.hasSla && (
            <StatTile
              value={stats.overdue}
              label="Past SLA"
              hint={`over ${entry.slaDays} days on a layer`}
              tone="alert"
              onClick={() => openList("all", "Past SLA")}
            />
          )}
          <StatTile value={stats.filedToday} label="Filed today" hint="since midnight" onClick={() => openList("all", "all")} />
          <StatTile value={stats.last30} label="Last 30 days" hint="intake volume" onClick={() => openList("all", "all")} />
        </StatTileRow>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) minmax(0, 1.15fr)" },
          gap: { xs: 1.5, sm: 2 },
          alignItems: "stretch",
        }}
      >
        <Widget
          title="Intake, last 14 days"
          caption="today is the last bar"
          meta={<WidgetCount value={stats.last7} tone="muted" />}
          onOpen={() => openList("all", "all")}
          openLabel={`Open all ${short}`}
        >
          <IntakeChart days={stats.daily} onPickDay={() => openList("all", "all")} />
        </Widget>

        <Widget
          title="Latest"
          caption="newest first"
          onOpen={formRecords.length > 5 ? () => openList("all") : undefined}
          openLabel={`See all ${formRecords.length}`}
          footer={
            formRecords.length > 5 ? (
              <Button size="small" onClick={() => openList("all")} sx={{ px: 0, minWidth: 0, fontWeight: 800 }}>
                See all {formRecords.length} →
              </Button>
            ) : undefined
          }
        >
          {formRecords.length === 0 ? (
            <WidgetEmpty>Nothing has been filed on this form yet.</WidgetEmpty>
          ) : (
            <Box>
              {formRecords.slice(0, 5).map((record) => (
                <TaskRow
                  key={recordKey(record)}
                  title={record.subject}
                  description={
                    <Stack component="span" direction="row" spacing={0.6} sx={{ alignItems: "center", minWidth: 0 }}>
                      <ReferenceTag value={record.reference} sx={{ flex: "none" }} />
                      <Box component="span" sx={{ minWidth: 0 }}>
                        {record.submitterEmail === email ? "you" : record.submitter} · {record.filedLabel}
                      </Box>
                    </Stack>
                  }
                  onOpen={() => openDrawer(recordKey(record))}
                  action={<StatusPill status={record.status} />}
                />
              ))}
            </Box>
          )}
        </Widget>
      </Box>
    </Box>
  );
}

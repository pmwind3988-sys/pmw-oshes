import { Box, Stack, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import type { CatalogueEntry, PortalRecord } from "../../types";

/**
 * What happens after you press submit, drawn once.
 *
 * The portal could always *list* a form's approval chain, but only as a table
 * column full of role names — which answers "who signs" and not "what should I
 * expect". This says the whole journey in order, starting from the step the
 * reader performs ("You file it") and ending at the state it lands in, so a
 * person filing a form for the first time can see the end of it before they
 * start.
 *
 * It renders in two modes off the same steps:
 *   - **Blueprint** (a form type): what will happen, nothing done yet.
 *   - **Progress** (one record): the same steps with the ones already signed
 *     marked, and the current one called out.
 *
 * The step list is derived from configuration, never invented. A form with no
 * approval step gets a two-step flow that says so, because "filed and that is
 * the end of it" is a real answer people need and an empty timeline is not.
 */

export interface FlowStep {
  /** "You" for the filer's own step, otherwise the layer number. */
  marker: string;
  title: string;
  detail: string;
  state: "done" | "current" | "todo";
  /** Evaluation layers are drawn in the purple accent the rest of the app uses for them. */
  kind: "file" | "approval" | "evaluation" | "end";
}

function stepColour(step: FlowStep): string {
  if (step.state === "todo") return editorial.border;
  if (step.kind === "evaluation") return editorial.pmwPurple;
  if (step.kind === "end") return editorial.success;
  return editorial.pmwBlue;
}

/** The flow a form type promises, before anything has been filed against it. */
export function blueprintSteps(entry: CatalogueEntry): FlowStep[] {
  const steps: FlowStep[] = [
    {
      marker: "You",
      title: "File the form",
      detail: entry.isPublic ? "Open by link or QR poster — no sign-in needed" : "Signed in, from this portal",
      state: "todo",
      kind: "file",
    },
  ];

  entry.layers.forEach((layer, index) => {
    const evaluation = layer.type === "evaluation";
    steps.push({
      marker: String(index + 1),
      title: entry.chain[index] ?? `Layer ${index + 1}`,
      detail: evaluation ? "Evaluates, then releases it onward" : "Signs, then it moves to the next step",
      state: "todo",
      kind: evaluation ? "evaluation" : "approval",
    });
  });

  steps.push({
    marker: "✓",
    title: entry.hasWorkflow ? "Approved and closed" : "Recorded",
    detail: entry.hasWorkflow
      ? "You are notified, and the PDF carries every signature"
      : "This form has no approval step — filing it is the whole of it",
    state: "todo",
    kind: "end",
  });

  return steps;
}

/** The same flow for one record, with the steps it has actually been through marked. */
export function recordSteps(record: PortalRecord, youEmail: string): FlowStep[] {
  const steps: FlowStep[] = [
    {
      marker: "You",
      title: record.submitterEmail === youEmail ? "You filed it" : `Filed by ${record.submitter}`,
      detail: record.filedLabel,
      state: "done",
      kind: "file",
    },
  ];

  record.chain.forEach((step) => {
    const evaluation = step.type === "evaluation";
    steps.push({
      marker: String(step.layerNumber),
      title: step.who,
      detail: `${step.roleLabel} · ${step.statusText}`,
      state: step.state === "signed" ? "done" : step.state === "current" ? "current" : "todo",
      kind: evaluation ? "evaluation" : "approval",
    });
  });

  steps.push({
    marker: "✓",
    title: record.hasWorkflow ? "Approved and closed" : "Recorded",
    detail: record.done ? record.status : record.hasWorkflow ? "Not there yet" : "Complete on arrival",
    state: record.done ? "done" : "todo",
    kind: "end",
  });

  return steps;
}

/**
 * The steps, horizontally where there is room and vertically on a phone.
 *
 * Both orientations come from one array — a phone gets the same flow, not a
 * truncated one — because the step someone needs to see is often the last, and
 * a horizontally scrolling timeline hides exactly that.
 */
export default function FlowStrip({ steps, dense = false }: { steps: FlowStep[]; dense?: boolean }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        alignItems: { md: "flex-start" },
        gap: { xs: 0, md: 0.5 },
      }}
    >
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const colour = stepColour(step);
        const filled = step.state === "done";
        const ringed = step.state !== "todo";

        return (
          <Box
            key={`${step.marker}-${step.title}-${index}`}
            sx={{
              display: "flex",
              flexDirection: { xs: "row", md: "column" },
              alignItems: { xs: "flex-start", md: "stretch" },
              gap: { xs: 1.25, md: 0 },
              flex: { md: 1 },
              minWidth: 0,
              pb: { xs: last ? 0 : 1.75, md: 0 },
            }}
          >
            {/* The rail: dot plus connector. Horizontal on desktop, vertical on a
                phone, so the connector always points the way the eye is reading. */}
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                alignItems: "center",
                flex: { xs: "none", md: "0 0 auto" },
                alignSelf: { xs: "stretch", md: "auto" },
                width: { xs: 22, md: "auto" },
              }}
            >
              <Box
                sx={{
                  flex: "none",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  border: `1.5px solid ${ringed ? colour : editorial.border}`,
                  backgroundColor: filled ? colour : editorial.panel,
                  color: filled ? editorial.white : ringed ? colour : editorial.softMuted,
                  fontSize: 10,
                  fontWeight: 800,
                  lineHeight: 1,
                  // The step being waited on is the one people are looking for.
                  boxShadow: step.state === "current" ? `0 0 0 4px ${editorial.blueWash}` : "none",
                }}
              >
                {step.marker}
              </Box>
              {!last && (
                <Box
                  sx={{
                    backgroundColor: filled ? colour : editorial.border,
                    width: { xs: "1.5px", md: "auto" },
                    height: { xs: "auto", md: "1.5px" },
                    flex: 1,
                    minHeight: { xs: 14, md: 0 },
                    my: { xs: 0.4, md: 0 },
                    mx: { xs: 0, md: 0.5 },
                  }}
                />
              )}
            </Box>

            <Box sx={{ minWidth: 0, pt: { md: 1 }, pr: { md: 1.5 } }}>
              <Typography
                sx={{
                  fontSize: dense ? 12.5 : 13,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  color: step.state === "todo" ? editorial.muted : editorial.ink,
                }}
              >
                {step.title}
              </Typography>
              <Typography sx={{ fontSize: 11, color: editorial.muted, lineHeight: 1.35, mt: 0.15 }}>
                {step.detail}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** The flow inside a bordered panel with a heading — the shape both screens want. */
export function FlowPanel({
  title,
  caption,
  steps,
}: {
  title: string;
  caption: string;
  steps: FlowStep[];
}) {
  return (
    <Box
      sx={{
        backgroundColor: editorial.panel,
        border: editorialHairline,
        borderRadius: "14px",
        p: { xs: 1.75, sm: 2 },
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 1.75 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{title}</Typography>
          <Typography sx={{ fontSize: 12, color: editorial.muted }}>{caption}</Typography>
        </Box>
      </Stack>
      <FlowStrip steps={steps} />
    </Box>
  );
}

import { useMemo } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { buildFormSubmissionSections, type FormSubmissionField } from "../../utils/formSubmissionLayout";
import { formatPdfFieldValue } from "../../utils/pdfFieldFormatting";
import { isPlaceholderDisplayValue } from "../../utils/submissionDisplay";
import { formatDisplayDayMonthTime } from "../../utils/displayDateTime";
import FlowStrip, { recordSteps } from "./FlowStrip";
import type { AuditEntry, PortalRecord, SurveyJson } from "../../types";

/**
 * The parts a record's detail view is made of.
 *
 * Split out of the drawer so the layout is one thing and the actions are
 * another: the drawer decides what this account may *do* with a record, and
 * this file decides how a record *reads*. That separation is what lets the
 * same detail render for an approver with three buttons and an audit account
 * with none, without either version drifting.
 */

/**
 * A label/value row.
 *
 * Label left, value right, hairline between — the shape a specification sheet
 * has had for a century, and it is used here for the same reason: the eye scans
 * one column for the field it wants and reads straight across. A missing value
 * says so in muted text rather than collapsing, because a blank row reads as a
 * loading failure.
 */
export function DetailRow({ label, value, tone = "ink" }: { label: string; value: string; tone?: "ink" | "muted" | "alert" }) {
  const missing = !value.trim();
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 2,
        py: 1.25,
        borderBottom: editorialHairline,
        "&:last-of-type": { borderBottom: "none" },
      }}
    >
      <Typography sx={{ fontSize: 13, color: editorial.muted, flex: "none" }}>{label}</Typography>
      <Typography
        sx={{
          fontSize: 13.5,
          fontWeight: missing ? 400 : 600,
          textAlign: "right",
          minWidth: 0,
          wordBreak: "break-word",
          color: missing ? editorial.softMuted : tone === "alert" ? editorial.error : tone === "muted" ? editorial.muted : editorial.ink,
        }}
      >
        {missing ? "Not captured" : value}
      </Typography>
    </Stack>
  );
}

/** A soft-filled card for a self-contained block — targets, notes, warnings. */
export function SoftCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <Box sx={{ backgroundColor: editorial.paper, border: editorialHairline, borderRadius: "12px", p: 1.75 }}>
      {title && (
        <Typography sx={{ fontSize: 13.5, fontWeight: 700, mb: 1 }}>{title}</Typography>
      )}
      {children}
    </Box>
  );
}

function TargetRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between", alignItems: "baseline", py: 0.55 }}>
      <Typography sx={{ fontSize: 12.5, color: editorial.muted }}>{label}</Typography>
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {value}
      </Typography>
    </Stack>
  );
}

/**
 * Overview — the facts on the left, the substance and the targets on the right.
 *
 * The SLA block appears only for a record whose form actually declared one.
 * There is no "SLA: none" state and no zero-day target: a form without an SLA
 * is not a form failing its SLA, and rendering an empty deadline card was how
 * the old dashboard came to show a red breach on forms nobody had given a
 * deadline to.
 */
export function OverviewTab({ record }: { record: PortalRecord }) {
  const facts = [
    { label: "Form", value: record.formName },
    { label: "Reference", value: record.reference },
    { label: "Filed", value: record.filedAt ? formatDisplayDayMonthTime(record.filedAt) : "" },
    { label: "Source", value: record.source },
    { label: "Location", value: record.location },
    { label: "Reported by", value: record.submitter },
    { label: "Severity", value: record.severity },
    { label: "Photos", value: record.photos === 0 ? "None" : `${record.photos} attached` },
    { label: "Stage", value: record.stage },
  ];

  if (record.hasWorkflow && !record.done && !record.returned) {
    facts.push({ label: "Waiting on", value: `${record.currentAssignee} · ${record.currentRole}` });
    facts.push({ label: "On this layer", value: record.ageOnLayerLabel });
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 0.85fr)" },
        gap: { xs: 2.5, md: 4 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>{facts.map((fact) => <DetailRow key={fact.label} {...fact} />)}</Box>

      <Stack spacing={2} sx={{ minWidth: 0 }}>
        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.75 }}>What was reported</Typography>
          <Typography sx={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {record.subject}
          </Typography>
        </Box>

        {record.hasSla && (
          <SoftCard title={`SLA target · ${record.slaDays} ${record.slaDays === 1 ? "day" : "days"} per layer`}>
            <TargetRow label="On this layer" value={record.ageOnLayerLabel} />
            <TargetRow label="Target" value={`${record.slaDays} d`} />
            <Stack
              direction="row"
              spacing={2}
              sx={{ justifyContent: "space-between", alignItems: "baseline", pt: 0.9, mt: 0.5, borderTop: editorialHairline }}
            >
              <Typography sx={{ fontSize: 12.5, color: editorial.muted }}>Status</Typography>
              <Typography
                sx={{
                  fontSize: 12.5,
                  fontWeight: 800,
                  color: record.overdue ? editorial.error : editorial.success,
                  whiteSpace: "nowrap",
                }}
              >
                {record.done || record.returned ? "Closed" : record.overdue ? "Breached" : "On target"}
              </Typography>
            </Stack>
          </SoftCard>
        )}

        <SoftCard title="What happens next">
          <Typography sx={{ fontSize: 12.5, color: editorial.muted, lineHeight: 1.5 }}>
            {record.done
              ? `This record is ${record.status.toLowerCase()}. Nothing further is expected of anyone.`
              : record.returned
                ? "It has been returned to the person who filed it. It moves again once they resubmit."
                : record.hasWorkflow
                  ? `${record.currentAssignee || record.currentRole} is on ${record.layerLabel.toLowerCase()}. Signing releases it to the step after theirs.`
                  : "This form has no approval step. Filing it was the whole of it — nothing is waiting."}
          </Typography>
        </SoftCard>
      </Stack>
    </Box>
  );
}

/**
 * One answer as text, formatted by what its question is.
 *
 * The same formatter the PDF and the CSV use, rather than a second one here:
 * a date is a date, a choice shows its label not its stored code, and a file
 * shows its name. The reader who checks the record against the printed permit
 * is checking the same words.
 */
function answerText(field: FormSubmissionField): string {
  return formatPdfFieldValue(field.value, field);
}

/**
 * Whether there is anything to show.
 *
 * Asked of the formatted text, never of the raw value. A list of rows and a
 * SharePoint file reference are both objects that carry no readable name of
 * their own, and testing those directly reported them as empty — which is how
 * a permit's whole work-performer list came to be missing from this tab while
 * sitting in the record all along.
 */
function hasAnswerToShow(field: FormSubmissionField): boolean {
  if (field.kind === "matrix") return (field.matrixRows?.length ?? 0) > 0;
  return !isPlaceholderDisplayValue(answerText(field));
}

/**
 * A repeating panel or a matrix: one row per entry, one column per question.
 *
 * Set full width rather than in the label/value grid the scalar answers use —
 * a crew of six squeezed into the right-hand column is unreadable, and this is
 * usually the part of a permit somebody opened the record to check.
 */
function AnswerTable({ field }: { field: FormSubmissionField }) {
  const rows = field.matrixRows ?? [];
  const columns = field.matrixColumns?.length
    ? field.matrixColumns
    : [...new Set(rows.flatMap((row) => Object.keys(row)))].map((name) => ({ name, title: name, cellType: undefined, choices: undefined }));

  return (
    <Box sx={{ py: 1.25, borderBottom: editorialHairline, "&:last-of-type": { borderBottom: "none" } }}>
      <Typography sx={{ fontSize: 13, color: editorial.muted, mb: 0.75 }}>{field.label}</Typography>
      <Box sx={{ overflowX: "auto" }}>
        <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <Box component="thead">
            <Box component="tr">
              {columns.map((column) => (
                <Box
                  component="th"
                  key={column.name}
                  sx={{
                    textAlign: "left",
                    fontWeight: 700,
                    color: editorial.softMuted,
                    padding: "6px 10px 6px 0",
                    borderBottom: editorialHairline,
                    whiteSpace: "nowrap",
                  }}
                >
                  {column.title || column.name}
                </Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {rows.map((row, index) => (
              <Box component="tr" key={index}>
                {columns.map((column) => (
                  <Box
                    component="td"
                    key={column.name}
                    sx={{
                      padding: "6px 10px 6px 0",
                      borderBottom: editorialHairline,
                      color: editorial.ink,
                      verticalAlign: "top",
                      wordBreak: "break-word",
                    }}
                  >
                    {formatPdfFieldValue(row[column.name], { type: column.cellType, inputType: column.cellType, choices: column.choices }) || "—"}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Every answer on the form, in the order it was asked.
 *
 * Rendered from the published schema where there is one, so questions keep
 * their real titles and their page groupings, and falls back to the raw stored
 * keys where the schema could not be loaded — a readable-but-ugly answer beats
 * an empty tab.
 */
export function AnswersTab({ record, surveyJson }: { record: PortalRecord; surveyJson: SurveyJson | null }) {
  const sections = useMemo(
    () =>
      buildFormSubmissionSections(surveyJson ?? record.submission.surveyJson ?? null, record.submission.submissionData, {
        fallbackSectionTitle: "Submitted answers",
        formatFallbackLabel: (key) => key.replace(/_x[0-9a-f]{4}_/gi, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim(),
      }),
    [surveyJson, record],
  );

  const rendered = sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter(hasAnswerToShow),
    }))
    .filter((section) => section.fields.length > 0);

  if (rendered.length === 0) {
    return (
      <Typography sx={{ fontSize: 13, color: editorial.muted, py: 1 }}>
        No answers were stored against this submission.
      </Typography>
    );
  }

  return (
    <Stack spacing={3}>
      {rendered.map((section) => (
        <Box key={section.id} sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              color: editorial.softMuted,
              mb: 0.5,
            }}
          >
            {section.title}
          </Typography>
          {section.fields.map((field) =>
            field.kind === "matrix" ? (
              <AnswerTable key={field.key} field={field} />
            ) : (
              <DetailRow key={field.key} label={field.label} value={answerText(field)} />
            ),
          )}
        </Box>
      ))}
    </Stack>
  );
}

/**
 * The approval chain as a timeline.
 *
 * A form with no chain gets a sentence, not an empty timeline — silence there
 * reads as "the approvals have not loaded yet", which is a different and much
 * more alarming claim than "this form needs no signature".
 */
export function ApprovalsTab({ record, youEmail }: { record: PortalRecord; youEmail: string }) {
  if (!record.hasWorkflow) {
    return (
      <Box>
        <Typography sx={{ fontSize: 14.5, fontWeight: 700, mb: 0.5 }}>No approval step</Typography>
        <Typography sx={{ fontSize: 13, color: editorial.muted, lineHeight: 1.55 }}>
          This form has no approval or evaluation layer. It was filed straight to the record and needs no signature —
          which is why it shows as “Recorded” rather than waiting on anyone.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700, mb: 1.75 }}>
          {record.workflowKind === "evaluation" ? "Evaluation route" : "Approval route"}
        </Typography>
        <FlowStrip steps={recordSteps(record, youEmail)} />
      </Box>

      <Box>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700, mb: 1.25 }}>Layer by layer</Typography>
        <Stack>
          {record.chain.map((step) => (
            <Box
              key={`${step.layerNumber}-${step.roleLabel}`}
              sx={{
                py: 1.25,
                borderBottom: editorialHairline,
                "&:last-of-type": { borderBottom: "none" },
                backgroundColor: step.state === "current" ? editorial.blueWash : "transparent",
                borderRadius: step.state === "current" ? "8px" : 0,
                px: step.state === "current" ? 1.25 : 0,
                mx: step.state === "current" ? -1.25 : 0,
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap", rowGap: 0.25 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 800, color: editorial.softMuted, flex: "none" }}>
                  {step.layerNumber}
                </Typography>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{step.who}</Typography>
                <Typography sx={{ fontSize: 11.5, color: editorial.muted }}>{step.roleLabel}</Typography>
                <Typography
                  sx={{
                    fontSize: 11.5,
                    fontWeight: 800,
                    ml: "auto",
                    flex: "none",
                    color: step.state === "current" ? editorial.pmwBlueDark : editorial.muted,
                  }}
                >
                  {step.statusText}
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: 11.5, color: editorial.muted, mt: 0.2 }}>{step.subText}</Typography>
              {step.note && (
                <Typography
                  sx={{ fontSize: 12.5, mt: 0.75, pl: 1.25, borderLeft: `2px solid ${editorial.border}`, lineHeight: 1.5 }}
                >
                  {step.note}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}

/** Everything the audit trail recorded against this reference, newest first. */
export function TimelineTab({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <Typography sx={{ fontSize: 13, color: editorial.muted, py: 1 }}>
        Nothing has been recorded against this reference yet. Signatures, nudges, reassignments and cancellations all
        appear here as they happen.
      </Typography>
    );
  }

  return (
    <Stack>
      {entries.map((entry, index) => {
        const last = index === entries.length - 1;
        return (
          <Stack key={`${entry.at}-${index}`} direction="row" spacing={1.5} sx={{ alignItems: "stretch" }}>
            <Stack sx={{ alignItems: "center", flex: "none", width: 10 }}>
              <Box
                sx={{
                  width: 9,
                  height: 9,
                  mt: 0.75,
                  flex: "none",
                  borderRadius: "50%",
                  backgroundColor: index === 0 ? editorial.pmwBlue : editorial.border,
                }}
              />
              {!last && <Box sx={{ flex: 1, width: "1px", backgroundColor: editorial.border, my: 0.5 }} />}
            </Stack>
            <Box sx={{ pb: last ? 0 : 2, minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>{entry.event}</Typography>
              <Typography sx={{ fontSize: 11.5, color: editorial.muted, mt: 0.15 }}>
                {entry.whenLabel} · {entry.who}
              </Typography>
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
}

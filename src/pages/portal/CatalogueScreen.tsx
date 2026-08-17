import { Box, Button, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";
import { Callout, DataCell, DataRow, DataTable, PageHeader } from "../../components/Widget";
import ReferenceTag from "../../components/ReferenceTag";
import { usePortal } from "../../contexts/PortalContext";
import { severityCaptureLabel } from "../../utils/portalCatalogue";
import { saveCatalogueSettings } from "../../utils/portalCatalogueWrite";
import type { CatalogueEntry } from "../../types";

const CHIP_SX = {
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
  px: 0.9,
  py: 0.3,
  borderRadius: radius.full,
  border: editorialHairline,
} as const;

/** The chain, or an explicit statement that there is none — silence reads as "unknown". */
function WorkflowCell({ entry }: { entry: CatalogueEntry }) {
  if (!entry.hasWorkflow) {
    return (
      <Box>
        <Box component="span" sx={{ ...CHIP_SX, color: editorial.muted, backgroundColor: editorial.paper }}>
          No approval step
        </Box>
        <Typography sx={{ fontSize: 11, color: editorial.muted, mt: 0.5 }}>
          Submitting is the end of it — filed straight to the record.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
        {entry.chain.map((role, index) => {
          const evaluation = entry.layers[index]?.type === "evaluation";
          return (
            <Box
              key={`${role}-${index}`}
              component="span"
              sx={{
                ...CHIP_SX,
                backgroundColor: evaluation ? editorial.pmwPurpleSoft : editorial.blueSoft,
                color: evaluation ? editorial.pmwPurpleDark : editorial.ink,
              }}
            >
              {index + 1}. {role}
              {evaluation ? " · evaluates" : ""}
            </Box>
          );
        })}
      </Stack>
      <Typography sx={{ fontSize: 11, color: editorial.muted, mt: 0.5 }}>{entry.workflow.label}</Typography>
    </Box>
  );
}

/**
 * Form catalogue — the answer to "the form set must be configurable later".
 * Everything on this screen is data on the form's own LayerConfig, so nothing
 * downstream has to hard-code a form list.
 *
 * Two columns changed meaning here. "Workflow" reports what the form actually
 * does after submit, including the honest answer that it does nothing — the
 * table used to imply an approval chain for every row. And "Who can reach it"
 * reports what an anonymous visitor really gets, which the form page decides at
 * request time, flagging the forms where nobody ever said.
 *
 * The form set itself is authored in the pmw-hrform builder, which owns every
 * write that creates a form. This screen edits operational settings — SLA and
 * the public flag — on forms that already exist.
 */
export default function CatalogueScreen() {
  const { catalogue, spClient, updateCatalogue, toast } = usePortal();

  const unset = catalogue.filter((entry) => entry.visibility.unset);
  const mismatched = catalogue.filter((entry) => entry.visibility.mismatch);

  const persist = async (
    entry: CatalogueEntry,
    patch: Parameters<typeof saveCatalogueSettings>[2],
    optimistic: Partial<CatalogueEntry>,
  ) => {
    updateCatalogue(entry.listTitle, optimistic);
    try {
      await saveCatalogueSettings(spClient, entry, patch);
    } catch (error) {
      updateCatalogue(entry.listTitle, {
        slaDays: entry.slaDays,
        isPublic: entry.isPublic,
        visibility: entry.visibility,
      });
      toast(error instanceof Error ? error.message : "Could not save the catalogue change.");
    }
  };

  const togglePublic = (entry: CatalogueEntry) => {
    const isPublic = !entry.isPublic;
    // Setting it either way also resolves "unset" and any mismatch, because the
    // write puts the same value in both places the flag is read from.
    void persist(
      entry,
      { isPublic },
      {
        isPublic,
        visibility: {
          isPublic,
          declared: isPublic,
          unset: false,
          mismatch: false,
          label: isPublic ? "Public" : "Internal",
          note: isPublic
            ? "Anyone with the link or the QR poster can file this form without signing in."
            : "Only a signed-in account on this tenant can open this form.",
        },
      },
    );
  };

  const setSla = (entry: CatalogueEntry, raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    const slaDays = digits === "" ? 0 : Number(digits);
    updateCatalogue(entry.listTitle, { slaDays });
    if (slaDays > 0) void persist(entry, { slaDays }, { slaDays });
  };

  return (
    <Box>
      <PageHeader
        title="Form catalogue"
        subtitle="what each form does after submit, its per-layer SLA, and who can reach it — all data, not code"
        meta={`${catalogue.length} ${catalogue.length === 1 ? "form type" : "form types"}`}
      />

      {(unset.length > 0 || mismatched.length > 0) && (
        <Callout tone="warning" title="Check who can reach these forms" sx={{ mb: 2.5 }}>
          {unset.length > 0 && (
            <Typography sx={{ fontSize: 13 }}>
              {unset.length} {unset.length === 1 ? "form has" : "forms have"} never had public or internal set, and an
              unset form opens for anyone with the link: {unset.map((entry) => entry.name).join(", ")}. Toggling the
              column below once makes the intent explicit either way.
            </Typography>
          )}
          {mismatched.length > 0 && (
            <Typography sx={{ fontSize: 13, mt: unset.length > 0 ? 0.75 : 0 }}>
              {mismatched.length} {mismatched.length === 1 ? "form has" : "forms have"} a catalogue flag that disagrees
              with the column the form page reads: {mismatched.map((entry) => entry.name).join(", ")}. The link follows
              the column.
            </Typography>
          )}
        </Callout>
      )}

      <DataTable
        minWidth={1000}
        columns={[
          { key: "code", label: "Code", width: 78 },
          { key: "form", label: "Form type", width: 220 },
          { key: "workflow", label: "Workflow" },
          { key: "sla", label: "SLA per layer", width: 120 },
          { key: "reach", label: "Who can reach it", width: 150 },
          { key: "severity", label: "Severity field", width: 120 },
        ]}
      >
        {catalogue.map((entry) => (
          <DataRow key={entry.listTitle}>
            <DataCell>
              <ReferenceTag value={entry.code} />
            </DataCell>
            <DataCell>
              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{entry.name}</Typography>
              <Typography sx={{ fontSize: 11, color: editorial.muted }}>
                {entry.volume} in the last 30 days
              </Typography>
            </DataCell>
            <DataCell>
              <WorkflowCell entry={entry} />
            </DataCell>
            <DataCell>
              {/* A form with no layers has nothing to be late for, so it is
                  not offered an SLA it could never breach. */}
              {entry.hasWorkflow ? (
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <TextField
                    size="small"
                    value={entry.slaDays || ""}
                    onChange={(event) => setSla(entry, event.target.value)}
                    sx={{ width: 52, "& input": { textAlign: "center", fontVariantNumeric: "tabular-nums" } }}
                    slotProps={{ htmlInput: { inputMode: "numeric", "aria-label": `SLA days for ${entry.name}` } }}
                  />
                  <Typography sx={{ fontSize: 12, color: editorial.muted }}>days</Typography>
                </Stack>
              ) : (
                <Typography sx={{ fontSize: 12, color: editorial.muted }}>—</Typography>
              )}
            </DataCell>
            <DataCell>
              <Tooltip title={entry.visibility.note} enterDelay={300}>
                <Button
                  size="small"
                  onClick={() => togglePublic(entry)}
                  sx={{
                    minHeight: 32,
                    px: 1.25,
                    fontSize: 12,
                    textAlign: "left",
                    color:
                      entry.visibility.unset || entry.visibility.mismatch
                        ? editorial.warning
                        : entry.isPublic
                          ? editorial.pmwBlueDark
                          : editorial.muted,
                    backgroundColor:
                      entry.visibility.unset || entry.visibility.mismatch
                        ? editorial.warningWash
                        : entry.isPublic
                          ? editorial.blueWash
                          : "transparent",
                    border: editorialHairline,
                  }}
                >
                  {entry.visibility.label}
                </Button>
              </Tooltip>
            </DataCell>
            <DataCell muted>{severityCaptureLabel(entry.severityCapture)}</DataCell>
          </DataRow>
        ))}
      </DataTable>

      <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 3, maxWidth: "62ch" }}>
        An SLA is opt-in. Leave the box empty and that form has no deadline at all: it is never “past SLA”, and no
        screen shows it an SLA badge, target or breach. There is no global default — one used to apply three working
        days to every form, which meant forms nobody had ever given a deadline still turned red on day four. Forms
        with no approval step are never offered one, because there is nothing for them to be waiting on.
      </Typography>

      <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 1.5, maxWidth: "62ch" }}>
        “Who can reach it” reports what an anonymous visitor actually gets on the form link, which the IsPublic column
        decides at request time — not what the catalogue happens to have stored. A form nobody has set is shown as open,
        because that is what it is.
      </Typography>

      <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 1.5, maxWidth: "62ch" }}>
        New form types are built in the PMW form builder, which is the single place any form is authored. Once a form is
        published there it appears here, and its SLA and public link can be set from this screen.
      </Typography>
    </Box>
  );
}

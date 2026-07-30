import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { PORTAL_SLA_DEFAULT_DAYS } from "../../config/oshes";
import { usePortal } from "../../contexts/PortalContext";
import { severityCaptureLabel } from "../../utils/portalCatalogue";
import { saveCatalogueSettings } from "../../utils/portalCatalogueWrite";
import type { CatalogueEntry } from "../../types";

/**
 * Form catalogue — the answer to "the form set must be configurable later".
 * Everything on this screen is data on the form's own LayerConfig, so nothing
 * downstream has to hard-code a form list.
 *
 * The form set itself is authored in the pmw-hrform builder, which owns every
 * write that creates a form. This screen edits operational settings — SLA and
 * the public flag — on forms that already exist.
 */
export default function CatalogueScreen() {
  const { catalogue, spClient, updateCatalogue, toast } = usePortal();

  const persist = async (entry: CatalogueEntry, patch: Parameters<typeof saveCatalogueSettings>[2], optimistic: Partial<CatalogueEntry>) => {
    updateCatalogue(entry.listTitle, optimistic);
    try {
      await saveCatalogueSettings(spClient, entry, patch);
    } catch (error) {
      updateCatalogue(entry.listTitle, { slaDays: entry.slaDays, isPublic: entry.isPublic });
      toast(error instanceof Error ? error.message : "Could not save the catalogue change.");
    }
  };

  const togglePublic = (entry: CatalogueEntry) => {
    const isPublic = !entry.isPublic;
    void persist(entry, { isPublic }, { isPublic });
  };

  const setSla = (entry: CatalogueEntry, raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    const slaDays = digits === "" ? 0 : Number(digits);
    updateCatalogue(entry.listTitle, { slaDays });
    if (slaDays > 0) void persist(entry, { slaDays }, { slaDays });
  };

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", mb: 3 }}>
        <Box>
          <Typography component="h1" sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
            Form catalogue
          </Typography>
          <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>
            the form set, its approval chain, per-layer SLA and public flag are data, not code
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ backgroundColor: editorial.panel, border: editorialHairline, borderRadius: "14px", overflowX: "auto" }}>
        <Box component="table" sx={{ width: "100%", minWidth: 940, borderCollapse: "collapse", fontSize: 13 }}>
          <Box component="thead">
            <Box
              component="tr"
              sx={{
                "& th": {
                  textAlign: "left",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: editorial.muted,
                  px: 2,
                  py: 1.25,
                  borderBottom: editorialHairline,
                },
              }}
            >
              <Box component="th" sx={{ width: 64 }}>Code</Box>
              <Box component="th" sx={{ width: 230 }}>Form type</Box>
              <Box component="th">Approval chain</Box>
              <Box component="th" sx={{ width: 120 }}>SLA per layer</Box>
              <Box component="th" sx={{ width: 120 }}>Public link</Box>
              <Box component="th" sx={{ width: 120 }}>Severity field</Box>
            </Box>
          </Box>
          <Box component="tbody">
            {catalogue.map((entry) => (
              <Box component="tr" key={entry.listTitle} sx={{ "& td": { px: 2, py: 1.25, borderBottom: editorialHairline, verticalAlign: "top" } }}>
                <Box component="td" sx={{ fontWeight: 800 }}>{entry.code}</Box>
                <Box component="td">
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{entry.name}</Typography>
                  <Typography sx={{ fontSize: 11, color: editorial.muted }}>
                    {entry.volume} in the last 30 days
                  </Typography>
                </Box>
                <Box component="td">
                  <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                    {entry.chain.length === 0 ? (
                      <Typography sx={{ fontSize: 12, color: editorial.muted }}>No layers configured</Typography>
                    ) : (
                      entry.chain.map((role, index) => (
                        <Box
                          key={`${role}-${index}`}
                          component="span"
                          sx={{
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            px: 0.9,
                            py: 0.3,
                            borderRadius: "999px",
                            border: editorialHairline,
                            backgroundColor: editorial.blueSoft,
                          }}
                        >
                          {index + 1}. {role}
                        </Box>
                      ))
                    )}
                  </Stack>
                </Box>
                <Box component="td">
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
                </Box>
                <Box component="td">
                  <Button
                    size="small"
                    onClick={() => togglePublic(entry)}
                    sx={{
                      minHeight: 32,
                      px: 1.25,
                      fontSize: 12,
                      color: entry.isPublic ? editorial.pmwBlueDark : editorial.muted,
                      backgroundColor: entry.isPublic ? editorial.blueWash : "transparent",
                      border: editorialHairline,
                    }}
                  >
                    {entry.isPublic ? "Public" : "Internal"}
                  </Button>
                </Box>
                <Box component="td" sx={{ color: editorial.muted }}>{severityCaptureLabel(entry.severityCapture)}</Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 3, maxWidth: "62ch" }}>
        SLA per layer is new data — it does not exist in the current catalogue schema. It is what makes “overdue”
        computable per form type instead of one global constant; unset types fall back to {PORTAL_SLA_DEFAULT_DAYS}{" "}
        working days.
      </Typography>

      <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 1.5, maxWidth: "62ch" }}>
        New form types are built in the PMW form builder, which is the single place any form is authored. Once a
        form is published there it appears here, and its SLA and public link can be set from this screen.
      </Typography>
    </Box>
  );
}

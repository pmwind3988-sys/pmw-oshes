import { Box, Button, Stack, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import ReferenceTag from "../../components/ReferenceTag";
import { usePortal } from "../../contexts/PortalContext";
import { exportAuditCsv } from "../../utils/portalExport";

/**
 * Audit trail. Append-only, newest first. Every row here was written from the
 * same code path as the action it records — never separately.
 */
export default function AuditScreen() {
  const { audit, access, toast } = usePortal();

  return (
    <Box sx={{ maxWidth: 1060 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", mb: 3 }}>
        <Box>
          <Typography component="h1" sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
            Audit trail
          </Typography>
          <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>
            append-only · every signature, nudge, reassignment and cancellation, including the ones made in this session
          </Typography>
        </Box>
        {access.canExport && (
          <Button
            variant="outlined"
            onClick={() => toast(`Exported ${exportAuditCsv(audit)} trail rows.`)}
            sx={{ minHeight: 40 }}
          >
            Export trail to CSV
          </Button>
        )}
      </Stack>

      {audit.length === 0 ? (
        <Box sx={{ backgroundColor: editorial.panel, border: editorialHairline, borderRadius: "14px", p: 2 }}>
          <Typography sx={{ fontSize: 13, color: editorial.muted }}>Nothing has been recorded yet.</Typography>
        </Box>
      ) : (
        <Box sx={{ backgroundColor: editorial.panel, border: editorialHairline, borderRadius: "14px", overflowX: "auto" }}>
          <Box component="table" sx={{ width: "100%", minWidth: 820, borderCollapse: "collapse", fontSize: 13 }}>
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
                <Box component="th" sx={{ width: 130 }}>When</Box>
                <Box component="th" sx={{ width: 120 }}>Reference</Box>
                <Box component="th" sx={{ width: 170 }}>Who</Box>
                <Box component="th">Event</Box>
              </Box>
            </Box>
            <Box component="tbody">
              {audit.map((entry, index) => (
                <Box
                  component="tr"
                  key={`${entry.at}-${entry.reference}-${index}`}
                  sx={{ "& td": { px: 2, py: 1.1, borderBottom: editorialHairline, verticalAlign: "top" } }}
                >
                  <Box component="td" sx={{ whiteSpace: "nowrap", color: editorial.muted }}>{entry.whenLabel}</Box>
                  <Box component="td"><ReferenceTag value={entry.reference} size="md" /></Box>
                  <Box component="td">{entry.who}</Box>
                  <Box component="td" sx={{ color: editorial.muted }}>{entry.event}</Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

import { Box, Button, Stack, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { usePortal } from "../../contexts/PortalContext";
import { SeverityPill } from "../../components/portal/PortalPills";

/**
 * "To evaluate" for an evaluator, "My approvals" for an approver — the same
 * queue, differing only in what the sub-copy promises about what happens next.
 */
export default function QueueScreen() {
  const { access, queue, openDrawer } = usePortal();

  const title = access.isEvaluator ? "To evaluate" : "My approvals";
  const subtitle = access.isEvaluator
    ? "only what is on your layer · evaluating releases it to the layer after yours"
    : "only what is on your layer · signing releases it to the next approver immediately";

  return (
    <Box sx={{ maxWidth: 840 }}>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>{subtitle}</Typography>
      </Box>

      {queue.length === 0 ? (
        <Box sx={{ backgroundColor: editorial.panel, border: editorialHairline, borderRadius: "14px", p: 2 }}>
          <Typography sx={{ fontSize: 19, fontWeight: 700 }}>Nothing is waiting on you.</Typography>
          <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>
            Signed items move on to the next layer immediately.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.7}>
          {queue.map((record) => (
            <Stack
              key={record.reference}
              direction={{ xs: "column", sm: "row" }}
              spacing={1.7}
              sx={{
                backgroundColor: editorial.panel,
                border: editorialHairline,
                borderRadius: "14px",
                p: 1.7,
                alignItems: { sm: "center" },
                justifyContent: "space-between",
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5, flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: 11, color: editorial.muted, fontWeight: 700 }}>
                    {record.reference} · {record.formName}
                  </Typography>
                  <SeverityPill label={record.severity} tone={record.tone} />
                </Stack>
                <Typography sx={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>{record.subject}</Typography>
                <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 0.25 }}>
                  {record.location || "Location not given"} · filed {record.filedLabel}
                </Typography>
                <Typography sx={{ fontSize: 11, mt: 0.75, color: record.overdue ? editorial.error : editorial.muted, fontWeight: record.overdue ? 800 : 400 }}>
                  {record.layerLabel} · {record.slaNote}
                </Typography>
              </Box>
              <Button variant="contained" onClick={() => openDrawer(record.reference)} sx={{ flex: "none", minHeight: 44 }}>
                Open and sign
              </Button>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}

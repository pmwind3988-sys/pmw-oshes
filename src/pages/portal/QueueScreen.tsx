import { useMemo } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { editorial, editorialHairline } from "../../theme/editorial";
import ReferenceTag from "../../components/ReferenceTag";
import { usePortal } from "../../contexts/PortalContext";
import { SeverityPill } from "../../components/portal/PortalPills";
import { recordKey } from "../../utils/portalRecords";
import { scopeToForm } from "../../utils/portalStats";

/**
 * "To evaluate" for an evaluator, "My approvals" for an approver — the same
 * queue, differing only in what the sub-copy promises about what happens next.
 *
 * Opened from a form's workspace it narrows to that form, so "3 permits on your
 * layer" leads to those three rather than to every kind of form you are on.
 */
export default function QueueScreen() {
  const { access, queue, openDrawer, focusForm, catalogue, setScreen } = usePortal();

  const scopedForm = catalogue.find((entry) => entry.listTitle === focusForm) ?? null;
  const rows = useMemo(() => scopeToForm(queue, scopedForm?.listTitle ?? null), [queue, scopedForm]);

  const base = access.isEvaluator ? "To evaluate" : "My approvals";
  const title = scopedForm ? `${scopedForm.name} · ${base.toLowerCase()}` : base;
  const subtitle = access.isEvaluator
    ? "only what is on your layer · evaluating releases it to the layer after yours"
    : "only what is on your layer · signing releases it to the next approver immediately";

  return (
    <Box sx={{ maxWidth: 840 }}>
      {scopedForm && (
        <Button
          onClick={() => setScreen("form", scopedForm.listTitle)}
          startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
          sx={{ minHeight: 36, px: 0.75, ml: -0.75, mb: 1.5, fontSize: 12.5, color: editorial.muted }}
        >
          {scopedForm.name}
        </Button>
      )}

      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={{ fontSize: { xs: 26, sm: 34 }, fontWeight: 700, lineHeight: 1.1 }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>{subtitle}</Typography>
      </Box>

      {rows.length === 0 ? (
        <Box sx={{ backgroundColor: editorial.panel, border: editorialHairline, borderRadius: "14px", p: 2 }}>
          <Typography sx={{ fontSize: 19, fontWeight: 700 }}>Nothing is waiting on you.</Typography>
          <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>
            Signed items move on to the next layer immediately.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.7}>
          {rows.map((record) => (
            <Stack
              key={recordKey(record)}
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
                  <ReferenceTag value={record.reference} />
                  <Typography sx={{ fontSize: 11, color: editorial.muted, fontWeight: 700 }}>
                    {record.formName}
                  </Typography>
                  <SeverityPill label={record.severity} tone={record.tone} />
                </Stack>
                <Typography sx={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>{record.subject}</Typography>
                <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 0.25 }}>
                  {record.location || "Location not given"} · filed {record.filedLabel}
                </Typography>
                {/* The wait line reports the SLA where the form set one, and
                    how long it has actually sat where it did not. */}
                <Typography sx={{ fontSize: 11, mt: 0.75, color: record.overdue ? editorial.error : editorial.muted, fontWeight: record.overdue ? 800 : 400 }}>
                  {record.waitNote ? `${record.layerLabel} · ${record.waitNote}` : record.layerLabel}
                </Typography>
              </Box>
              <Button variant="contained" onClick={() => openDrawer(recordKey(record))} sx={{ flex: "none", minHeight: 44 }}>
                Open and sign
              </Button>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}

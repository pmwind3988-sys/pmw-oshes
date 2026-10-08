import { useMemo } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { ArrowLeft as ArrowBackIcon, ClipboardClock as PendingActionsOutlinedIcon } from "../../components/ui/Icons";
import { editorial } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";
import ReferenceTag from "../../components/ReferenceTag";
import { IconTile, PageHeader, Widget, WidgetEmpty } from "../../components/Widget";
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
 *
 * Each item is a full card rather than a line: this is the one screen where the
 * decision is made, so it carries what the decision needs — what happened,
 * where, how severe, and how long it has already sat — beside the button that
 * settles it.
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
    <Box sx={{ maxWidth: 880 }}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        meta={rows.length > 0 ? `${rows.length} on your layer` : undefined}
        back={
          scopedForm ? (
            <Button
              onClick={() => setScreen("form", scopedForm.listTitle)}
              startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
              sx={{ minHeight: 36, px: 0.75, ml: -0.75, mb: 1.5, fontSize: 12.5, color: editorial.muted }}
            >
              {scopedForm.name}
            </Button>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <Widget title="Nothing is waiting on you.">
          <WidgetEmpty>Signed items move on to the next layer immediately.</WidgetEmpty>
        </Widget>
      ) : (
        <Stack spacing={0.5}>
          {rows.map((record) => (
            // The whole row is the target: one button, so keyboard and screen
            // reader users get one stop per item and the row opens the record.
            <Box
              key={recordKey(record)}
              component="button"
              type="button"
              onClick={() => openDrawer(recordKey(record))}
              sx={{
                display: "flex",
                alignItems: { xs: "flex-start", sm: "center" },
                flexDirection: { xs: "column", sm: "row" },
                gap: 1.75,
                width: "100%",
                p: 1.75,
                border: "none",
                borderRadius: "20px",
                backgroundColor: editorial.panel,
                font: "inherit",
                color: "inherit",
                textAlign: "left",
                cursor: "pointer",
                transition: "background-color 0.16s ease, transform 0.12s ease",
                "&:hover": { backgroundColor: editorial.blueSoft },
                "&:active": { transform: "scale(0.995)" },
                "&:focus-visible": { outline: "3px solid #9DBDF5", outlineOffset: 2 },
              }}
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start", minWidth: 0, flex: 1 }}>
                <Box sx={{ position: "relative", flex: "none" }}>
                  <IconTile tone={record.overdue ? "alert" : "ink"}>
                    <PendingActionsOutlinedIcon />
                  </IconTile>
                  {record.overdue && (
                    <Box
                      aria-hidden="true"
                      sx={{
                        position: "absolute",
                        top: -2,
                        right: -2,
                        width: 10,
                        height: 10,
                        borderRadius: radius.full,
                        backgroundColor: editorial.errorFill,
                        boxShadow: `0 0 0 2px ${editorial.panel}`,
                      }}
                    />
                  )}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5, flexWrap: "wrap" }}>
                    <ReferenceTag value={record.reference} />
                    <Typography sx={{ fontSize: 12, color: editorial.muted, fontWeight: 700 }}>
                      {record.formName}
                    </Typography>
                    <SeverityPill label={record.severity} tone={record.tone} />
                    {record.overdue && (
                      <Box
                        component="span"
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.6,
                          px: 1,
                          py: 0.25,
                          borderRadius: radius.full,
                          backgroundColor: editorial.errorWash,
                          color: editorial.error,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        <Box
                          aria-hidden="true"
                          sx={{ width: 6, height: 6, borderRadius: radius.full, backgroundColor: editorial.errorFill }}
                        />
                        Overdue
                      </Box>
                    )}
                  </Stack>
                  <Typography sx={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25 }}>{record.subject}</Typography>
                  <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 0.25 }}>
                    {record.location || "Location not given"} · filed {record.filedLabel}
                  </Typography>
                  {/* The wait line reports the SLA where the form set one, and
                      how long it has actually sat where it did not. */}
                  <Typography sx={{ fontSize: 11.5, mt: 0.5, color: editorial.muted }}>
                    {record.waitNote ? `${record.layerLabel} · ${record.waitNote}` : record.layerLabel}
                  </Typography>
                </Box>
              </Stack>
              <Box
                component="span"
                sx={{
                  flex: "none",
                  alignSelf: { xs: "flex-end", sm: "center" },
                  px: 2,
                  py: 0.875,
                  borderRadius: radius.full,
                  backgroundColor: editorial.pmwBlueSoft,
                  color: editorial.pmwBlueDark,
                  fontSize: 13,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                Review
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

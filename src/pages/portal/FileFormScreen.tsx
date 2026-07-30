import { useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { usePortal } from "../../contexts/PortalContext";
import { usePortalDraft } from "../../hooks/usePortalDraft";
import QuickReportForm from "../../components/portal/QuickReportForm";
import { submitQuickReport } from "../../utils/portalSubmit";
import type { CatalogueEntry } from "../../types";

/**
 * File a form — two steps in one screen: pick the form type, then fill it.
 *
 * Name and email are never asked: the session supplies them.
 */
export default function FileFormScreen() {
  const { catalogue, surveyJsonByForm, userName, userEmail, toast, setScreen, refresh } = usePortal();
  const [picked, setPicked] = useState<CatalogueEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const formId = picked?.listTitle ?? "";
  const { draft, setField, reset, savedLabel } = usePortalDraft(formId);

  const submit = async () => {
    if (!picked) return;
    setSubmitting(true);
    try {
      await submitQuickReport({
        listTitle: picked.listTitle,
        surveyJson: surveyJsonByForm[picked.listTitle] ?? null,
        draft,
        submitterName: userName || userEmail,
        submitterEmail: userEmail,
      });
      reset();
      setPicked(null);
      setScreen("subs");
      refresh();
      toast(`Filed — with ${picked.firstApprover} now. You can follow it in My submissions.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not file the form.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!picked) {
    return (
      <Box sx={{ maxWidth: 720 }}>
        <Box sx={{ mb: 3 }}>
          <Typography component="h1" sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
            File a form
          </Typography>
          <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>
            your name and email come from your account — you do not have to type them
          </Typography>
        </Box>

        {catalogue.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: editorial.muted }}>
            No form types are published yet. An administrator adds them in the form catalogue.
          </Typography>
        ) : (
          <Box sx={{ backgroundColor: editorial.panel, border: editorialHairline, borderRadius: "14px", overflow: "hidden" }}>
            {catalogue.map((entry, index) => (
              <Box
                key={entry.listTitle}
                component="button"
                type="button"
                onClick={() => setPicked(entry)}
                sx={{
                  width: "100%",
                  minHeight: 54,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
                  px: 2,
                  py: 1.25,
                  textAlign: "left",
                  cursor: "pointer",
                  border: "none",
                  borderTop: index === 0 ? "none" : editorialHairline,
                  background: "transparent",
                  color: "inherit",
                  font: "inherit",
                  "&:hover": { background: editorial.blueWash },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{entry.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: editorial.muted }}>
                    {entry.chain.length} approval layer{entry.chain.length === 1 ? "" : "s"} · first to {entry.firstApprover}
                  </Typography>
                </Box>
                <Typography sx={{ color: editorial.muted, flex: "none" }}>→</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Box sx={{ backgroundColor: editorial.panel, border: editorialHairline, borderRadius: "14px", p: 2.5 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Button onClick={() => setPicked(null)} sx={{ color: editorial.muted, px: 0, minWidth: 0 }}>
            ← Change form
          </Button>
          <Typography sx={{ fontSize: 11, color: editorial.muted }}>{savedLabel}</Typography>
        </Stack>

        <Typography component="h1" sx={{ fontSize: 26, fontWeight: 700, mb: 2, lineHeight: 1.2 }}>
          {picked.name}
        </Typography>

        <QuickReportForm
          draft={draft}
          setField={setField}
          askSeverity={picked.severityCapture !== "none"}
          askIdentity={false}
          submitLabel={`Submit — routes to ${picked.firstApprover}`}
          submitting={submitting}
          onSubmit={() => void submit()}
        />
      </Box>
    </Box>
  );
}

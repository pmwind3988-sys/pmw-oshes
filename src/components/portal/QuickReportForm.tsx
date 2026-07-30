import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { SEVERITY_OPTIONS, missingFields, missingLabel, severityWarns } from "../../utils/portalDraft";
import type { PortalFormDraft } from "../../types";

interface QuickReportFormProps {
  draft: PortalFormDraft;
  setField: <K extends keyof PortalFormDraft>(key: K, value: PortalFormDraft[K]) => void;
  askSeverity: boolean;
  /** The public flow asks for an optional name and email; the staff flow takes them from the session. */
  askIdentity: boolean;
  submitLabel: string;
  submitting: boolean;
  onSubmit: () => void;
  footnote?: string;
}

/**
 * The report form itself, shared by the staff quick-file screen and the
 * signed-out QR flow. Every tap target is at least 44px — this gets filled in
 * one-handed, on a jetty, in sunlight.
 */
export default function QuickReportForm({
  draft,
  setField,
  askSeverity,
  askIdentity,
  submitLabel,
  submitting,
  onSubmit,
  footnote,
}: QuickReportFormProps) {
  const missing = missingFields(draft, askSeverity);
  const incomplete = missing.length > 0;

  return (
    <Stack spacing={2}>
      <TextField
        label="Where did it happen?"
        value={draft.location}
        onChange={(event) => setField("location", event.target.value)}
        fullWidth
        slotProps={{ htmlInput: { style: { minHeight: 26 } } }}
      />

      {askSeverity && (
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1 }}>How bad was the outcome?</Typography>
          <Stack spacing={0.75}>
            {SEVERITY_OPTIONS.map((option) => {
              const selected = draft.severity === option.key;
              return (
                <Box
                  key={option.key}
                  component="button"
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setField("severity", option.key)}
                  sx={{
                    minHeight: 48,
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    px: 1.5,
                    textAlign: "left",
                    cursor: "pointer",
                    font: "inherit",
                    borderRadius: "10px",
                    border: `1px solid ${selected ? editorial.pmwBlue : editorial.border}`,
                    background: selected ? editorial.blueWash : "transparent",
                    color: selected ? editorial.pmwBlueDark : editorial.ink,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      width: 10,
                      height: 10,
                      flex: "none",
                      borderRadius: "50%",
                      border: `1px solid ${selected ? editorial.pmwBlue : editorial.border}`,
                      background: selected ? editorial.pmwBlue : "transparent",
                    }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{option.label}</Typography>
                    <Typography sx={{ fontSize: 12, color: editorial.muted }}>{option.hint}</Typography>
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </Box>
      )}

      {severityWarns(draft.severity) && (
        <Box
          sx={{
            border: `1px solid ${editorial.error}`,
            borderRadius: "10px",
            backgroundColor: "#FFF1F1",
            p: 1.5,
          }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: editorial.ink }}>
            This pages the duty safety officer the moment you submit, and starts a 24-hour investigation clock. Keep the
            area as it is if it is safe to do so.
          </Typography>
        </Box>
      )}

      <TextField
        label="What happened?"
        placeholder="A sentence or two is enough."
        value={draft.description}
        onChange={(event) => setField("description", event.target.value)}
        multiline
        minRows={4}
        fullWidth
      />

      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1 }}>Photos</Typography>
        <Box
          component="button"
          type="button"
          onClick={() => setField("photos", draft.photos + 1)}
          sx={{
            width: "100%",
            minHeight: 64,
            border: `1px dashed ${editorial.border}`,
            borderRadius: "10px",
            background: "transparent",
            color: editorial.muted,
            font: "inherit",
            fontSize: 13,
            cursor: "pointer",
            "&:hover": { borderColor: editorial.pmwBlue, color: editorial.pmwBlueDark },
          }}
        >
          {draft.photos === 0
            ? "Take a photo, or choose from your phone"
            : `${draft.photos} photo${draft.photos === 1 ? "" : "s"} attached · add another`}
        </Box>
      </Box>

      {askIdentity && (
        <>
          <TextField
            label="Your name"
            placeholder="Optional — you can report anonymously"
            value={draft.name}
            onChange={(event) => setField("name", event.target.value)}
            fullWidth
          />
          <TextField
            label="Email, if you want a copy"
            placeholder="Optional"
            value={draft.email}
            onChange={(event) => setField("email", event.target.value)}
            fullWidth
          />
        </>
      )}

      {incomplete && (
        <Typography sx={{ fontSize: 12, color: editorial.muted }}>{missingLabel(missing)}</Typography>
      )}

      <Button
        variant="contained"
        onClick={onSubmit}
        disabled={incomplete || submitting}
        sx={{ minHeight: 48, width: "100%" }}
      >
        {submitting ? "Filing…" : submitLabel}
      </Button>

      {footnote && (
        <Typography sx={{ fontSize: 11, color: editorial.muted, borderTop: editorialHairline, pt: 1.5 }}>
          {footnote}
        </Typography>
      )}
    </Stack>
  );
}

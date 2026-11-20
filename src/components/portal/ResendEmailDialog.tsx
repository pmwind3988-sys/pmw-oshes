import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";
import { editorial } from "../../theme/editorial";
import ReferenceTag from "../ReferenceTag";
import { usePortal } from "../../contexts/PortalContext";
import { parseEmailList, isLayerEmail } from "../../utils/layerRecipients";
import { resendLayerEmail, usualLayerRecipients } from "../../utils/resendLayerEmail";
import type { PortalRecord } from "../../types";

type Target = "usual" | "custom";

/**
 * Send the waiting layer's email again — to the people it normally goes to, or
 * to one or more addresses typed here. Sending a copy elsewhere does not change
 * who holds the layer.
 */
export default function ResendEmailDialog({ record, onClose }: { record: PortalRecord | null; onClose: () => void }) {
  const { catalogue, spClient, userName, userEmail, applyPatch, appendAudit, toast } = usePortal();
  const [target, setTarget] = useState<Target>("usual");
  const [usual, setUsual] = useState<string[] | null>(null);
  const [custom, setCustom] = useState("");
  const [sending, setSending] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const reference = record?.reference ?? null;
  // Start fresh whenever the dialog targets a different record.
  if (loadedFor !== reference) {
    setLoadedFor(reference);
    setTarget("usual");
    setUsual(null);
    setCustom("");
  }

  useEffect(() => {
    if (!record) return;
    let live = true;
    usualLayerRecipients(spClient, record)
      .then((emails) => {
        if (!live) return;
        setUsual(emails);
        if (emails.length === 0) setTarget("custom");
      })
      .catch(() => {
        if (live) setUsual([]);
      });
    return () => {
      live = false;
    };
  }, [record, spClient]);

  const typed = useMemo(() => parseEmailList(custom), [custom]);
  const invalid = typed.filter((entry) => !isLayerEmail(entry));
  const customValid = typed.length > 0 && invalid.length === 0;

  if (!record) return null;

  const slug = catalogue.find((entry) => entry.listTitle === record.listTitle)?.slug ?? "";
  const recipients = target === "usual" ? usual ?? [] : typed;
  const canSend = !sending && (target === "usual" ? (usual?.length ?? 0) > 0 : customValid);

  const send = async () => {
    setSending(true);
    try {
      const result = await resendLayerEmail(
        { spClient, actorName: userName || userEmail, actorEmail: userEmail },
        record,
        recipients,
        slug,
      );
      if (Object.keys(result.fields).length) applyPatch(record, result.fields);
      appendAudit(result.audit);
      toast(result.toast);
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not send the email.");
    } finally {
      setSending(false);
    }
  };

  const helper = invalid.length
    ? `Check ${invalid.length === 1 ? "this address" : "these addresses"}: ${invalid.join(", ")}`
    : typed.length
      ? `${typed.length} ${typed.length === 1 ? "person" : "people"}`
      : "Separate addresses with a comma or semicolon.";

  return (
    <Dialog open onClose={sending ? undefined : onClose} fullWidth maxWidth="sm" transitionDuration={120}>
      <DialogTitle sx={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
        Resend email <ReferenceTag value={record.reference} size="md" />
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: editorial.muted, mb: 2 }}>
          Sends the {record.layerLabel} email again, with the same link. Who signs this layer does not change.
        </Typography>

        <RadioGroup value={target} onChange={(event) => setTarget(event.target.value as Target)}>
          <FormControlLabel
            value="usual"
            control={<Radio />}
            disabled={usual !== null && usual.length === 0}
            sx={{ alignItems: "flex-start", minHeight: 44, m: 0, "& .MuiRadio-root": { mt: -0.5 } }}
            label={
              <Box sx={{ pt: 0.75 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Usual recipient</Typography>
                {usual === null ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.25 }}>
                    <CircularProgress size={12} />
                    <Typography sx={{ fontSize: 12, color: editorial.muted }}>Looking up who it goes to…</Typography>
                  </Box>
                ) : usual.length === 0 ? (
                  <Typography sx={{ fontSize: 12, color: editorial.muted }}>
                    No address is stored for this layer. Send it to someone instead.
                  </Typography>
                ) : (
                  <Typography sx={{ fontSize: 12, color: editorial.muted, wordBreak: "break-word" }}>
                    {usual.join(", ")}
                  </Typography>
                )}
              </Box>
            }
          />
          <FormControlLabel
            value="custom"
            control={<Radio />}
            sx={{ alignItems: "flex-start", minHeight: 44, m: 0, mt: 1, "& .MuiRadio-root": { mt: -0.5 } }}
            label={
              <Box sx={{ pt: 0.75 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Someone else</Typography>
                <Typography sx={{ fontSize: 12, color: editorial.muted }}>One or more email addresses</Typography>
              </Box>
            }
          />
        </RadioGroup>

        {target === "custom" ? (
          // Sits in the same column as the option text above it (the radio is
          // 42px wide), with no floating label: the option already says what
          // goes here, and the hint lines up with the field's own edge.
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            placeholder="name@example.com, another@example.com"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            error={invalid.length > 0}
            helperText={helper}
            slotProps={{
              htmlInput: { "aria-label": "Send to" },
              formHelperText: { sx: { mx: 0, mt: 0.75 } },
            }}
            sx={{ mt: 1, pl: { xs: 0, sm: "42px" }, boxSizing: "border-box" }}
          />
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button variant="outlined" onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void send()} disabled={!canSend}>
          {sending ? "Sending…" : "Send email"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

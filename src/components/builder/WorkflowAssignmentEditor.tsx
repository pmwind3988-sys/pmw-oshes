import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { LayerConfigItem } from "../../types";
import { getWorkflowAssignment } from "../../utils/workflowAssignmentData";
import { editorial, editorialHairline } from "../../theme/editorial";
import { formatDisplayDateTimeLong } from "../../utils/displayDateTime";

interface LayerRuntimeState {
  status: string;
  email?: string;
}

export interface WorkflowAssignmentSaveInput {
  layer: number;
  email: string;
  displayName?: string;
  position?: string;
  workflowRole?: string;
  notes?: string;
  reason: string;
}

interface WorkflowAssignmentEditorProps {
  layers: LayerConfigItem[];
  currentLayerNumber: number;
  layerStates: Record<number, LayerRuntimeState>;
  rawAssignments?: string;
  saving: boolean;
  onSave: (input: WorkflowAssignmentSaveInput) => Promise<void>;
}

const TERMINAL_STATUSES = new Set([
  "approved",
  "confirmed",
  "rejected",
  "cancelled",
  "skipped",
]);

function isLayerEditable(
  layer: LayerConfigItem,
  currentLayerNumber: number,
  layerStates: Record<number, LayerRuntimeState>,
): boolean {
  if (layer.layerNumber < currentLayerNumber) return false;
  return !TERMINAL_STATUSES.has((layerStates[layer.layerNumber]?.status || "").trim().toLowerCase());
}

export default function WorkflowAssignmentEditor({
  layers,
  currentLayerNumber,
  layerStates,
  rawAssignments,
  saving,
  onSave,
}: WorkflowAssignmentEditorProps) {
  const editableLayers = layers.filter((layer) => isLayerEditable(layer, currentLayerNumber, layerStates));
  const defaultLayerNumber =
    editableLayers.find((layer) => layer.layerNumber === currentLayerNumber)?.layerNumber
    ?? editableLayers[0]?.layerNumber
    ?? currentLayerNumber;
  const [selectedLayerNumber, setSelectedLayerNumber] = useState(defaultLayerNumber);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [position, setPosition] = useState("");
  const [workflowRole, setWorkflowRole] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!editableLayers.some((layer) => layer.layerNumber === selectedLayerNumber)) {
      setSelectedLayerNumber(defaultLayerNumber);
    }
  }, [defaultLayerNumber, editableLayers, selectedLayerNumber]);

  useEffect(() => {
    const layer = layers.find((candidate) => candidate.layerNumber === selectedLayerNumber);
    const assignment = getWorkflowAssignment(rawAssignments, selectedLayerNumber);
    setEmail(assignment?.email || layerStates[selectedLayerNumber]?.email || "");
    setDisplayName(assignment?.displayName || "");
    setPosition(assignment?.position || "");
    setWorkflowRole(
      assignment?.workflowRole
      || (layer?.type === "evaluation" ? "Evaluator" : "Approver"),
    );
    setNotes(assignment?.notes || "");
    setReason("");
  }, [layerStates, layers, rawAssignments, selectedLayerNumber]);

  if (editableLayers.length === 0) return null;

  const selectedLayer = layers.find((layer) => layer.layerNumber === selectedLayerNumber);
  const assignment = getWorkflowAssignment(rawAssignments, selectedLayerNumber);

  const canSave = !saving && Boolean(email.trim()) && Boolean(reason.trim());

  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        mt: 1.5,
        border: editorialHairline,
        borderRadius: "12px",
        backgroundColor: editorial.panel,
        "&::before": { display: "none" },
        "& .MuiAccordionSummary-root": { minHeight: 44 },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 1.5 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          <ManageAccountsIcon sx={{ fontSize: 19, color: editorial.pmwPurple }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>Reconfigure this submission</Typography>
        </Stack>
      </AccordionSummary>

      <AccordionDetails sx={{ px: 1.5, pb: 1.5, pt: 0, borderTop: editorialHairline }}>
        <Typography sx={{ fontSize: 11.5, color: editorial.muted, lineHeight: 1.55, my: 1.25 }}>
          Changes apply only to this submission. Completed layers cannot be edited.
        </Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 1.25 }}>
          <TextField
            select
            size="small"
            label="Workflow layer"
            value={selectedLayerNumber}
            onChange={(event) => setSelectedLayerNumber(Number(event.target.value))}
          >
            {editableLayers.map((layer) => (
              <MenuItem key={layer.layerNumber} value={layer.layerNumber}>
                Layer {layer.layerNumber}: {layer.title || (layer.type === "evaluation" ? "Evaluation" : "Approval")}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            size="small"
            required
            type="email"
            label="Approver or evaluator email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
          />

          <TextField
            size="small"
            label="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Person responsible"
          />

          <TextField
            size="small"
            label="Position"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            placeholder="e.g. OSHES Manager"
          />

          <TextField
            size="small"
            label="Workflow role"
            value={workflowRole}
            onChange={(event) => setWorkflowRole(event.target.value)}
            placeholder={selectedLayer?.type === "evaluation" ? "Evaluator" : "Approver"}
          />

          <TextField
            size="small"
            required
            label="Reason for change"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why this assignment changed"
          />
        </Box>

        <TextField
          size="small"
          fullWidth
          multiline
          rows={2}
          label="Assignment notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional item-specific context"
          sx={{ mt: 1.25 }}
        />

        {assignment ? (
          <Box
            sx={{
              mt: 1.25,
              px: 1.25,
              py: 1,
              borderRadius: "8px",
              backgroundColor: editorial.paperSoft,
              border: editorialHairline,
            }}
          >
            <Typography sx={{ fontSize: 10.5, color: editorial.muted, lineHeight: 1.5 }}>
              Last changed by {assignment.updatedBy} on {formatDisplayDateTimeLong(assignment.updatedAt)}.
              {assignment.history.length > 0
                ? ` ${assignment.history.length} earlier assignment${assignment.history.length === 1 ? "" : "s"} retained.`
                : ""}
            </Typography>
          </Box>
        ) : null}

        <Stack direction="row" sx={{ justifyContent: "flex-end", mt: 1.5 }}>
          <Button
            variant="contained"
            size="small"
            disabled={!canSave}
            onClick={() =>
              void onSave({
                layer: selectedLayerNumber,
                email,
                displayName,
                position,
                workflowRole,
                notes,
                reason,
              })
            }
            sx={{ minHeight: 36 }}
          >
            {saving ? "Saving assignment..." : "Save assignment"}
          </Button>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

import { useEffect, useState } from "react";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import type { LayerConfigItem } from "../../types";
import { getWorkflowAssignment } from "../../utils/workflowAssignmentData";
import { C } from "./constants";

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

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  background: C.white,
  color: C.textPrimary,
  font: "inherit",
  fontSize: 12,
} as const;

const labelStyle = {
  display: "block",
  marginBottom: 4,
  color: C.textSecond,
  fontSize: 11,
  fontWeight: 700,
} as const;

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

  return (
    <details style={{
      marginTop: 12,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      background: C.white,
    }}>
      <summary style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "11px 12px",
        cursor: "pointer",
        color: C.textPrimary,
        fontSize: 12,
        fontWeight: 750,
      }}>
        <ManageAccountsIcon style={{ color: C.purpleAccent, fontSize: 19 }} />
        Reconfigure this submission
      </summary>

      <div style={{ padding: "2px 12px 12px", borderTop: `1px solid ${C.borderLight}` }}>
        <p style={{ margin: "10px 0", color: C.textSecond, fontSize: 11, lineHeight: 1.55 }}>
          Changes apply only to this submission. Completed layers cannot be edited.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
          <label>
            <span style={labelStyle}>Workflow layer</span>
            <select
              value={selectedLayerNumber}
              onChange={(event) => setSelectedLayerNumber(Number(event.target.value))}
              style={fieldStyle}
            >
              {editableLayers.map((layer) => (
                <option key={layer.layerNumber} value={layer.layerNumber}>
                  Layer {layer.layerNumber}: {layer.title || (layer.type === "evaluation" ? "Evaluation" : "Approval")}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span style={labelStyle}>Approver or evaluator email *</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              style={fieldStyle}
            />
          </label>

          <label>
            <span style={labelStyle}>Display name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Person responsible"
              style={fieldStyle}
            />
          </label>

          <label>
            <span style={labelStyle}>Position</span>
            <input
              value={position}
              onChange={(event) => setPosition(event.target.value)}
              placeholder="e.g. OSHES Manager"
              style={fieldStyle}
            />
          </label>

          <label>
            <span style={labelStyle}>Workflow role</span>
            <input
              value={workflowRole}
              onChange={(event) => setWorkflowRole(event.target.value)}
              placeholder={selectedLayer?.type === "evaluation" ? "Evaluator" : "Approver"}
              style={fieldStyle}
            />
          </label>

          <label>
            <span style={labelStyle}>Reason for change *</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why this assignment changed"
              style={fieldStyle}
            />
          </label>
        </div>

        <label style={{ display: "block", marginTop: 10 }}>
          <span style={labelStyle}>Assignment notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder="Optional item-specific context"
            style={{ ...fieldStyle, resize: "vertical" }}
          />
        </label>

        {assignment ? (
          <div style={{
            marginTop: 9,
            padding: "8px 10px",
            borderRadius: 7,
            background: C.offWhite,
            color: C.textSecond,
            fontSize: 10,
            lineHeight: 1.5,
          }}>
            Last changed by {assignment.updatedBy} on {new Date(assignment.updatedAt).toLocaleString("en-MY")}.
            {assignment.history.length > 0 ? ` ${assignment.history.length} earlier assignment${assignment.history.length === 1 ? "" : "s"} retained.` : ""}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 11 }}>
          <button
            type="button"
            disabled={saving || !email.trim() || !reason.trim()}
            onClick={() => void onSave({
              layer: selectedLayerNumber,
              email,
              displayName,
              position,
              workflowRole,
              notes,
              reason,
            })}
            style={{
              minHeight: 36,
              padding: "8px 13px",
              border: "none",
              borderRadius: 7,
              background: C.purple,
              color: C.white,
              cursor: saving || !email.trim() || !reason.trim() ? "not-allowed" : "pointer",
              opacity: saving || !email.trim() || !reason.trim() ? 0.55 : 1,
              fontSize: 11,
              fontWeight: 750,
            }}
          >
            {saving ? "Saving assignment..." : "Save assignment"}
          </button>
        </div>
      </div>
    </details>
  );
}

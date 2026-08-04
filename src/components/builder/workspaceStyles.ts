/**
 * Surface styles shared by the approval, evaluation and response routes.
 *
 * Kept out of `WorkspaceLayout.tsx` so that file exports components only and
 * fast refresh keeps working there.
 */
import { editorial, editorialHairline, editorialShadow } from "../../theme/editorial";

/** Structural panel: the list, the detail column, the state card. */
export const workspacePanelSx = {
  backgroundColor: editorial.panel,
  border: editorialHairline,
  borderRadius: "14px",
  boxShadow: editorialShadow,
  overflow: "hidden",
} as const;

/** Inset surface within a panel — no shadow, so nesting stays legible. */
export const workspaceSurfaceSx = {
  backgroundColor: editorial.panel,
  border: editorialHairline,
  borderRadius: "12px",
} as const;

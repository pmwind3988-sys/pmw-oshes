import type { LayerConfig, LayerConfigItem, ManualBranch } from "../../types";

export interface LayerFieldOption {
  name: string;
  title?: string;
  type?: string;
  inputType?: string;
}

export interface LayerValidationResult {
  errors: string[];
  warnings: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidLayerEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

function displayLayerLabel(scope: string, layer: LayerConfigItem, index: number): string {
  return `${scope} layer ${layer.layerNumber || index + 1}`;
}

function validateLayer(
  layer: LayerConfigItem,
  index: number,
  scope: string,
  fieldNames: Set<string>,
): LayerValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = displayLayerLabel(scope, layer, index);

  if (layer.authMode === "365") {
    const assigneeValue = layer.assignee?.value?.trim() || "";
    if (!assigneeValue) {
      errors.push(`${label}: assign an approver, email field, or department lookup.`);
    } else if (layer.assignee.type === "user" && !isValidLayerEmail(assigneeValue)) {
      errors.push(`${label}: static assignee must be a valid email address.`);
    } else if (layer.assignee.type === "field-reference" && !fieldNames.has(assigneeValue)) {
      errors.push(`${label}: field reference "${assigneeValue}" does not exist in the form.`);
    } else if (layer.assignee.type === "department-approver") {
      if (!fieldNames.has(assigneeValue)) {
        errors.push(`${label}: department field "${assigneeValue}" does not exist in the form.`);
      }
      if (!layer.assignee.listName?.trim()) {
        errors.push(`${label}: department approver lookup needs a SharePoint list name.`);
      }
      if (!layer.assignee.departmentColumn?.trim()) {
        errors.push(`${label}: department approver lookup needs a department column.`);
      }
      if (!layer.assignee.emailColumn?.trim()) {
        errors.push(`${label}: department approver lookup needs an email column.`);
      }
    }
  }

  if (layer.authMode === "public") {
    if (!layer.publicToken?.trim()) {
      errors.push(`${label}: public layers need an access token.`);
    }
    if (!layer.tokenExpiresAt?.trim()) {
      errors.push(`${label}: public layers need an expiry date.`);
    } else if (Number.isNaN(Date.parse(layer.tokenExpiresAt))) {
      errors.push(`${label}: public link expiry is not a valid date.`);
    } else if (new Date(layer.tokenExpiresAt).getTime() <= Date.now()) {
      warnings.push(`${label}: public link has already expired.`);
    }
  }

  if (layer.type === "evaluation" && layer.authMode === "365" && layer.assignee.type === "field-reference") {
    warnings.push(`${label}: the referenced field must contain an email address when the submission is reviewed.`);
  }

  if (
    layer.type === "evaluation" &&
    layer.emailSchedule?.mode === "custom_days" &&
    (!Number.isInteger(layer.emailSchedule.customDays) || (layer.emailSchedule.customDays ?? 0) < 1)
  ) {
    errors.push(`${label} custom evaluator email delay must be at least 1 whole day.`);
  }
  if (layer.authMode === "365" && layer.assignee.type === "department-approver") {
    warnings.push(`${label}: department matching is exact; keep the form choices aligned with the approver directory.`);
  }

  return { errors, warnings };
}

function validateBranch(
  branch: ManualBranch,
  index: number,
  fieldNames: Set<string>,
): LayerValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const branchLabel = branch.label || branch.name || `Branch ${index + 1}`;

  if (!branch.name.trim()) {
    errors.push(`Branch ${index + 1}: add a branch key.`);
  }
  if (branch.layers.length === 0) {
    errors.push(`${branchLabel}: add at least one layer.`);
  }

  branch.layers.forEach((layer, layerIndex) => {
    const result = validateLayer(layer, layerIndex, branchLabel, fieldNames);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  });

  return { errors, warnings };
}

export function validateLayerConfig(
  config: LayerConfig | null,
  fields: LayerFieldOption[],
): LayerValidationResult {
  if (!config) return { errors: [], warnings: [] };

  const errors: string[] = [];
  const warnings: string[] = [];
  const fieldNames = new Set(fields.map((field) => field.name).filter(Boolean));
  const branches = config.manualBranches ?? [];

  if (config.manualBranches && branches.length === 0) {
    errors.push("Manual branching is enabled; add at least one branch or disable manual branching.");
  }

  config.layers.forEach((layer, index) => {
    const result = validateLayer(layer, index, "Main sequence", fieldNames);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  });

  if (branches.length > 0) {
    const seen = new Set<string>();
    branches.forEach((branch, index) => {
      const normalizedName = branch.name.trim().toLowerCase();
      if (normalizedName) {
        if (seen.has(normalizedName)) {
          errors.push(`Branch ${index + 1}: branch key "${branch.name}" is duplicated.`);
        }
        seen.add(normalizedName);
      }

      const result = validateBranch(branch, index, fieldNames);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    });
  }

  return { errors, warnings };
}

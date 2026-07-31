import type { EvaluationSubmitterRoutingRule, LayerConfigItem } from "../types";

export interface EvaluationSubmitterRoutingResult {
  rule: EvaluationSubmitterRoutingRule;
  email?: string;
  manualPaper: boolean;
  sendToConfiguredSender: boolean;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalized(value: unknown): string {
  return text(value).toLowerCase();
}

function fieldValue(data: Record<string, unknown>, fieldName: string | undefined): string {
  if (!fieldName) return "";
  if (Object.prototype.hasOwnProperty.call(data, fieldName)) return text(data[fieldName]);
  const target = fieldName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const found = Object.keys(data).find((key) => key.toLowerCase().replace(/_x[0-9a-f]{4}_/g, "").replace(/[^a-z0-9]+/g, "") === target);
  return found ? text(data[found]) : "";
}

function ruleMatches(rule: EvaluationSubmitterRoutingRule, data: Record<string, unknown>): boolean {
  const expectedEmail = normalized(rule.emailValue);
  const expectedEmployeeId = normalized(rule.employeeIdValue);
  const expectedUserId = normalized(rule.userIdValue);
  const expectedFullName = normalized(rule.fullNameValue);
  const hasEmailCondition = !!expectedEmail;
  const hasEmployeeCondition = !!expectedEmployeeId;
  const hasUserIdCondition = !!expectedUserId;
  const hasFullNameCondition = !!expectedFullName;
  if (!hasEmailCondition && !hasEmployeeCondition && !hasUserIdCondition && !hasFullNameCondition) return false;

  if (hasEmailCondition) {
    const submittedBy = normalized(data.SubmittedBy);
    const fieldEmail = normalized(fieldValue(data, rule.emailField));
    if (submittedBy !== expectedEmail && fieldEmail !== expectedEmail) return false;
  }

  if (hasEmployeeCondition) {
    const actualEmployeeId = normalized(fieldValue(data, rule.employeeIdField));
    if (actualEmployeeId !== expectedEmployeeId) return false;
  }

  if (hasUserIdCondition) {
    const actualUserId = normalized(fieldValue(data, rule.userIdField));
    if (actualUserId !== expectedUserId) return false;
  }

  if (hasFullNameCondition) {
    const actualFullName = normalized(fieldValue(data, rule.fullNameField));
    if (actualFullName !== expectedFullName) return false;
  }

  return true;
}

export function resolveEvaluationSubmitterRouting(
  layer: LayerConfigItem,
  data: Record<string, unknown>,
): EvaluationSubmitterRoutingResult | null {
  const rule = (layer.submitterRoutingRules ?? []).find((candidate) => ruleMatches(candidate, data));
  if (!rule) return null;
  return {
    rule,
    email: rule.action === "assign-evaluator" ? text(rule.evaluatorEmail) : undefined,
    manualPaper: rule.action === "manual-paper" || rule.action === "send-to-configured-sender",
    sendToConfiguredSender: rule.action === "send-to-configured-sender",
  };
}

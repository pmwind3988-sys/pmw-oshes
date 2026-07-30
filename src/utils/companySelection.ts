const COMPANY_FIELD_CANDIDATES = [
  "company",
  "Company",
  "Company_x0020_Name",
  "JobCompany",
  "Job_x0020_Company",
];

const COMPANY_FIELD_KEYS = new Set(COMPANY_FIELD_CANDIDATES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rootSurveyJson(surveyJson: unknown): unknown {
  return isRecord(surveyJson) && isRecord(surveyJson.surveyJson)
    ? surveyJson.surveyJson
    : surveyJson;
}

function walkSurveyElements(surveyJson: unknown, visit: (element: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  const root = rootSurveyJson(surveyJson);
  const pages = isRecord(root) && Array.isArray(root.pages) ? root.pages : [];
  const walk = (elements: unknown): Record<string, unknown> | null => {
    if (!Array.isArray(elements)) return null;
    for (const element of elements) {
      if (!isRecord(element)) continue;
      if (visit(element)) return element;
      const nested = walk(element.elements);
      if (nested) return nested;
    }
    return null;
  };
  for (const page of pages) {
    if (!isRecord(page)) continue;
    const found = walk(page.elements);
    if (found) return found;
  }
  return null;
}

function choiceTextForValue(choices: unknown, selectedValue: string): string {
  if (!Array.isArray(choices)) return selectedValue;
  for (const choice of choices) {
    if (typeof choice === "string" && choice === selectedValue) return choice;
    if (!isRecord(choice)) continue;
    const value = String(choice.value ?? choice.text ?? "").trim();
    const text = String(choice.text ?? choice.value ?? "").trim();
    if (value === selectedValue || text === selectedValue) return text || value || selectedValue;
  }
  return selectedValue;
}

export function splitCompanyLines(value: unknown): string[] {
  return typeof value === "string"
    ? value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    : [];
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(", ");
  if (isRecord(value)) {
    for (const key of ["value", "Value", "text", "Title", "Description", "Url", "email", "Email"]) {
      const next = value[key];
      if (typeof next === "string" && next.trim()) return next.trim();
    }
  }
  return "";
}

export function isManagedCompanyQuestion(element: Record<string, unknown>): boolean {
  if (element.isManagedCompanyChoice === true || element.managedPlacement === "banner") return true;
  const name = String(element.name ?? "").trim();
  const title = String(element.title ?? "").trim().toLowerCase();
  const type = String(element.type ?? "").trim().toLowerCase();
  return name === "company" && title === "company" && type === "radiogroup";
}

export function getManagedCompanyQuestion(surveyJson: unknown): Record<string, unknown> | null {
  return walkSurveyElements(surveyJson, isManagedCompanyQuestion);
}

export function getSelectedCompany(responseData: Record<string, unknown> | null | undefined, surveyJson?: unknown): string {
  if (!responseData) return "";
  const companyQuestion = surveyJson ? getManagedCompanyQuestion(surveyJson) : null;
  const questionName = typeof companyQuestion?.name === "string" ? companyQuestion.name : "";
  const candidates = Array.from(new Set([questionName, ...COMPANY_FIELD_CANDIDATES].filter(Boolean)));

  for (const key of candidates) {
    if (!(key in responseData)) continue;
    const value = displayValue(responseData[key]);
    if (value) return choiceTextForValue(companyQuestion?.choices, value);
  }
  return "";
}

export function isCompanyResponseKey(key: string, surveyJson?: unknown): boolean {
  if (COMPANY_FIELD_KEYS.has(key)) return true;
  const companyQuestion = surveyJson ? getManagedCompanyQuestion(surveyJson) : null;
  return typeof companyQuestion?.name === "string" && companyQuestion.name === key;
}

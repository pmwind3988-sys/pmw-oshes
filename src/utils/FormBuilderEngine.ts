import type {
  FormBuilderField,
  SurveyJson,
  QuestionTypeDefinition,
} from "../types";

// ── Type Groups ────────────────────────────────────────────────────────────────

export const TYPE_GROUPS = ["Basic", "Text", "Choice", "Date/Time", "Numeric", "Selection", "Advanced", "Layout", "Display"] as const;

// ── Question Type Definitions ──────────────────────────────────────────────────

export const QUESTION_TYPES: QuestionTypeDefinition[] = [
  // ========== BASIC GROUP (most fundamental inputs) ==========
  {
    type: "text",
    label: "Text Input",
    icon: "📝",
    group: "Basic",
    description: "Single-line text input",
    spColumnKind: 2,
    defaultProps: { inputType: "text", placeholder: "", maxLength: 0 },
  },
  {
    type: "number",
    label: "Number",
    icon: "🔢",
    group: "Basic",
    description: "Numeric input field",
    spColumnKind: 9,
    defaultProps: { inputType: "number", placeholder: "", displayFormat: "0.00", prefix: "", suffix: "" },
  },
  {
    type: "boolean",
    label: "Yes/No",
    icon: "✅",
    group: "Basic",
    description: "Boolean yes/no toggle",
    spColumnKind: 8,
    defaultProps: { labelTrue: "Yes", labelFalse: "No" },
  },
  {
    type: "comment",
    label: "Long Text",
    icon: "📄",
    group: "Basic",
    description: "Multi-line text area",
    spColumnKind: 3,
    defaultProps: { inputType: "comment", rows: 4, placeholder: "" },
  },
  {
    type: "date",
    label: "Date",
    icon: "📅",
    group: "Basic",
    description: "Date picker input",
    spColumnKind: 4,
    defaultProps: { inputType: "date", minDate: "", maxDate: "", disableWeekends: false },
  },
  {
    type: "datetime",
    label: "Date & Time",
    icon: "🕐",
    group: "Basic",
    description: "Date and time picker input",
    spColumnKind: 4,
    defaultProps: { inputType: "datetime", minDate: "", maxDate: "", disableWeekends: false },
  },
  // ========== TEXT GROUP (text input variants) ==========
  {
    type: "password",
    label: "Password",
    icon: "🔒",
    group: "Text",
    description: "Secure password input with strength indicator",
    spColumnKind: 2,
    defaultProps: { placeholder: "Enter password", showToggle: true, strengthIndicator: true, minLength: 8 },
  },

  // ========== CHOICE GROUP (single/multi select) ==========
  {
    type: "dropdown",
    label: "Dropdown",
    icon: "📋",
    group: "Choice",
    description: "Single-select dropdown list",
    spColumnKind: 6,
    defaultProps: {
      choices: ["Option 1", "Option 2"],
      colCount: 1,
      hasOther: false,
      hasNone: false,
      searchable: false,
      clearable: false,
    },
  },
  {
    type: "radiogroup",
    label: "Radio Group",
    icon: "🔘",
    group: "Choice",
    description: "Single-select radio buttons",
    spColumnKind: 6,
    defaultProps: {
      choices: ["Option 1", "Option 2"],
      colCount: 1,
      hasOther: false,
      hasNone: false,
      displayAs: "vertical",
    },
  },
  {
    type: "checkbox",
    label: "Checkbox Group",
    icon: "☑️",
    group: "Choice",
    description: "Multi-select checkboxes",
    spColumnKind: 15,
    defaultProps: {
      choices: ["Option 1", "Option 2"],
      colCount: 1,
      hasOther: false,
      selectAll: false,
      maxSelections: 0,
    },
  },
  // ========== DATE/TIME GROUP (time-related inputs) ==========
  {
    type: "duration",
    label: "Duration",
    icon: "⏱️",
    group: "Date/Time",
    description: "Hours and minutes picker",
    spColumnKind: 9,
    defaultProps: { maxHours: 24, stepMinutes: 15 },
  },
  // ========== NUMERIC GROUP (number-related inputs) ==========
  {
    type: "counter",
    label: "Counter / Stepper",
    icon: "➕",
    group: "Numeric",
    description: "Plus/minus buttons with count",
    spColumnKind: 9,
    defaultProps: { min: 0, max: 100, step: 1, initialValue: 0, defaultValue: 0 },
  },
  {
    type: "currency",
    label: "Currency",
    icon: "💰",
    group: "Numeric",
    description: "Monetary input with currency formatting",
    spColumnKind: 9,
    defaultProps: { currency: "MYR", locale: "en-MY", currencySymbol: "RM", decimalPlaces: 2, min: 0, max: 0, step: 0.01 },
  },
  {
    type: "formula",
    label: "Formula / Calculated",
    icon: "🔢",
    group: "Numeric",
    description: "Read-only computed value",
    spColumnKind: 9,
    defaultProps: { expression: "", defaultValue: 0, decimalPlaces: 2, displayFormat: "number", recalculateOnChange: true },
  },
  // ========== SELECTION GROUP (interactive selectors) ==========
  {
    type: "slider",
    label: "Slider",
    icon: "🎚️",
    group: "Selection",
    description: "Numeric range slider",
    spColumnKind: 9,
    defaultProps: { min: 0, max: 100, step: 1, showTooltip: true, showMinMax: true, prefix: "", suffix: "", defaultValue: 0 },
  },
  // ========== ADVANCED GROUP (complex widgets) ==========
  {
    type: "rating",
    label: "Rating",
    icon: "⭐",
    group: "Advanced",
    description: "Star rating input",
    spColumnKind: 9,
    defaultProps: {
      rateMin: 1,
      rateMax: 5,
      minRateDescription: "Poor",
      maxRateDescription: "Excellent",
    },
  },
  {
    type: "file",
    label: "File Upload",
    icon: "📎",
    group: "Advanced",
    description: "File upload field",
    spColumnKind: 2,
    defaultProps: {
      acceptedTypes: ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg",
      maxSize: 10485760,
      allowMultiple: false,
      showThumbnails: true,
    },
  },
  {
    type: "imageupload",
    label: "Image Upload",
    icon: "🖼️",
    group: "Advanced",
    description: "Image upload with crop preview",
    spColumnKind: 2,
    defaultProps: { aspectRatio: "free", maxWidth: 1920, maxHeight: 1080, allowWebcam: true },
  },
  {
    type: "signaturepad",
    label: "Signature",
    icon: "✍️",
    group: "Advanced",
    description: "Digital signature pad",
    spColumnKind: 11,
    defaultProps: {
      signatureWidth: 400,
      signatureHeight: 200,
      penColor: "#000000",
      backgroundColor: "#FFFFFF",
      exportFormat: "PNG",
    },
  },
  {
    type: "nric",
    label: "NRIC / IC",
    icon: "🪪",
    group: "Advanced",
    description: "Malaysian IC with validation",
    spColumnKind: 2,
    defaultProps: { extractDOB: true, extractGender: true, extractState: true, showExtractedInfo: true },
  },
  {
    type: "consent",
    label: "Consent / Terms",
    icon: "📜",
    group: "Advanced",
    description: "Checkbox with scrollable terms",
    spColumnKind: 8,
    defaultProps: { termsContent: "", mustScrollToBottom: true },
  },
  {
    type: "dynamicmatrix",
    label: "Dynamic Matrix",
    icon: "📊",
    group: "Advanced",
    description: "Dynamic table with configurable rows and columns",
    spColumnKind: null,
    defaultProps: {
      columns: ["Column 1", "Column 2"],
      minRows: 1,
      maxRows: 10,
      addRowText: "Add Row",
    },
  },
  {
    type: "tableinput",
    label: "Table Input",
    icon: "🗃️",
    group: "Advanced",
    description: "User fills in rows of a table",
    spColumnKind: null,
    defaultProps: { columns: [{ name: "col1", title: "Column 1" }], minRows: 1, maxRows: 50 },
  },
  {
    type: "ranking",
    label: "Ranking",
    icon: "🏆",
    group: "Advanced",
    description: "Drag to rank items",
    spColumnKind: 3,
    defaultProps: { items: ["Item 1", "Item 2", "Item 3"], minItems: 1, maxItems: 10 },
  },
  {
    type: "hierarchy",
    label: "Hierarchy Selector",
    icon: "🌳",
    group: "Advanced",
    description: "Cascading dropdowns (Country → State → City)",
    spColumnKind: 2,
    defaultProps: { levels: ["Country", "State", "City"], dataSource: [] },
  },
  {
    type: "jsoneditor",
    label: "JSON Editor",
    icon: "{ }",
    group: "Advanced",
    description: "Raw JSON input with syntax highlighting",
    spColumnKind: 3,
    defaultProps: { schema: "", initialValue: "{}" },
  },
  // ========== LAYOUT GROUP (structural elements) ==========
  {
    type: "spacer",
    label: "Spacer",
    icon: "↕️",
    group: "Layout",
    description: "Vertical whitespace block",
    spColumnKind: null,
    defaultProps: { height: 16 },
  },
  {
    type: "divider",
    label: "Divider",
    icon: "━",
    group: "Layout",
    description: "Horizontal rule separator",
    spColumnKind: null,
    defaultProps: { style: "solid", color: "#E5E3F0", margin: "16px 0" },
  },
  {
    type: "pagebreak",
    label: "Page Break",
    icon: "📄",
    group: "Layout",
    description: "Insert a page break for multi-page forms",
    spColumnKind: null,
    defaultProps: { pageTitle: "", pageDescription: "", showPageNumber: true },
  },
  {
    type: "panel",
    label: "Section / Panel",
    icon: "📦",
    group: "Layout",
    description: "Collapsible card container for grouping fields",
    spColumnKind: null,
    defaultProps: { title: "Section", description: "", collapsible: true, startWithNewLine: true },
  },
  {
    type: "columns",
    label: "Column Layout",
    icon: "📊",
    group: "Layout",
    description: "Arrange fields in 2 or 3 columns",
    spColumnKind: null,
    defaultProps: { columnCount: 2, gap: 16, responsiveBreakpoint: 768 },
  },
  {
    type: "repeater",
    label: "Repeater Panel",
    icon: "🔁",
    group: "Layout",
    description: "Repeating group of fields (dynamic rows)",
    spColumnKind: null,
    defaultProps: { minRows: 1, maxRows: 10, addButtonText: "Add Row", removeButtonText: "Remove", showBlankRow: true },
  },
  // ========== DISPLAY GROUP (non-input content) ==========
  {
    type: "html",
    label: "HTML Block",
    icon: "🌐",
    group: "Display",
    description: "Rich HTML content block",
    spColumnKind: null,
    defaultProps: { html: "<p>Enter your content here</p>", backgroundColor: "", padding: "12px" },
  },
  {
    type: "image",
    label: "Image",
    icon: "🖼️",
    group: "Display",
    description: "Display an image",
    spColumnKind: null,
    defaultProps: { url: "", altText: "", maxWidth: "100%", caption: "", linkOnClick: "" },
  },
  {
    type: "alert",
    label: "Alert / Notice",
    icon: "⚠️",
    group: "Display",
    description: "Styled info/warning/error/success box",
    spColumnKind: null,
    defaultProps: { type: "info", icon: true, title: "", body: "", dismissible: false },
  },
  {
    type: "videoembed",
    label: "Video Embed",
    icon: "🎬",
    group: "Display",
    description: "Embed YouTube/Vimeo or MP4",
    spColumnKind: null,
    defaultProps: { url: "", autoplay: false, showControls: true, caption: "" },
  },
  {
    type: "countdown",
    label: "Countdown Timer",
    icon: "⏳",
    group: "Display",
    description: "Countdown to a datetime",
    spColumnKind: null,
    defaultProps: { endDateTime: "", onExpireAction: "disable", onExpireMessage: "Time expired" },
  },
  {
    type: "scorecard",
    label: "Scorecard",
    icon: "🎯",
    group: "Display",
    description: "Computed score badge",
    spColumnKind: 9,
    defaultProps: { expression: "", thresholds: { green: 80, amber: 60, red: 0 }, label: "Score" },
  },
  {
    type: "datatable",
    label: "Data Table",
    icon: "📋",
    group: "Display",
    description: "Read-only table from API",
    spColumnKind: null,
    defaultProps: { endpointUrl: "", columns: [], pagination: true, sortable: true },
  },
  {
    type: "chartdisplay",
    label: "Chart Display",
    icon: "📈",
    group: "Display",
    description: "Render chart inline",
    spColumnKind: null,
    defaultProps: { chartType: "bar", dataSource: "static", colors: ["#5B21B6", "#7C3AED"] },
  },
];

// ── ID Generation ──────────────────────────────────────────────────────────────

export function generateFieldId(prefix = "field"): string {
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${rand}`;
}

// ── Question Factory ───────────────────────────────────────────────────────────

function toCamelCase(label: string): string {
  return label
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(" ")
    .map((word, i) => {
      const lower = word.toLowerCase();
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

export function createQuestion(td: QuestionTypeDefinition): FormBuilderField {
  const _id = generateFieldId();
  const name = toCamelCase(td.label);
  const base: FormBuilderField = {
    _id,
    type: td.type,
    name,
    title: td.label,
    isRequired: false,
    startWithNewLine: true,
    visible: true,
    readOnly: false,
    description: "",
    ...td.defaultProps,
  };
  return base;
}

// ── Survey JSON Builder ────────────────────────────────────────────────────────

const INTERNAL_FIELDS = [
  "_id",
  "_visIfField",
  "_visIfOp",
  "_visIfVal",
  "_enabIfField",
  "_enabIfOp",
  "_enabIfVal",
  "_textCustomised",
  "variantKey",
  "_expression",
  "isManagedCompanyChoice",
  "managedPlacement",
];

/** Map builder-only field props to SurveyJS-native equivalents before export. */
function applySurveyJsChoiceProps(cleaned: Record<string, unknown>, fieldType: string) {
  if (fieldType !== "dropdown") return;
  if ("searchable" in cleaned) {
    cleaned.searchEnabled = cleaned.searchable !== false;
    delete cleaned.searchable;
  }
  if ("clearable" in cleaned) {
    cleaned.allowClear = cleaned.clearable !== false;
    delete cleaned.clearable;
  }
  // Native <select> avoids SurveyJS dropdownListModel, which crashes in React 19
  // Strict Mode when the survey model is disposed and remounted.
  if (cleaned.searchEnabled === false) {
    cleaned.renderAs = "select";
  }
}

/**
 * Map custom/non-native field types to SurveyJS-native equivalents.
 * Layout and display types that do not create SP columns are mapped to `html`.
 */
function mapFieldToSurveyJs(field: FormBuilderField): FormBuilderField {
  const { type } = field;

  // Native SurveyJS types that need no transformation
  const nativeTypes = [
    "text", "comment", "dropdown", "radiogroup", "checkbox",
    "boolean", "rating", "file", "html", "image",
    "signaturepad", "panel", "pagebreak",
    "ranking", "matrixdynamic",
  ];
  if (nativeTypes.includes(type)) return field;

  switch (type) {
    // Text variants (SurveyJS uses type="text" + inputType)
    case "number": {
      const base: Record<string, unknown> = { ...field, type: "text", inputType: "number" };
      if (field.displayFormat) {
        base.format = field.displayFormat;
      }
      return base as unknown as FormBuilderField;
    }
    case "password":
      return { ...field, type: "text", inputType: "password" };
    case "email":
      return { ...field, type: "text", inputType: "email" };
    case "url":
      return { ...field, type: "text", inputType: "url" };
    case "tel":
      return { ...field, type: "text", inputType: "tel" };
    case "date":
      return { ...field, type: "text", inputType: "date" };
    case "datetime":
      return { ...field, type: "text", inputType: "datetime-local" };

    // Display → html
    case "alert":
      return {
        ...field,
        type: "html",
        html: `<div style="padding:12px 16px;border-radius:8px;background:${field.alertType === "error" ? "#FEE2E2" : field.alertType === "warning" ? "#FEF3C7" : field.alertType === "success" ? "#D1FAE5" : "#EFF6FF"};color:${field.alertType === "error" ? "#DC2626" : field.alertType === "warning" ? "#D97706" : field.alertType === "success" ? "#059669" : "#2563EB"}">${field.alertTitle ? `<strong>${field.alertTitle}</strong><br/>` : ""}${field.alertBody || ""}</div>`,
      };
    case "videoembed":
      return {
        ...field,
        type: "html",
        html: field.videoUrl
          ? `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;"><iframe src="${field.videoUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen></iframe></div>${field.videoCaption ? `<p style="font-size:12px;color:#6B7280;margin-top:8px;">${field.videoCaption}</p>` : ""}`
          : "<p>Video embed</p>",
      };
    case "countdown":
      return { ...field, type: "html", html: `<p>Countdown to ${field.endDateTime || "..."}</p>` };
    case "scorecard":
      return { ...field, type: "expression", expression: field.scoreExpression || field.expression || "0" };
    case "datatable":
      return { ...field, type: "html", html: "<p>Data table</p>" };
    case "chartdisplay":
      return { ...field, type: "html", html: "<p>Chart display</p>" };

    // Layout → html or native layout
    case "spacer":
      return { ...field, type: "html", html: `<div style="height:${field.height || 16}px"></div>` };
    case "divider":
      return { ...field, type: "html", html: `<hr style="border-top:1px ${field.dividerStyle || "solid"} ${field.dividerColor || "#E5E3F0"};margin:${field.dividerMargin || "16px 0"};border-bottom:none;">` };
    case "columns":
      return { ...field, type: "panel", colCount: field.columnCount || 2 };
    case "repeater":
      return { ...field, type: "paneldynamic" };

    // Selection variants
    case "slider":
      return { ...field, type: "text", inputType: "number" };

    // Numeric variants
    case "duration":
      return { ...field, type: "text", inputType: "number" };
    case "counter":
      return { ...field, type: "text", inputType: "number" };
    case "currency": {
      const cs = (field as unknown as Record<string, unknown>).currencySymbol as string || "RM";
      const dp = (field as unknown as Record<string, unknown>).decimalPlaces as number ?? 2;
      const fmt = dp > 0 ? `0.${"0".repeat(dp)}` : "0";
      return { ...field, type: "text", inputType: "number", currency: cs, format: fmt };
    }
    case "formula": {
      // Use SurveyJS native `expression` type — auto-evaluates and re-evaluates.
      // CRITICAL: `readOnly` must be false or explicitly NOT set. SurveyJS's
      // QuestionExpressionModel.runConditionCore() checks `isReadOnly` and SKIPS
      // expression evaluation when the question is readOnly (unless runIfReadOnly
      // is true). The builder toggle may set readOnly=true on the field, which
      // spreads through ...field and blocks all expression re-evaluation.
      let exprVal = (field.expression || "0");
      // Collapse duplicate operators: both `+ +` (with whitespace) and `++` (adjacent)
      // MUST capture the second operator instead of using lookahead — the old regex
      // `([+\-*/])\s+(?=[+\-*/])` with substitution `$1` converted `+ +` → `++`
      // because the lookahead didn't consume the second operator, leaving it in place.
      exprVal = exprVal.replace(/([+\-*/])\s+([+\-*/])/g, '$1');
      exprVal = exprVal.replace(/([+\-*/])\1+/g, '$1');
      const dVal = field.defaultValue !== undefined ? field.defaultValue : 0;
      const decPlaces = (field as unknown as Record<string, unknown>).decimalPlaces as number ?? 2;
      const dispFmt = (field as unknown as Record<string, unknown>).displayFormat as string || "number";
      const props: Record<string, unknown> = {
        type: "expression",
        expression: exprVal,
        defaultValue: dVal,
        minimumFractionDigits: decPlaces,
        maximumFractionDigits: decPlaces,
        // Must NOT be readOnly — SurveyJS skips expression evaluation on readOnly questions
        readOnly: false,
        // Clear residual format from previous saves
        format: undefined,
      };
      if (dispFmt === "currency") {
        props.displayStyle = "currency";
        props.currency = "MYR";
      } else if (dispFmt === "percent") {
        props.displayStyle = "percent";
      } else {
        props.displayStyle = "decimal";
      }
      return { ...field, ...props } as unknown as FormBuilderField;
    }

    // Advanced variants
    case "imageupload":
      return { ...field, type: "file", acceptedTypes: "image/*,.png,.jpg,.jpeg" };
    case "consent":
      return { ...field, type: "boolean" };
    case "nric":
      return { ...field, type: "text" };
    case "jsoneditor":
      return { ...field, type: "comment" };
    case "hierarchy":
      return { ...field, type: "dropdown" };
    case "dynamicmatrix":
    case "tableinput":
      return { ...field, type: "matrixdynamic" };

    // Fallback: everything else renders as plain text
    default:
      return { ...field, type: "text" };
  }
}

export function buildSurveyJson(
  fields: FormBuilderField[],
  surveySettings: Record<string, unknown> = {}
): SurveyJson {
  function buildElements(items: FormBuilderField[]): Record<string, unknown>[] {
    return items.map((f) => {
      const mapped = mapFieldToSurveyJs(f);
      const cleaned: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(mapped)) {
        if (INTERNAL_FIELDS.includes(key)) continue;
        if (val !== undefined) cleaned[key] = val;
      }
      // Handle dynamic default markers for date/datetime
      if (cleaned.defaultValue === "__today__") {
        cleaned.defaultValueExpression = "today()";
        delete cleaned.defaultValue;
      } else if (cleaned.defaultValue === "__now__") {
        cleaned.defaultValueExpression = "now()";
        delete cleaned.defaultValue;
      }
      // Map internal `collapsed` boolean to SurveyJS `state` string
      if (f.type === "panel" && cleaned.collapsible) {
        if (cleaned.collapsed === true) {
          cleaned.state = "collapsed";
        }
        delete cleaned.collapsed;
        delete cleaned.collapsible;
      }
      applySurveyJsChoiceProps(cleaned, f.type);
      // Recursively emit nested elements for panels
      if (f.type === "panel" && Array.isArray(f.elements) && f.elements.length > 0) {
        cleaned.elements = buildElements(f.elements);
      }
      return cleaned;
    });
  }

  const elements = buildElements(fields);

  const json: SurveyJson = {
    title: (surveySettings.title as string) ?? "New Form",
    description: (surveySettings.description as string) ?? "",
    fontFamily: "Inter",
    pages: [{ name: "page1", elements }],
  };

  const settingKeys = [
    "titleLocation",
    "textTransform",
    "showQuestionNumbers",
    "checkErrorsMode",
    "textUpdateMode",
    "showProgressBar",
    "showPageTitles",
    "primaryColor",
    "backgroundColor",
    "textColor",
    "errorColor",
    "borderRadius",
    "labelPosition",
  ] as const;

  for (const key of settingKeys) {
    if (surveySettings[key] !== undefined) {
      (json as unknown as Record<string, unknown>)[key] = surveySettings[key];
    }
  }

  return json;
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateFields(
  fields: FormBuilderField[]
): { id: string; msg: string }[] {
  const errors: { id: string; msg: string }[] = [];
  const nameCount: Record<string, number> = {};

  function walk(items: FormBuilderField[]) {
    for (const f of items) {
      if (!f.name?.trim()) {
        errors.push({ id: f._id, msg: "Field name is required" });
      }
      if (!f.title?.trim()) {
        errors.push({ id: f._id, msg: "Field title is required" });
      }
      if (f.name?.trim()) {
        nameCount[f.name] = (nameCount[f.name] ?? 0) + 1;
      }

      const choiceTypes = ["dropdown", "radiogroup", "checkbox"];
      if (choiceTypes.includes(f.type)) {
        // Skip local choices check if pulling from SharePoint or filtered list
        const spSource = (f as unknown as Record<string, unknown>).spChoicesSource as { list?: string; column?: string } | undefined;
        const flSource = (f as unknown as Record<string, unknown>).spFilteredListSource as { list?: string; valueColumn?: string } | undefined;
        const hasExternalSource = (spSource?.list && spSource?.column) || (flSource?.list && flSource?.valueColumn);
        if (!hasExternalSource) {
          const choices = f.choices ?? [];
          if (choices.length < 2) {
            errors.push({
              id: f._id,
              msg: "Choice fields must have at least 2 options",
            });
          }
        }
      }

      if (f.type === "rating") {
        const min = f.rateMin ?? 1;
        const max = f.rateMax ?? 5;
        if (min >= max) {
          errors.push({
            id: f._id,
            msg: "Rating min must be less than max",
          });
        }
      }

      // Recursively validate panel children
      if (f.type === "panel" && Array.isArray(f.elements)) {
        walk(f.elements);
      }
    }
  }

  walk(fields);

  for (const f of fields) {
    if (f.name && nameCount[f.name] > 1) {
      errors.push({ id: f._id, msg: `Duplicate field name: ${f.name}` });
    }
  }

  return errors;
}

// ── Field Operations ───────────────────────────────────────────────────────────

export function updateField(
  fields: FormBuilderField[],
  id: string,
  patch: Partial<FormBuilderField>
): FormBuilderField[] {
  return fields.map((f) => {
    if (f._id === id) return { ...f, ...patch };
    if (f.type === "panel" && Array.isArray(f.elements)) {
      return { ...f, elements: updateField(f.elements, id, patch) };
    }
    return f;
  });
}

export function removeField(
  fields: FormBuilderField[],
  id: string
): FormBuilderField[] {
  return fields.filter((f) => f._id !== id);
}

export function duplicateField(
  fields: FormBuilderField[],
  id: string
): FormBuilderField[] {
  const idx = fields.findIndex((f) => f._id === id);
  if (idx === -1) return fields;
  const original = fields[idx];
  const copy: FormBuilderField = {
    ...original,
    _id: generateFieldId(),
    name: `${original.name}_copy`,
    title: `${original.title} (Copy)`,
  };
  return [...fields.slice(0, idx + 1), copy, ...fields.slice(idx + 1)];
}

export function reorderFields(
  fields: FormBuilderField[],
  fromIndex: number,
  toIndex: number
): FormBuilderField[] {
  const result = [...fields];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved);
  return result;
}

// ── Tree Helpers ───────────────────────────────────────────────────────────────

/** Find a field by id anywhere in the tree (root or inside panels) */
export function findFieldById(fields: FormBuilderField[], id: string): FormBuilderField | null {
  for (const f of fields) {
    if (f._id === id) return f;
    if (f.type === "panel" && Array.isArray(f.elements)) {
      const found = findFieldById(f.elements, id);
      if (found) return found;
    }
  }
  return null;
}

/** Find the parent array and index of a field by id */
export function findFieldLocation(fields: FormBuilderField[], id: string): { parent: FormBuilderField[]; index: number } | null {
  for (let i = 0; i < fields.length; i++) {
    if (fields[i]._id === id) return { parent: fields, index: i };
    if (fields[i].type === "panel" && Array.isArray(fields[i].elements)) {
      const loc = findFieldLocation(fields[i].elements!, id);
      if (loc) return loc;
    }
  }
  return null;
}

/** Remove a field by id from anywhere in the tree */
export function removeFieldRecursive(fields: FormBuilderField[], id: string): FormBuilderField[] {
  const result: FormBuilderField[] = [];
  for (const f of fields) {
    if (f._id === id) continue;
    if (f.type === "panel" && Array.isArray(f.elements)) {
      result.push({ ...f, elements: removeFieldRecursive(f.elements, id) });
    } else {
      result.push(f);
    }
  }
  return result;
}

/** Duplicate a field by id anywhere in the tree */
export function duplicateFieldRecursive(fields: FormBuilderField[], id: string): FormBuilderField[] {
  return fields.map((f) => {
    if (f._id === id) {
      const copy: FormBuilderField = {
        ...f,
        _id: generateFieldId(),
        name: `${f.name}_copy`,
        title: `${f.title} (Copy)`,
      };
      // If duplicating a panel, also duplicate its children
      if (f.type === "panel" && Array.isArray(f.elements)) {
        copy.elements = f.elements.map((child) => ({
          ...child,
          _id: generateFieldId(),
          name: `${child.name}_copy`,
          title: `${child.title} (Copy)`,
        }));
      }
      return [f, copy];
    }
    if (f.type === "panel" && Array.isArray(f.elements)) {
      return [{ ...f, elements: duplicateFieldRecursive(f.elements, id) }];
    }
    return [f];
  }).flat();
}

/** Move a field into a panel's elements by id */
export function moveFieldIntoPanel(
  fields: FormBuilderField[],
  fieldId: string,
  panelId: string
): FormBuilderField[] {
  // Find the field first
  const field = findFieldById(fields, fieldId);
  if (!field) return fields;
  // Remove from current location
  let next = removeFieldRecursive(fields, fieldId);
  // Add to target panel
  next = next.map((f) => {
    if (f._id === panelId && f.type === "panel") {
      return {
        ...f,
        elements: [...(f.elements || []), field],
      };
    }
    if (f.type === "panel" && Array.isArray(f.elements)) {
      return { ...f, elements: moveFieldIntoPanel(f.elements, fieldId, panelId) };
    }
    return f;
  });
  return next;
}

/** Move a field out of its panel to the root level at a specific index */
export function moveFieldToRoot(
  fields: FormBuilderField[],
  fieldId: string,
  atIndex: number
): FormBuilderField[] {
  const field = findFieldById(fields, fieldId);
  if (!field) return fields;
  const next = removeFieldRecursive(fields, fieldId);
  const result = [...next];
  result.splice(atIndex, 0, field);
  return result;
}

/** Reorder fields within their current container (root or panel) */
export function reorderFieldsRecursive(
  fields: FormBuilderField[],
  fromId: string,
  toId: string
): FormBuilderField[] {
  // Find the container that holds both fields
  for (let i = 0; i < fields.length; i++) {
    if (fields[i]._id === fromId || fields[i]._id === toId) {
      // Both are in this root array
      const fromIndex = fields.findIndex((f) => f._id === fromId);
      const toIndex = fields.findIndex((f) => f._id === toId);
      if (fromIndex === -1 || toIndex === -1) return fields;
      return reorderFields(fields, fromIndex, toIndex);
    }
    if (fields[i].type === "panel" && Array.isArray(fields[i].elements)) {
      const updated = reorderFieldsRecursive(fields[i].elements!, fromId, toId);
      if (updated !== fields[i].elements) {
        const result = [...fields];
        result[i] = { ...fields[i], elements: updated };
        return result;
      }
    }
  }
  return fields;
}

/** Add a field to a panel by panel id */
export function addFieldToPanel(
  fields: FormBuilderField[],
  panelId: string,
  field: FormBuilderField
): FormBuilderField[] {
  return fields.map((f) => {
    if (f._id === panelId && f.type === "panel") {
      return { ...f, elements: [...(f.elements || []), field] };
    }
    if (f.type === "panel" && Array.isArray(f.elements)) {
      return { ...f, elements: addFieldToPanel(f.elements, panelId, field) };
    }
    return f;
  });
}

/** Flatten a tree of FormBuilderField[] into a single array (for dropdowns, exports, etc.) */
export function flattenFieldTree(fields: FormBuilderField[]): FormBuilderField[] {
  const result: FormBuilderField[] = [];
  for (const f of fields) {
    result.push(f);
    if (f.type === "panel" && Array.isArray(f.elements)) {
      result.push(...flattenFieldTree(f.elements));
    }
  }
  return result;
}

// ── Question Tree Builders ─────────────────────────────────────────────────────

/** Load SurveyJS JSON into a tree of FormBuilderField (panels preserve their children) */
export function buildQuestionTree(json: SurveyJson): FormBuilderField[] {
  function walk(elements: Record<string, unknown>[]): FormBuilderField[] {
    const result: FormBuilderField[] = [];
    for (const el of elements) {
      if (el.type === "panel" && Array.isArray(el.elements)) {
        const panel = { ...el, _id: (el._id as string) || generateFieldId(), elements: walk(el.elements as Record<string, unknown>[]) } as unknown as FormBuilderField;
        result.push(panel);
      } else {
        // Map formula fields saved as text+_expression back to "formula" for the builder
        // Check _expression (new format) first, then native expression (old format)
        const exprVal = (el as Record<string, unknown>)._expression || (el as Record<string, unknown>).expression || "";
        let fieldSrc = el.type === "expression" || (el.type === "text" && exprVal)
          ? { ...el, type: "formula", expression: exprVal } : el;
        if (fieldSrc.type === "matrixdynamic") {
          const savedColumns = Array.isArray(fieldSrc.columns)
            ? fieldSrc.columns
            : Array.isArray(fieldSrc.tableConfigColumns)
              ? fieldSrc.tableConfigColumns
              : [];
          fieldSrc = {
            ...fieldSrc,
            type: "dynamicmatrix",
            columns: savedColumns,
            tableConfigColumns: savedColumns,
          };
        }
        const field = { ...fieldSrc, _id: (fieldSrc._id as string) || generateFieldId() } as unknown as FormBuilderField;
        result.push(field);
      }
    }
    return result;
  }

  const all: FormBuilderField[] = [];
  for (const page of json.pages ?? []) {
    if (Array.isArray(page.elements)) {
      all.push(...walk(page.elements));
    }
  }
  return all;
}

/** Flatten SurveyJS JSON into a flat array of all leaf fields (for SP provisioning, exports) */
export function flattenQuestions(json: SurveyJson): FormBuilderField[] {
  const result: FormBuilderField[] = [];

  function walk(elements: Record<string, unknown>[]): void {
    for (const el of elements) {
      if (el.type === "panel" && Array.isArray(el.elements)) {
        walk(el.elements as Record<string, unknown>[]);
      } else {
        result.push(el as unknown as FormBuilderField);
      }
    }
  }

  for (const page of json.pages ?? []) {
    if (Array.isArray(page.elements)) {
      walk(page.elements);
    }
  }

  return result;
}

// ── SharePoint Column Kind ─────────────────────────────────────────────────────

export interface SpColumnInfo {
  FieldTypeKind: number;
  label: string;
}

export function getSpColumnKind(
  field: Pick<FormBuilderField, 'type' | 'inputType' | 'choices'>
): SpColumnInfo | null {
  // dynamicmatrix and tableinput are provisioned separately as _Html + _Json
  if (field.type === 'dynamicmatrix' || field.type === 'tableinput' || field.type === 'matrixdynamic') return null;

  // Complex types that produce arrays/objects → store as JSON in multi-line text
  if (field.type === 'ranking') {
    return { FieldTypeKind: 3, label: 'Multi-line' };
  }

  // ── text type with inputType variants ─────────────────────────────────
  // SurveyJS maps custom types like "number" → { type: "text", inputType: "number" }.
  // The QUESTION_TYPES lookup below won't match "text"+inputType:"number" to the
  // "number" entry because the `type` is different. Catch these here explicitly.
  if (field.type === 'text' && field.inputType) {
    switch (field.inputType) {
      case 'number':
      case 'range':
        return { FieldTypeKind: 9, label: 'Number' };
      case 'date':
      case 'datetime-local':
        return { FieldTypeKind: 4, label: 'DateTime' };
      // password, email, url, tel → keep Text (type 2) default, fall through
    }
  }

  const def = QUESTION_TYPES.find(
    (t) =>
      t.type === field.type &&
      (t.defaultProps?.inputType === field.inputType ||
        !t.defaultProps?.inputType ||
        !field.inputType)
  );
  if (!def) return { FieldTypeKind: 2, label: 'Text' };

  const kind = def.spColumnKind;
  if (kind === null) return null;

  const labels: Record<number, string> = {
    2: 'Text',
    3: 'Multi-line',
    4: 'DateTime',
    6: 'Choice',
    8: 'Yes/No',
    9: 'Number',
    11: 'Image',
    15: 'MultiChoice',
  };
  return { FieldTypeKind: kind, label: labels[kind] || 'Text' };
}

/**
 * CSP-safe arithmetic expression evaluator.
 * Replaces `new Function("return (...))"` which is blocked when
 * Content-Security-Policy disables 'unsafe-eval'.
 *
 * Supports: +, -, *, /, parentheses, decimal numbers, unary minus.
 * Grammar:
 *   expression → term (('+' | '-') term)*
 *   term      → factor (('*' | '/') factor)*
 *   factor    → NUMBER | '(' expression ')' | '-' factor
 */
export function safeEvalArithmetic(input: string): number {
  let pos = 0;
  const s = input.replace(/\s+/g, "");

  function peek(): string { return s[pos] ?? ""; }
  function consume(): string { return s[pos++] ?? ""; }

  function parseNumber(): number {
    const start = pos;
    while (/[0-9.]/.test(peek())) consume();
    if (start === pos) throw new SyntaxError(`Expected number at position ${pos} in "${input}"`);
    return Number(s.slice(start, pos));
  }

  function parseExpression(): number {
    let left = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const right = parseFactor();
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number {
    if (peek() === "-") {
      consume(); // '-'
      return -parseFactor();
    }
    if (peek() === "(") {
      consume(); // '('
      const val = parseExpression();
      if (consume() !== ")") throw new SyntaxError(`Missing ')' at position ${pos} in "${input}"`);
      return val;
    }
    return parseNumber();
  }

  const result = parseExpression();
  if (pos < s.length) throw new SyntaxError(`Unexpected '${s[pos]}' at position ${pos} in "${input}"`);
  return result;
}

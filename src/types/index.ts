export type {
  AuditEntry,
  CatalogueEntry,
  FormVisibility,
  PortalAccess,
  PortalChainStep,
  PortalNavItem,
  PortalNavSection,
  PortalPerson,
  PortalRecord,
  PortalRole,
  PortalScreen,
  PortalStatus,
  SeverityTone,
  StatFilter,
  WorkflowKind,
  WorkflowShape,
} from "./portal";

// Page state machine states
export const PAGE_STATES = {
  checking: "checking",
  choice: "choice",
  guest: "guest",
  loading: "loading",
  ready: "ready",
  restricted: "restricted",
  wrongTenant: "wrong_tenant",
  error: "error",
} as const;

export type PageState = (typeof PAGE_STATES)[keyof typeof PAGE_STATES];

export type AuthDecision = "msal" | "guest";

// Submission data from SharePoint
export interface Submission {
  id: string;
  submissionId: string;
  listTitle: string;
  formId: string;
  formVersion: string;
  /** Published profile (PublishKey) the submission was sent under. */
  publishKey?: string;
  /** `[PREFIX-]DDMMYY-NNNN` issued at submit time, when the form has them on. */
  referenceNo?: string;
  /** Raw L{n}_Status of the layer currently awaiting action, for lifecycle derivation. */
  currentLayerStatus?: string;
  title: string;
  submittedByEmail: string;
  submitterName?: string;
  createdByName?: string;
  createdByEmail?: string;
  submittedAt: string | null;
  modifiedAt?: string | null;
  formStatus: string | null;
  totalLayers: number;
  layers: (ApprovalLayer | null)[];
  meta: ListMetaEntry;
  submissionData: Record<string, unknown>;
  /** Enhanced layer system: active layer number (0 = none/draft) */
  currentLayer?: number;
  /** Manual branch workflow: selected branch key/label when a branch has been chosen */
  selectedBranch?: string;
  /** Enhanced layer system: per-layer results with typed ApprovalLayerResult / EvaluationLayerResult */
  enhancedLayers?: (ApprovalLayerResult | EvaluationLayerResult | null)[];
  /** Enhanced layer system: raw layer config for this form (loaded from Master Form) */
  layerConfig?: LayerConfig | null;
  /** Published form schema for ordering submitted answers in dashboard/PDF views */
  surveyJson?: SurveyJson | null;
  /** Raw WorkflowAssignmentData note column — per-submission layer reassignments. */
  workflowAssignmentRaw?: string | null;
  /** Raw WorkflowEmailSchedule note column — drives nudges and reminder state. */
  workflowEmailScheduleRaw?: string | null;
  /** Raw EvaluationData note column — per-layer notes and evaluation answers. */
  evaluationDataRaw?: string | null;
}

export interface HardDeleteSubmissionResult {
  deletedItem: boolean;
  deletedFiles: number;
  deletedMatrixRows: number;
  warnings: string[];
}

export interface ApprovalLayer {
  status: string;
  outcome: string | undefined;
  email: string | null;
  signedAt: string | null;
  rejectionReason: string | null;
  signature: string | null;
}

// ── Enhanced Layer System Types (Phase 0+) ──────────────────────────────────

export type LayerType = "approval" | "evaluation";
export type AuthMode = "365" | "public";
export type ConfirmationType = "signature" | "checkbox";
export type EvaluationEmailScheduleMode = "immediate" | "three_months" | "custom_days";

export interface EvaluationEmailSchedule {
  mode: EvaluationEmailScheduleMode;
  customDays?: number;
}

export type LayerStatus =
  | "pending"
  | "in_progress"
  | "confirmed"
  | "approved"
  | "rejected"
  | "skipped"
  | "cancelled";

export type FormStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "completed"
  | "rejected"
  | "cancelled";

export interface FixedUserLayerAssignee {
  type: "user";
  value: string;
}

/**
 * Several named mailboxes on one layer, held in a single "a@x.com; b@x.com"
 * string — the shape a people picker hands back. `L{n}_Email` stays one
 * address, so the first entry is the one the workflow routes to.
 */
export interface FixedUsersLayerAssignee {
  type: "users";
  value: string;
}

export interface FieldReferenceLayerAssignee {
  type: "field-reference";
  value: string;
}

export interface DepartmentApproverLayerAssignee {
  type: "department-approver";
  value: string;
  listName?: string;
  departmentColumn?: string;
  emailColumn?: string;
  nameColumn?: string;
  roleColumn?: string;
  roleValue?: string;
}

export type LayerAssignee =
  | FixedUserLayerAssignee
  | FixedUsersLayerAssignee
  | FieldReferenceLayerAssignee
  | DepartmentApproverLayerAssignee;

export interface BaseLayer {
  layerNumber: number;
  type: LayerType;
  authMode: AuthMode;
  assignee: LayerAssignee;
  title?: string;
  description?: string;
  publicToken?: string;
  tokenExpiresAt?: string;
  notifyOnComplete?: boolean;
  /**
   * Working days this layer is allowed before it counts as overdue.
   * Unset layers fall back to LayerConfig.slaDays, and then to no SLA at all —
   * there is no global default, so a form nobody gave a deadline has none.
   */
  slaDays?: number;
  /** Approval role this layer points at (a layer points at a role, not a person). */
  roleLabel?: string;
  manualPaperWhenSenderEmail?: boolean;
  submitterRoutingRules?: EvaluationSubmitterRoutingRule[];
}

export interface ApprovalLayerConfig extends BaseLayer {
  type: "approval";
  confirmationType: ConfirmationType;
  allowRejectionReason: boolean;
}

export interface EvaluationLayerConfig extends BaseLayer {
  type: "evaluation";
  surveyElements: Record<string, unknown>[];
  confirmationLabel?: string;
  emailSchedule?: EvaluationEmailSchedule;
}

export type LayerConfigItem = ApprovalLayerConfig | EvaluationLayerConfig;

export interface EvaluationSubmitterRoutingRule {
  id: string;
  label: string;
  emailField?: string;
  emailValue?: string;
  employeeIdField?: string;
  employeeIdValue?: string;
  userIdField?: string;
  userIdValue?: string;
  fullNameField?: string;
  fullNameValue?: string;
  action: "assign-evaluator" | "manual-paper" | "send-to-configured-sender";
  evaluatorEmail?: string;
}

export interface ManualBranch {
  name: string;
  label: string;
  layers: LayerConfigItem[];
}

export interface LayerConfig {
  version: "1.0";
  layers: LayerConfigItem[];
  routing?: ConditionalRouting[];
  manualBranches?: ManualBranch[];
  /** Short catalogue code (<= 4 chars, uppercase), e.g. "INC". Used to build references. */
  code?: string;
  /** Form-level SLA fallback in working days when a layer sets none. */
  slaDays?: number;
  /** Whether this form type is reachable from the signed-out QR poster picker. */
  isPublic?: boolean;
}

export interface ConditionalRouting {
  conditionField: string;
  rules: {
    when: string;
    skipLayers?: number[];
  }[];
}

/** Stored in EvaluationData Note column as Record<layerNumber, EvaluationDataEntry> */
export interface EvaluationDataEntry {
  status: LayerStatus;
  confirmerEmail: string;
  confirmerName: string | null;
  confirmedAt: string | null;
  fields: Record<string, unknown>;
  notes?: string;
  signatureUrl?: string | null;
}

export interface ApprovalLayerResult {
  layerNumber: number;
  type: "approval";
  status: LayerStatus;
  outcome: "approved" | "rejected" | undefined;
  email: string | null;
  signedAt: string | null;
  rejectionReason: string | null;
  signature: string | null;
  confirmedVia: ConfirmationType;
}

export interface EvaluationLayerResult {
  layerNumber: number;
  type: "evaluation";
  status: LayerStatus;
  email: string | null;
  confirmedAt: string | null;
  fields: Record<string, unknown>;
  notes?: string;
}

export interface ListMetaEntry {
  icon: string;
  color: string;
  pale: string;
  category: string;
}

export interface DiscoveredList {
  title: string;
  id: string;
  itemCount: number;
  created: string;
  hidden: boolean;
  baseTemplate: number;
  baseType?: number;
  isCatalog?: boolean;
  isSiteAssetsLibrary?: boolean;
  isApplicationList?: boolean;
  isSystemList?: boolean;
  noCrawl?: boolean;
}

export interface LoadedConfig {
  /** Declared approval layers per form. Zero is a real answer, not a missing one. */
  layerConfig: Record<string, number>;
  formIdMap: Record<string, string>;
  listMetaMap: Record<string, ListMetaEntry>;
  allowedTitles: Set<string>;
  layerConfigs?: Record<string, LayerConfig | null>;
  surveyJsonByFormVersion?: Record<string, Record<string, SurveyJson | null>>;
  /** Whether each form's link actually opens for an anonymous visitor. */
  formVisibility?: Record<string, import("./portal").FormVisibility>;
  /** Public form route slug, for building the link the catalogue shows. */
  formSlugMap?: Record<string, string>;
}

// Status config for badges
export interface StatusConfigEntry {
  label: string;
  colorClass: string;
  dotClass: string;
}

// SharePoint client interface
export interface SharePointClient {
  ensureSiteAccess(): Promise<void>;
  discoverLists(): Promise<DiscoveredList[]>;
  queryList(listName: string, options?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  queryListByGuid(listGuid: string, options?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  queryListByEmail(listName: string, userEmail: string, options?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  isGroupMember(groupName: string): Promise<boolean>;
  getCurrentUserEmail(): string;
  acquireToken(): Promise<string>;
  listExists(title: string): Promise<boolean>;
  createList(title: string, description?: string): Promise<string | null>;
  addColumn(listTitle: string, internalName: string, fieldTypeKind: number, isMultiLine?: boolean): Promise<void>;
  upsertListItem(listTitle: string, filterExpr: string, body: Record<string, unknown>): Promise<{ updated: boolean; id: string }>;
  deleteListItemsWhere(listTitle: string, filterExpr: string): Promise<number>;
  hardDeleteSubmission(item: Submission): Promise<HardDeleteSubmissionResult>;
  getSiteUsers(): Promise<{ email: string; name: string }[]>;
}

// ── Form Builder Types ────────────────────────────────────────────────────────

export interface FormBuilderField {
  _id: string;
  type: string;
  name: string;
  title: string;
  isRequired: boolean;
  startWithNewLine: boolean;
  visible: boolean;
  readOnly: boolean;
  description: string;
  // Common props for ALL field types
  inputType?: string;
  autocapitalize?: "none" | "sentences" | "words" | "characters";
  placeholder?: string;
  rows?: number;
  choices?: (string | { value: string; text: string })[];
  colCount?: number;
  hasOther?: boolean;
  hasNone?: boolean;
  rateMin?: number;
  rateMax?: number;
  minRateDescription?: string;
  maxRateDescription?: string;
  labelTrue?: string;
  labelFalse?: string;
  defaultValue?: unknown;
  requiredErrorText?: string;
  format?: string;
  visibleIf?: string;
  enableIf?: string;
  titleLocation?: string;
  // Internal tracking
  _visIfField?: string;
  _visIfOp?: string;
  _visIfVal?: string;
  _enabIfField?: string;
  _enabIfOp?: string;
  _enabIfVal?: string;
  _textCustomised?: boolean;
  isManagedCompanyChoice?: boolean;
  managedPlacement?: string;
  // === LAYOUT TYPES ===
  // Page Break
  pageTitle?: string;
  pageDescription?: string;
  showPageNumber?: boolean;
  // Panel
  collapsible?: boolean;
  collapsed?: boolean;
  // Repeater
  minRows?: number;
  maxRows?: number;
  addButtonText?: string;
  removeButtonText?: string;
  showBlankRow?: boolean;
  elements?: FormBuilderField[];
  // Columns
  columnCount?: number;
  gap?: number;
  responsiveBreakpoint?: number;
  // Spacer
  height?: number;
  // Divider
  dividerStyle?: "solid" | "dashed" | "dotted";
  dividerColor?: string;
  dividerMargin?: string;

  // === TEXT TYPES ===
  maxLength?: number;
  // Rich Text
  toolbarOptions?: string[];
  stripHtmlOnExport?: boolean;
  // Password
  showToggle?: boolean;
  strengthIndicator?: boolean;
  minLength?: number;
  // Masked
  mask?: "phone" | "ic" | "creditcard" | "custom";
  guideMode?: boolean;
  // Autocomplete
  dataSource?: string[] | Record<string, unknown>[];
  minChars?: number;
  maxResults?: number;
  allowFreeText?: boolean;
  endpointUrl?: string;
  debounceMs?: number;
  // Tag Input
  delimiter?: "enter" | "comma" | "space";
  maxTags?: number;
  suggestions?: string[];
  allowDuplicates?: boolean;

  // === DATE/TIME TYPES ===
  minDate?: string;
  maxDate?: string;
  disableWeekends?: boolean;
  disableDates?: string[];
  displayFormat?: string;
  returnFormat?: "ISO" | "local" | "unix";
  // Date Range
  maxRangeDuration?: number;
  showNightsCount?: boolean;
  presets?: string[];
  // Time
  hour12Format?: boolean;
  stepMinutes?: number;
  minTime?: string;
  maxTime?: string;
  // Duration
  maxHours?: number;
  stepHours?: number;

  // === SELECTION TYPES ===
  // Dropdown/Radio/Checkbox
  searchable?: boolean;
  clearable?: boolean;
  displayAs?: "vertical" | "horizontal" | "buttongroup" | "cardgrid";
  selectAll?: boolean;
  maxSelections?: number;
  // Slider
  step?: number;
  showTooltip?: boolean;
  showMinMax?: boolean;
  prefix?: string;
  suffix?: string;
  // Range Slider
  formatValue?: string;
  // Star Rating
  allowHalfStars?: boolean;
  starIcon?: "star" | "heart" | "thumb";
  starColor?: string;
  // NPS
  lowLabel?: string;
  highLabel?: string;
  showEmojiFaces?: boolean;
  // Color Picker
  presetPalette?: string[];
  allowCustomHex?: boolean;

  // === NUMERIC TYPES ===
  // Number
  min?: number;
  max?: number;
  // Currency
  currency?: string;
  locale?: string;
  // Formula
  expression?: string;
  recalculateOnChange?: boolean;
  // Unit Converter
  unitPairs?: string[];
  defaultUnit?: string;
  showBothValues?: boolean;
  // Counter
  stepValue?: number;
  initialValue?: number;

  // === ADVANCED TYPES ===
  // File
  acceptedTypes?: string;
  maxSize?: number;
  allowMultiple?: boolean;
  showThumbnails?: boolean;
  storeInSharePoint?: boolean;
  // Image Upload
  aspectRatio?: "free" | "1:1" | "16:9" | "4:3";
  maxWidth?: number;
  maxHeight?: number;
  allowWebcam?: boolean;
  // Signature
  signatureWidth?: number;
  signatureHeight?: number;
  penColor?: string;
  backgroundColor?: string;
  exportFormat?: "PNG" | "SVG";
  // Audio Recorder
  maxDuration?: number;
  showWaveform?: boolean;
  // Address Block
  showLine2?: boolean;
  showCity?: boolean;
  showState?: boolean;
  showPostcode?: boolean;
  showCountry?: boolean;
  countryFilter?: string[];
  // Location Picker
  defaultCenter?: string;
  defaultZoom?: number;
  mapProvider?: "OSM" | "Google" | "Bing";
  showCurrentLocation?: boolean;
  radiusConstraint?: number;
  // NRIC/IC
  extractDOB?: boolean;
  extractGender?: boolean;
  extractState?: boolean;
  showExtractedInfo?: boolean;
  // Consent
  termsContent?: string;
  mustScrollToBottom?: boolean;
  dynamicmatrix?: boolean;
  matrixColumns?: string[];
  columns?: { name: string; title: string; cellType?: string; choices?: string[]; multiSelect?: boolean; choicesSource?: { list?: string; column?: string }; filteredListSource?: { list?: string; valueColumn?: string; filterColumn?: string; filterValue?: string; choicesLoaded?: boolean } }[];
  rowHeaders?: string[];
  addRowText?: string;
  // Table Input
  tableConfigColumns?: { name: string; title: string; type?: string; cellType?: string; choices?: string[]; multiSelect?: boolean; choicesSource?: { list?: string; column?: string }; filteredListSource?: { list?: string; valueColumn?: string; filterColumn?: string; filterValue?: string; choicesLoaded?: boolean }; required?: boolean }[];
  // Ranking
  rankItems?: string[];
  minItems?: number;
  maxItems?: number;
  // Budget Allocator
  totalAmount?: number;
  lineItems?: string[];
  enforceTotal?: boolean;
  // Hierarchy
  hierarchyLevels?: string[];
  hierarchyDataSource?: Record<string, unknown>[];
  // JSON Editor
  jsonSchema?: string;
  initialJson?: string;
  // Data Source
  spChoicesSource?: {
    list?: string;
    column?: string;
    labelColumn?: string;
    multiSelect?: boolean;
    filter?: string;
    choicesLoaded?: boolean;
  };
  spFilteredListSource?: {
    list?: string;
    valueColumn?: string;
    labelColumn?: string;
    filterColumn?: string;
    filterValue?: string;
    choicesLoaded?: boolean;
  };
  // Data Table
  endpoint?: string;
  dataTableColumns?: { key: string; label: string; sortable?: boolean }[];
  enablePagination?: boolean;
  pageSize?: number;
  // Chart Display
  chartType?: "bar" | "line" | "pie" | "doughnut";
  chartDataSource?: string;
  chartColors?: string[];
  // Countdown
  endDateTime?: string;
  onExpireAction?: "disable" | "message" | "redirect";
  onExpireMessage?: string;
  onExpireRedirect?: string;
  // Scorecard
  scoreExpression?: string;
  thresholds?: { green: number; amber: number; red: number };
  scoreLabel?: string;
  // Alert
  alertType?: "info" | "warning" | "error" | "success";
  alertIcon?: boolean;
  alertTitle?: string;
  alertBody?: string;
  dismissible?: boolean;
  // Image
  imageUrl?: string;
  altText?: string;
  imageMaxWidth?: string;
  caption?: string;
  linkUrl?: string;
  // Video
  videoUrl?: string;
  autoplay?: boolean;
  controls?: boolean;
  videoCaption?: string;
  // HTML
  html?: string;
  htmlBackgroundColor?: string;
  htmlPadding?: string;

  // === LOGIC RULES ===
  // Logic/condition fields
  requiredIf?: string;
  // Full logic rules (stored per field)
  logicRules?: LogicRule[];
  crossFieldValidations?: CrossFieldValidation[];
  // Simple value mapping
  value?: unknown;
  valueMapping?: { sourceField: string; transform?: string };
  // Validation
  validators?: FormValidator[];
  // State (for panels)
  state?: string;
  // Admin only
  adminOnly?: boolean;
  // Variant key
  variantKey?: string;

  // === I18N ===
  translations?: Record<string, Record<string, string>>;
  // Field permissions
  viewRoles?: string[];
  editRoles?: string[];
  readOnlyAfterSubmit?: boolean;
  // Sensitive data masking
  isSensitive?: boolean;
  // Comments/annotations
  comment?: string;
}

export interface FormValidator {
  type: string;
  text?: string;
  regex?: string;
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
}

export interface SurveyJson {
  title?: string;
  description?: string;
  titleLocation?: string;
  textTransform?: string;
  showQuestionNumbers?: string;
  checkErrorsMode?: string;
  textUpdateMode?: string;
  showProgressBar?: boolean;
  showPageTitles?: boolean;
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  errorColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  labelPosition?: string;
  pages: { name: string; elements: Record<string, unknown>[] }[];
}

export interface FormBuilderMeta {
  isoStandards?: string;
  companies?: string;
  companyChoiceEnabled?: boolean;
  showBanner?: boolean;
  formId?: string;
  formVersion?: string;
  logoUrl?: string;
  publishKey?: string;
  publishLabel?: string;
  documentHeader?: DocumentControlHeader;
  pdfConfig?: PdfConfig;
}

export interface DocumentControlHeader {
  documentNumber?: string;
  issueNumber?: string;
  effectiveDate?: string;
  revisionNumber?: string;
  revisionDate?: string;
}

export interface FormConfig {
  Id?: string;
  Title: string;
  FormID: string;
  NumberOfApprovalLayer: number;
  Slug: string;
  CurrentVersion: string;
  CurrentPublishKey?: string;
  CurrentPublishLabel?: string;
  IsPublished: boolean;
  IsPublic: boolean;
  ConditionField?: string;
  ApprovalRules?: string;
  /** Enhanced layer system: JSON string of LayerConfig */
  LayerConfig?: string | null;
}

export interface FormVersionData {
  surveyJson: SurveyJson;
  meta?: FormBuilderMeta;
  version: string;
  publishKey?: string;
  publishLabel?: string;
  publishStatus?: PublishProfileStatus;
  publishExpiresAt?: string;
  savedAt: string;
  changedBy: string;
  layerConfig?: LayerConfig | null;
}

export type PublishProfileStatus = "active" | "off";

export interface FormVersionHistory {
  FormVersion: string;
  PublishKey?: string;
  PublishLabel?: string;
  PublishStatus?: PublishProfileStatus;
  PublishExpiresAt?: string;
  DisabledAt?: string;
  DisabledBy?: string;
  PublishedAt: string;
  PublishedBy: string;
  Title: string;
}

export interface FormLogEntry {
  EventType: string;
  ChangedBy: string;
  EventSummary: string;
  BeforeJSON?: string;
  AfterJSON?: string;
  EventAt: string;
  Title: string;
}

export interface SpChoicesSource {
  list?: string;
  column?: string;
  labelColumn?: string;
  multiSelect?: boolean;
  filter?: string;
  choicesLoaded?: boolean;
}

export interface QuestionTypeDefinition {
  type: string;
  label: string;
  icon: string;
  group: string;
  description: string;
  spColumnKind: number | null;
  defaultProps: Record<string, unknown>;
  variantKey?: string;
}

// ── Logic Rules Types ──────────────────────────────────────────────────────────────

/** Single condition in a logic rule */
export interface LogicCondition {
  field: string;           // Field name to evaluate
  operator: LogicOperator;
  value?: string;        // Static value to compare against
  fieldValue?: string;   // OR another field to compare against
}

export type LogicOperator = 
  | "equals" 
  | "notEquals" 
  | "contains" 
  | "notContains" 
  | "startsWith" 
  | "endsWith" 
  | "isEmpty" 
  | "isNotEmpty" 
  | "greaterThan" 
  | "lessThan" 
  | "greaterOrEqual" 
  | "lessOrEqual" 
  | "between" 
  | "inList" 
  | "notInList";

/** Logical connector for combining conditions */
export type LogicConnector = "AND" | "OR";

/** A complete logic rule with conditions */
export interface LogicRule {
  id: string;
  name?: string;              // Optional rule name for identification
  conditions: LogicCondition[];
  connector: LogicConnector;    // How to combine conditions
  negateResult?: boolean;     // Invert the final result
  
  // Rule type determines what action the rule performs
  ruleType: 
    | "visibility"         // Show/hide field
    | "required"          // Make field required  
    | "enable"            // Enable/disable field
    | "readonly"         // Make field read-only
    | "value";           // Set field value
  
  // For value rules
  setValue?: unknown;        // Value to set when rule triggers
  transform?: "none" | "uppercase" | "lowercase" | "trim" | "capitalize"; // Transform to apply
  
  // For visibility/enable rules - whether to show or hide
  actionWhenTrue?: "show" | "hide" | "enable" | "disable";
  
  // Metadata
  enabled: boolean;
  description?: string;
}

/** Cross-field validation rule */
export interface CrossFieldValidation {
  id: string;
  fieldA: string;
  operator: "equals" | "notEquals" | "greaterThan" | "lessThan" | "greaterOrEqual" | "lessOrEqual" | "before" | "after";
  fieldB: string;
  errorMessage: string;
  enabled: boolean;
}

/** Global form-level rule */
export interface GlobalRule {
  id: string;
  trigger: "onLoad" | "onSubmit" | "onPageChange" | "onFieldChange";
  targetField?: string;
  conditions?: LogicCondition[];
  connector?: LogicConnector;
  action: GlobalRuleAction;
  enabled: boolean;
}

export type GlobalRuleAction = 
  | { type: "setValue"; value: unknown }
  | { type: "clearValue" }
  | { type: "showNotification"; message: string; severity: "info" | "warning" | "error" | "success" }
  | { type: "disableSubmit" }
  | { type: "triggerApi"; url: string; method: "POST" | "GET"; headers?: Record<string, string> }
  | { type: "redirect"; url: string };

/** All logic configurations for a field */
export interface FieldLogic {
  visibilityRules: LogicRule[];
  requiredRules: LogicRule[];
  enableRules: LogicRule[];
  valueRules: LogicRule[];
  crossFieldValidations: CrossFieldValidation[];
}

// ── Part 5: Data, Integration & Submission Types ─────────────────────────────────

/** REST API data source for dropdowns */
export interface DataSourceConfig {
  name: string;                  // Unique identifier for the data source
  url: string;                    // REST API endpoint URL
  labelKey: string;              // Field name for display label
  valueKey: string;              // Field name for value
  groupKey?: string;             // Optional field for option grouping
  method?: "GET" | "POST";       // HTTP method (default: GET)
  headers?: Record<string, string>; // Optional headers
  refreshInterval?: number;      // Auto-refresh interval in ms (0 = disabled)
  debounceMs?: number;           // Debounce for search queries
}

/** Webhook configuration for form events */
export interface WebhookConfig {
  id: string;
  name: string;                  // Friendly name for the webhook
  url: string;                   // Target URL
  method: "POST" | "PATCH";      // HTTP method
  events: WebhookEvent[];        // Trigger events
  payloadTemplate?: string;      // JSON template with {fieldName} tokens
  headers?: Record<string, string>; // Custom headers (e.g., auth)
  enabled: boolean;
  secret?: string;              // Optional signature secret for verification
}

/** Webhook trigger events */
export type WebhookEvent = 
  | "onSubmission"        // New submission created
  | "onApprovalDecision" // Approval status changed
  | "onFormPublished"   // Form published
  | "onFormDraftSaved";  // Draft saved

/** Email notification template */
export interface EmailTemplate {
  id: string;
  name: string;                  // Template name
  event: EmailTriggerEvent;      // When to send
  to: string;                    // Recipient: dynamic {fieldName} or static email
  cc?: string;                   // Optional CC
  bcc?: string;                  // Optional BCC
  subject: string;               // Subject line with {fieldName} tokens
  body: string;                  // HTML body with {fieldName} tokens
  attachPdf?: boolean;           // Attach PDF receipt
  enabled: boolean;
}

/** Email trigger events */
export type EmailTriggerEvent = 
  | "submissionConfirm"   // Send to submitter on successful submission
  | "newSubmissionAlert"  // Send to admins when new submission arrives
  | "approvalRequest"     // Send to approvers when approval needed
  | "approvalComplete"    // Send when approval decision made
  | "rejectionNotice";    // Send to submitter when rejected

/** PDF generation configuration */
export interface PdfConfig {
  enabled: boolean;
  headerLogoUrl?: string;         // URL for logo in header
  title: string;                 // Document title
  fieldDisplayMap?: Record<string, string>; // Field name -> Display label mapping
  footerText?: string;           // Footer text
  showSubmissionDate?: boolean;
  showApproverChain?: boolean;
  showEvaluationDetails?: boolean;
  showSignatures?: boolean;
  showStatusBadge?: boolean;
  includeEmptyEvaluationFields?: boolean;
  density?: "compact" | "comfortable";
  primaryColor?: string;
  secondaryColor?: string;
  deliveryMethod: "download" | "email" | "sharepoint";
  sharepointLibrary?: string;     // Target SharePoint document library name
  sharepointFolder?: string;      // Target folder path
}

/** Calculated submission score */
export interface ScoreConfig {
  enabled: boolean;
  expression: string;            // Formula using {fieldName} tokens, e.g., "{q1} * 0.3 + {q2} * 0.7"
  thresholds: {
    green: number;              // Score >= this = green (approved)
    amber: number;              // Score >= this = amber (review)
    red: number;                // Score < this = red (rejected)
  };
  label: string;                 // Display label, e.g., "Score", "Rating"
  saveToColumn?: string;         // Optional: save raw score to this SP column
}

/** Duplicate submission detection */
export interface DuplicateDetectionConfig {
  enabled: boolean;
  identifyBy: string[];         // Field names to check for duplicates
  action: "block" | "warn" | "overwrite";
  blockMessage?: string;         // Message shown when duplicate blocked
  warnMessage?: string;         // Warning message when duplicate found
}

/** Field-level permissions */
export interface FieldPermission {
  fieldName: string;
  viewRoles: string[];          // AD groups that can view (["All"] = everyone)
  editRoles: string[];          // AD groups that can edit
  readOnlyAfterSubmit: boolean;
  isSensitive: boolean;         // Mark as sensitive for data masking
}

/** Submission quota configuration */
export interface SubmissionQuotaConfig {
  enabled: boolean;
  maxSubmissions: number;       // Max total submissions
  maxPerUser?: number;          // Max per user (if different)
  actionWhenReached: "disable" | "message" | "redirect";
  customMessage?: string;       // Message to show when quota reached
  redirectUrl?: string;         // URL to redirect to when quota reached
}

/** Form integration settings (all Part 5 configs) */
export interface FormIntegrationSettings {
  // Data Sources
  dataSources: DataSourceConfig[];
  
  // Webhooks
  webhooks: WebhookConfig[];
  
  // Email Notifications
  emailTemplates: EmailTemplate[];
  
  // PDF Generation
  pdfConfig: PdfConfig;
  
  // Scoring
  scoreConfig: ScoreConfig;
  
  // Duplicate Detection
  duplicateDetection: DuplicateDetectionConfig;
  
  // Field Permissions
  fieldPermissions: FieldPermission[];
  
  // Submission Quota
  quotaConfig: SubmissionQuotaConfig;
  
  // Power Automate
  powerAutomateTriggerUrl?: string;
}

/** SharePoint column provisioning mapping */
export interface SpColumnMapping {
  fieldName: string;
  fieldType: string;            // SurveyJS type
  spColumnKind: number;         // SP FieldTypeKind
  spColumnName: string;         // Target SP column name
  status: "new" | "existing" | "changed" | "obsolete";
  currentType?: string;         // Current SP type (for changed)
  required: boolean;
}

export interface ReactiveFormConfig {
  [key: string]: {
    value: unknown;
    validators?: ((value: unknown) => Record<string, boolean> | null)[];
  };
}

export interface ReactiveFormResult<T> {
  controls: {
    [K in keyof T]: {
      value: T[K];
      errors: Record<string, boolean>;
      touched: boolean;
      dirty: boolean;
      setValue: (val: T[K]) => void;
      onBlur: () => void;
      setErrors: (errors: Record<string, boolean>) => void;
      clearValidators: () => void;
      setValidators: (validators: ((value: T[K]) => Record<string, boolean> | null)[]) => void;
    };
  };
  valid: boolean;
  value: T;
  errors: Record<string, Record<string, boolean>>;
  touched: boolean;
  dirty: boolean;
  setValue: (values: Partial<T>) => void;
  reset: (values?: T) => void;
  submit: (handler: (values: T) => void) => (e: React.FormEvent) => void;
}

/** Export format options */
export type ExportFormat = "json" | "csv" | "html" | "pdf" | "zip";

/** Export wizard configuration */
export interface ExportConfig {
  format: ExportFormat;
  includeEmailTemplates?: boolean;
  includeWebhookConfig?: boolean;
  includeImages?: boolean;
  pdfBlankForm?: boolean;
}

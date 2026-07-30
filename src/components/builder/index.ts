/**
 * index.ts - Runtime components shared by the dashboard and evaluation flows.
 *
 * The form builder itself lives in pmw-hrform, which is the single place any
 * form is authored. What remains here reads and renders submissions.
 */
export { default as EvaluationSummary } from "./EvaluationSummary";
export { default as ReadOnlySubmissionPreview } from "./ReadOnlySubmissionPreview";

# AGENTS.md — src/utils/

**Scope:** SharePoint REST clients, form builder logic, config loading, auth persistence.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| SP REST client (dashboard) | `sharepointClient.ts` | Factory `createSpClient(instance, accounts)` — CRUD, digest cache, `isGroupMember`, list discovery, `resolveUserEmails` |
| SP REST client (builder) | `formBuilderSP.ts` | **Standalone** — raw `token: string` param, NOT `createSpClient`; ~1470 lines, 43 exports |
| Config loader | `spConfig.ts` | `SP_STATIC` group names, `loadConfig` from Master Form, `filterVisibleLists`, `generateMeta`, `getMissingConfigs`, `legacyToLayerConfig()` migration helper |
| Form logic | `FormBuilderEngine.ts` | Pure functions: 57 question types, validation, survey JSON builder, versioning |
| Status constants | `statusConstants.ts` | `SP_LAYER_STATUS`, `SP_FORM_STATUS`, `normalizeLayerStatus()`, `deriveFormStatus()`, `layerColumn()` helper |
| Custom widget | `DynamicMatrix.tsx` | Custom SurveyJS widget for matrix questions + `rowsToHtml()` matrix↔HTML conversion |
| Auth persistence | `authDecision.ts` | `localStorage` helpers for `pmw_hr_auth_decision` |
| PDPA compliance | `pdpa.ts` | Constants + helper for PDPA retention date, consent label, privacy notice sections |
| Career API client | `careersService.ts` | Frontend fetch wrapper for `/api/jobs-list`, `/api/job-apply`, `/api/job-admin`. ~470 lines. |
| Dashboard backgrounds | `dashboardBackgrounds.ts` | Predefined background gradient/image definitions + CSS variable binding |
| Dashboard background API | `dashboardBackgroundService.ts` | Frontend fetch wrapper for `/api/dashboard-background` |
| PDF generation | `generateFormPdf.ts` | Client-side PDF creation via `@react-pdf/renderer`, uploads to SharePoint, opens in new tab |
| PDF document template | `FormPdfDocument.tsx` | React-PDF document component for form response PDF |
| Job apply PDF | `JobApplyPdfDocument.tsx` | React-PDF document for job application PDF |

## Dual SharePoint Client Pattern
```
Dashboard path:
  App.tsx → createSpClient(msalInstance, accounts) → sharepointClient.ts

Builder path:
  AdminFormBuilder.tsx → raw token (via msalInstance.acquireTokenSilent)
    → formBuilderSP.ts (independent digest cache)
```
- **Intentional separation**: builder uses raw token, dashboard uses MSAL instance
- **Risk**: two digest caches, two SP_SITE_URL reads, inconsistent error handling

## Conventions
- `sharepointClient.ts`: returns `SharePointClient` interface; MSAL-aware
- `spConfig.ts`: `SP_STATIC.adminGroup` is broad HR owner access; `SP_STATIC.formBuilderSuperuserGroup` is the narrower builder-access group.
- `formBuilderSP.ts`: standalone functions; no MSAL dependency
- `FormBuilderEngine.ts`: pure logic, no side effects, no React imports
- **OData**: `odata=nometadata` — responses use `data.value` not `data.d.results`

## SP Column Type Mapping
`FormBuilderEngine.ts` `getSpColumnKind()` and `formBuilderSP.ts` `addColumn()` map SurveyJS types to SharePoint `FieldTypeKind`:
- 2 = Text, 3 = Note, 4 = DateTime, 6 = Choice, 8 = Boolean, 9 = Number, 15 = MultiChoice, 11 = Image
- `dynamicmatrix`/`tableinput` create `_Html` (richText) + `_Json` columns AND a child list `{FormTitle} Matrix {FieldName}` (primary storage). See `ensureMatrixChildList()`.
- `spChoicesSource` fields fetch live choices from SP at publish time and pass them to `addColumn()`
- Formula fields use `_expression` custom property on `type: "text", readOnly: true` — NOT SurveyJS native `expression`
- `ranking` type stores ordered array as JSON string in Note column (kind=3)

## Anti-Patterns
- `formBuilderSP.ts` has `catch (e: any)` and `eslint-disable` — fix types when touching
- `formBuilderSP.ts` has `data.d.results` fallback — legacy format, should be removed
- `console.warn` in `formBuilderSP.ts` — remove or replace with proper logging

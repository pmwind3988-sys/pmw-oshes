# PMW OSHES SharePoint Implementation Plan

This file documents the next phase only. No SharePoint lists, Microsoft Entra apps, permissions, or remote data connections have been created in this project yet.

## Current Local Framework

The web app currently runs with a local adapter in `app.js`:

- `oshesDataAdapter.readForms()`
- `oshesDataAdapter.writeForms(forms)`
- `oshesDataAdapter.getActiveFormId()`
- `oshesDataAdapter.setActiveFormId(formId)`
- `oshesDataAdapter.createSubmission(submission)`

This is the intentional replacement point. For now, it uses browser storage so the prototype can be tested without Microsoft 365 access. In the SharePoint phase, create a SharePoint provider with the same method names and swap it behind this adapter boundary.

Current entry points:

- User portal: `/`
- Admin portal: `/?admin=1`
- Optional admin page deep link: `/?admin=1&page=builder`

There is no visible user/admin switch in the interface. In production, admin access should be protected by Microsoft 365 authentication and an OSHES admin group.

## Recommended Architecture

Use the same general pattern as `pmw-hrform`, but keep OSHES separated by list names, group names, and data contracts.

Recommended production shape:

- Frontend: Vite app using the current PMW OSHES UI as the base.
- Authentication: MSAL browser sign-in with the company tenant.
- Data access: SharePoint REST or Microsoft Graph list APIs through a dedicated `sharepointOshesProvider`.
- Admin guard: Microsoft 365 group membership check for `_OSHES Forms Owners`.
- Local fallback: keep `localOshesProvider` for demo, development, and offline UI testing.

If this stays as a pure static app, SharePoint calls can still work from the browser with MSAL, but a Vite structure is cleaner because dependencies, environment variables, and build steps will match the HR form app more closely.

## Proposed Files For Next Phase

Create these files when SharePoint implementation starts:

- `src/data/oshesDataProvider.ts`
  - Shared TypeScript interface for forms, submissions, and admin actions.
- `src/data/localOshesProvider.ts`
  - Local browser storage implementation for development.
- `src/data/sharepointOshesProvider.ts`
  - SharePoint implementation using MSAL token acquisition and list calls.
- `src/utils/sharepointClient.ts`
  - Reuse or adapt the HR app pattern for token handling, request timeout, digest token if REST POST is used, and list queries.
- `src/utils/oshesSpConfig.ts`
  - OSHES list names, excluded lists, admin group name, and field mapping.
- `src/auth/AdminGuard.tsx`
  - Protects admin routes and prevents user portal access from becoming a soft role switch.
- `src/routes/UserPortal.tsx`
  - User-only forms and submissions.
- `src/routes/AdminPortal.tsx`
  - Admin dashboard, form builder, PDPA review, submissions.

## Environment Variables

Use environment variables instead of hardcoding tenant or site details.

Required:

- `VITE_MSAL_CLIENT_ID`
- `VITE_MSAL_TENANT_ID`
- `VITE_SP_SITE_URL`
- `VITE_OSHES_ADMIN_GROUP`

Optional:

- `VITE_SP_MASTER_FORM_LIST`
- `VITE_SP_SUBMISSION_LOG_LIST`
- `VITE_SP_APPROVAL_LOG_LIST`
- `VITE_SP_ROLE_MATRIX_LIST`
- `VITE_SP_AUDIT_LOG_LIST`
- `VITE_SP_EVIDENCE_LIBRARY`
- `VITE_PDPA_NOTICE_VERSION`

Example:

```env
VITE_MSAL_CLIENT_ID=00000000-0000-0000-0000-000000000000
VITE_MSAL_TENANT_ID=00000000-0000-0000-0000-000000000000
VITE_SP_SITE_URL=https://tenant.sharepoint.com/sites/PMW-OSHES
VITE_OSHES_ADMIN_GROUP=_OSHES Forms Owners
VITE_SP_MASTER_FORM_LIST=OSHES Master Form
VITE_SP_SUBMISSION_LOG_LIST=OSHES Submission Log
VITE_SP_APPROVAL_LOG_LIST=OSHES Approval Log
VITE_SP_ROLE_MATRIX_LIST=OSHES Role Matrix
VITE_SP_AUDIT_LOG_LIST=OSHES Audit Log
VITE_SP_EVIDENCE_LIBRARY=OSHES Evidence Library
VITE_PDPA_NOTICE_VERSION=OSHES-PDPA-v1
```

## SharePoint Site And Groups

Recommended site:

```text
https://tenant.sharepoint.com/sites/PMW-OSHES
```

Create these site groups in the same SharePoint site:

| Group | App role | Purpose |
| --- | --- | --- |
| `_OSHES Members` | User | Submit published forms and read only their own submissions |
| `_OSHES Reviewers` | Approver | Review submissions, update status, and add approval log rows |
| `_OSHES Forms Owners` | Admin | Build forms, publish forms, manage role mapping, and export data |
| `_OSHES Read Only` | Viewer | Read setup/status and audit views without changing data |

Production role resolution should work like this:

1. User signs in with Microsoft 365.
2. App reads SharePoint site group membership for the current user.
3. App reads `OSHES Role Matrix`.
4. App maps the strongest active matching group to a role and capability list.
5. Every route and write action checks that capability, not only the URL.

## Built-In SharePoint System Columns

Use these pre-defined SharePoint columns instead of creating duplicate custom fields:

| App label | SharePoint column | Internal name | Notes |
| --- | --- | --- | --- |
| `CreatedOn` | Created | `Created` | Built-in created timestamp |
| `CreatedBy` | Created By | `Author` | Built-in item creator; use for own-submission filtering |
| `ModifiedOn` | Modified | `Modified` | Built-in last modified timestamp |
| `ModifiedBy` | Modified By | `Editor` | Built-in last editor |
| `ItemId` | ID | `ID` | Built-in list item ID |
| `Version` | Version | `_UIVersionString` | Available when versioning is enabled |

Enable versioning on the form, role matrix, submission, approval, and audit lists before production.

## SharePoint Lists

### 1. OSHES Master Form

Purpose: Stores the form builder configuration and publication metadata. This is equivalent to the HR form app's master configuration concept, but scoped to OSHES.

Recommended columns:

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| Title | Single line text | Yes | Display title of the form |
| FormId | Single line text | Yes | Stable app ID, for example `incident-report` |
| Slug | Single line text | Yes | URL-safe key |
| Category | Choice | Yes | Incident, Observation, Inspection, Permit, Training, Environment |
| Purpose | Multiple lines text | Yes | PDPA purpose statement |
| RiskLevel | Choice | Yes | Low, Medium, High, Critical |
| RetentionYears | Number | Yes | Used to calculate retention date |
| IsPublished | Yes/No | Yes | User portal should only show published forms |
| CurrentVersion | Number | Yes | Increment when the form structure changes |
| PDPAStatement | Multiple lines text | Yes | Notice shown before submit |
| BuilderJSON | Multiple lines text | Yes | Full builder schema from the app |
| VisibilityJSON | Multiple lines text | No | Future conditional logic |
| OwnerEmail | Person or Group | Yes | Form owner |
| LastReviewedAt | Date and time | No | PDPA/admin review date |

### 2. OSHES Role Matrix

Purpose: Maps SharePoint site groups to app capabilities so people are never hardcoded in the frontend.

Recommended columns:

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| Title | Single line text | Yes | Role display name |
| RoleKey | Single line text | Yes | `member`, `reviewer`, `owner`, or `viewer` |
| SharePointGroup | Single line text | Yes | Exact SharePoint site group name |
| CanSubmit | Yes/No | Yes | Can create submissions |
| CanReview | Yes/No | Yes | Can update submission status |
| CanBuildForms | Yes/No | Yes | Can edit builder JSON |
| CanPublishForms | Yes/No | Yes | Can publish forms |
| CanViewAllSubmissions | Yes/No | Yes | Can read all submissions |
| CanManageSettings | Yes/No | Yes | Can update setup and role mapping |
| IsActive | Yes/No | Yes | Disable without deleting history |

Seed rows:

| Title | RoleKey | SharePointGroup | Submit | Review | Build | Publish | View All | Manage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| User | member | `_OSHES Members` | Yes | No | No | No | No | No |
| Approver | reviewer | `_OSHES Reviewers` | No | Yes | No | No | Yes | No |
| Admin | owner | `_OSHES Forms Owners` | Yes | Yes | Yes | Yes | Yes | Yes |
| Viewer | viewer | `_OSHES Read Only` | No | No | No | No | No | No |

### 3. OSHES Submission Log

Purpose: Stores submitted form responses and consent evidence. Keep direct personal data limited to what is necessary.

Recommended columns:

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| Title | Single line text | Yes | Human-readable summary |
| FormId | Single line text | Yes | Links to Master Form |
| FormVersion | Number | Yes | Version used at time of submit |
| SubmittedByName | Single line text or Person | Conditional | Avoid if anonymous observation is allowed |
| SubmittedByEmail | Single line text or Person | Conditional | Avoid if anonymous observation is allowed |
| SubmittedAt | Date and time | Yes | Server-side timestamp preferred |
| Status | Choice | Yes | Submitted, In Review, Action Required, Closed, Archived |
| RiskLevel | Choice | Yes | Copied from form or selected by reviewer |
| PDPAConsent | Yes/No | Yes | Consent captured before submit where required |
| PDPANoticeVersion | Single line text | Yes | Example `OSHES-PDPA-v1` |
| PDPARetentionUntil | Date and time | Yes | Derived from retention policy |
| ResponseJSON | Multiple lines text | Yes | Form answers |
| AttachmentFolderUrl | Hyperlink | No | Evidence library folder for this submission |

### 4. OSHES Approval Log

Purpose: Stores review actions separately from the full submission payload.

Recommended columns:

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| Title | Single line text | Yes | Action summary |
| SubmissionId | Lookup or single line text | Yes | Links to submission |
| Action | Choice | Yes | Review, Assign, Close, Reopen, Reject |
| ActorEmail | Single line text or Person | Yes | Reviewer |
| ActionAt | Date and time | Yes | Timestamp |
| Remarks | Multiple lines text | No | Avoid unnecessary personal data |

### 5. OSHES Audit Log

Purpose: Stores admin publish events, provider errors, and permission decisions for support and accountability.

Recommended columns:

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| Title | Single line text | Yes | Event summary |
| EventType | Choice | Yes | Auth, Permission, Form, Submission, Attachment, Error |
| ActorEmail | Single line text or Person | No | Person who triggered the event |
| Severity | Choice | Yes | Info, Warning, Error |
| ReferenceId | Single line text | No | Related form, submission, or file ID |
| EventJSON | Multiple lines text | No | Technical detail for support |

### 6. OSHES Evidence Library

Purpose: Stores files separately from list rows for better metadata, retention, and file-level permissions.

Recommended document library columns:

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| SubmissionId | Single line text | Yes | Related submission reference |
| FormId | Single line text | Yes | Related form ID |
| AttachmentType | Choice | Yes | Photo, Document, Signature, Other |
| Sensitivity | Choice | Yes | Normal, Personal, Sensitive |
| PDPARetentionUntil | Date and time | Yes | Matches related submission retention |
| UploadedByEmail | Single line text or Person | Yes | Uploader identity |

For OSHES incident evidence, the document library approach is cleaner than list attachments because photos and supporting documents may be sensitive.

## Data Provider Mapping

When SharePoint starts, implement the provider like this:

| Current method | SharePoint behavior |
| --- | --- |
| `readForms()` | Read published/admin-visible rows from `OSHES Master Form`, parse `BuilderJSON` |
| `writeForms(forms)` | Upsert one row per form in `OSHES Master Form` |
| `getActiveFormId()` | Keep local browser state only, no SharePoint needed |
| `setActiveFormId(formId)` | Keep local browser state only, no SharePoint needed |
| `createSubmission(submission)` | Create row in `OSHES Submission Log`, attach files if any, then optionally create first `OSHES Approval Log` row |
| `readSubmissions(filter)` | Read own rows for members or all rows for reviewers/owners from `OSHES Submission Log` |
| `readRoleMatrix()` | Read active rows from `OSHES Role Matrix` |
| `writeAuditEvent(event)` | Create support/audit row in `OSHES Audit Log` |
| `uploadEvidence(file, metadata)` | Upload to `OSHES Evidence Library` and set metadata columns |

Use async method signatures in the production provider:

```ts
export interface OshesDataProvider {
  readForms(): Promise<OshesForm[]>;
  writeForm(form: OshesForm): Promise<void>;
  readRoleMatrix(): Promise<OshesRoleMatrixRow[]>;
  createSubmission(payload: OshesSubmissionPayload): Promise<OshesSubmissionResult>;
  listSubmissions(filter?: OshesSubmissionFilter): Promise<OshesSubmissionSummary[]>;
  updateSubmissionStatus(id: string, status: string, remarks?: string): Promise<void>;
  uploadEvidence(payload: OshesEvidenceUpload): Promise<OshesEvidenceResult>;
  writeAuditEvent(event: OshesAuditEvent): Promise<void>;
}
```

## Authentication And Permissions

1. Register an app in Microsoft Entra ID.
2. Configure redirect URIs for local development and production.
3. Use MSAL for sign-in and token acquisition.
4. Start with delegated permissions that match the HR form app pattern.
5. Ask IT/admin to approve the least privileged permission model that can read/write the selected SharePoint site.
6. Add the OSHES admin users to `_OSHES Forms Owners`.
7. In the app, never trust the URL alone for admin access. The admin URL opens the admin shell, but the group check decides whether admin actions are enabled.

Microsoft documents SharePoint list items as Microsoft Graph `listItem` resources, where column values are handled through `fieldValueSet`. SharePoint REST can also retrieve and create list items through `/_api/web/lists/getbytitle('ListName')/items`. Choose Graph or REST based on whichever matches the HR form code you want to reuse.

## PDPA Guardrails

The app should treat PDPA as a workflow requirement, not just a paragraph of text.

Before publishing a form:

- Define the purpose of collection.
- Tag personal and sensitive fields.
- Require consent if personal data is collected.
- Set retention years.
- Avoid optional personal fields unless the business purpose is clear.
- Confirm who can view submissions.

When submitting a form:

- Show the PDPA notice and purpose before submit.
- Store `PDPAConsent`, `PDPANoticeVersion`, and consent timestamp.
- Store anonymous observation submissions without name/email where allowed.
- Do not keep full submission payloads in browser storage once SharePoint is active.

After submission:

- Restrict submission list permissions to OSHES admins and required reviewers.
- Keep a separate approval log so audit activity does not expose full response data.
- Calculate `PDPARetentionUntil`.
- Add a retention/deletion process for expired records.
- Review breach notification, DPO, and cross-border transfer requirements with the company PDPA owner before production.

Official references to review during implementation:

- Malaysia Personal Data Protection Principles: https://www.pdp.gov.my/ppdpv1/en/principles-of-personal-data-protection/
- Malaysia Personal Data Protection Standard 2015: https://www.pdp.gov.my/ppdpv1/en/personal-data-protection-standard-2015/

## Implementation Steps

1. Confirm the SharePoint site.
   - Decide whether OSHES gets its own site, for example `/sites/PMW-OSHES`, or shares an existing PMW site.
   - If sharing a site, keep list names prefixed with `OSHES`.

2. Confirm the admin group.
   - Recommended group: `_OSHES Forms Owners`.
   - Decide who can build forms, publish forms, review submissions, and export data.

3. Create the SharePoint lists.
   - Create `OSHES Master Form`.
   - Create `OSHES Role Matrix`.
   - Create `OSHES Submission Log`.
   - Create `OSHES Approval Log`.
   - Create `OSHES Audit Log`.
   - Create `OSHES Evidence Library` document library if file uploads will be used.
   - Enable versioning and keep the built-in Created/Created By/Modified/Modified By columns visible for support views.

4. Create the Microsoft Entra app registration.
   - Add local redirect URI, for example `http://localhost:5173`.
   - Add production redirect URI when hosting is known.
   - Configure MSAL client ID and tenant ID.

5. Move this static prototype into the production app structure.
   - Keep the current UI design.
   - Split user and admin into real routes.
   - Preserve `/` for user portal and `/admin` for admin portal if using a router.

6. Implement the provider interface.
   - First move current browser storage logic into `localOshesProvider`.
   - Then create `sharepointOshesProvider`.
   - Keep all UI screens calling the provider interface only.
   - Add visible error handling for missing site, missing list, missing group membership, token failure, permission denied, submission write failure, and attachment upload failure.

7. Implement form loading.
   - User portal loads only `IsPublished = true`.
   - Admin portal loads draft, published, and archived forms.
   - Parse `BuilderJSON` into the existing form model.

8. Implement form saving and publishing.
   - Draft save updates the Master Form row.
   - Publish checks PDPA fields first.
   - Increment `CurrentVersion` when fields change.

9. Implement submission save.
   - Validate required fields.
   - Capture PDPA notice version and consent.
   - Create the SharePoint submission row.
   - Upload attachments if needed.
   - Create an approval log row if workflow starts immediately.

10. Implement admin submission review.
    - List submissions by status and risk.
    - Allow status updates.
    - Write every review action to `OSHES Approval Log`.
    - Do not expose full response data to users without admin rights.

11. Test with a sandbox site.
    - Test user submit.
    - Test anonymous observation.
    - Test incident with attachment.
    - Test admin publish.
    - Test admin group denial.
    - Test PDPA publish guardrails.

12. Prepare production release.
    - Confirm permissions with IT.
    - Confirm PDPA notice with the PDPA owner.
    - Confirm retention schedule.
    - Confirm backup/export needs.
    - Remove local submission storage from production mode.

## Decisions Needed Before Starting SharePoint Work

- Exact SharePoint site URL.
- Whether OSHES should use a dedicated site or shared PMW site.
- Final admin group name.
- Whether to use SharePoint REST like `pmw-hrform` or Microsoft Graph list APIs.
- Whether attachments should be list attachments or a document library.
- Production hosting location.
- Final PDPA notice wording and retention rules.
- Whether submissions need approval workflow, notifications, or Power Automate.

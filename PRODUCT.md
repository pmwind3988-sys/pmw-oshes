# Product

## Register

product

## Users

PMW factory staff, OSHES team members, approvers, read-only viewers, and form owners use this application during operational work. They are submitting safety, permit, maintenance, quality, environment, security, and audit forms, then reviewing status or administering the SharePoint-backed form library.

The portal is organised around **who is looking at it**. Five role views are derived — never stored on the user — from Entra group membership plus the submission set:

| Role | Signal | Sidebar |
|---|---|---|
| Administrator | member of the OSHES Forms Owner group | Today · Submissions · Form catalogue · People & roles · Audit trail |
| Evaluator (Safety Officer) | assignee of an `evaluation` layer | Today · To evaluate · Submissions |
| Approver | assignee of an `approval` layer | My approvals · All records |
| Staff / submitter | neither admin nor an assignee | My submissions · File a form |
| Auditor | member of the OSHES Auditors group | Records · Audit trail |

Someone who is both an evaluator and an approver resolves to `evaluator` — the superset view — and their approval items appear in the same queue. Auditors are read-only by construction: the role never renders an action, and no write path exists for it.

A sixth audience never signs in at all: anyone who scans a QR poster. They get a strictly linear public flow — poster → form → reference — with tracking reachable only by reference.

## Product Purpose

The product is a Microsoft 365-first multi-form platform for PMW factory workflows. It lets users sign in, choose the correct operational form, submit traceable records, and lets administrators build, publish, govern, and map forms to SharePoint lists, libraries, and role groups.

## Brand Personality

Professional, systematic, precise. The interface should feel like a dependable industrial operations workspace: dense enough for daily work, clear enough for field and office users, and consistent with Microsoft 365 expectations.

## Anti-references

Avoid marketing-site composition, oversized decorative heroes, consumer app softness, playful color treatment, and ornamental motion. Avoid hiding operational state behind generic cards when a table, status row, or explicit checklist would be clearer.

## Design Principles

Use task-first density: keep forms, statuses, permissions, and setup details easy to scan without burying them.

Make state move where you can see it: a signature advances the record to the next layer immediately, so the item leaves your queue and the sidebar count drops in front of you.

Measure age on the current layer only: "overdue" is that age against the layer's own SLA, so it is computable per form type rather than from one global constant.

Keep the form set as data: the catalogue, its approval chain, per-layer SLA and public flag live on each form's `LayerConfig`. Nothing downstream hard-codes a form list.

Write the trail from the same code path as the action, never separately.

Preserve role clarity: every admin, approver, viewer, and user action should visibly reflect SharePoint group permissions.

Prefer audit-ready language: copy should name the exact operational object, status, list, role, or control being affected.

Keep privacy visible: PDPA consent, retention, personal-data markers, and local-vs-SharePoint storage state should stay close to the workflow.

Build from existing adapter boundaries: local preview and future SharePoint provider behavior should share the same user-facing concepts.

## Accessibility & Inclusion

Target WCAG AA contrast, keyboard-operable navigation and form controls, readable dense tables, visible focus states, and reduced-motion safe transitions. The interface must remain usable on desktop, tablet, and phone screens.

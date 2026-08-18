# PDPA Implementation Notes

This app includes product-level guardrails for Malaysia PDPA-aware OSHE forms. It is not a substitute for PMW legal review.

## Current controls

- Form purpose is required in the builder context.
- Public submission preview includes a privacy notice summary.
- Explicit PDPA consent can be required before publication.
- Personal and sensitive fields can be tagged at field level.
- Retention period is stored with each form.
- Anonymous safety observation is available as a form-level option.
- Publishing is blocked when a form has personal data fields but consent is disabled.

## Recommended owner review

- Confirm privacy notice text, contact email, and controller details.
- Confirm retention rules for incident, injury, permit, audit, environmental, training, and security records.
- Restrict injury or health-related records to authorised OSHE and management users only.
- Avoid collecting NRIC/passport numbers unless there is a documented and approved purpose.
- Recheck SharePoint permissions before go-live.

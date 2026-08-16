/**
 * A published-shape SurveyJSON that exercises the engine end to end.
 *
 * Served at `/native/demo`, so the renderer can be looked at — and the field
 * types compared against the SurveyJS ones — without a SharePoint tenant, a
 * `vercel dev` process or a real published form. It is written in exactly the
 * shape `buildSurveyJson` emits, including the parts that are easy to get wrong
 * from a type definition alone: `startWithNewLine: false` for side-by-side
 * fields, `_expression` for formulas, `visibleIf` conditions, choices in both
 * the bare-string and `{value, text}` forms, a `matrixdynamic` with mixed cell
 * types, and a top-level question sitting between two panels rather than inside
 * either of them.
 *
 * It is not a fixture — no test asserts against it. It is the sample a person
 * looks at when deciding whether this reads better than what it replaces, so it
 * is modelled on the training requisition the HR team actually uses rather than
 * on "Question 1 / Question 2".
 */

export const DEMO_FORM: Record<string, unknown> = {
  title: "Training Requisition",
  description: "Request approval for internal or external training.",
  pages: [
    {
      name: "page1",
      elements: [
        {
          type: "panel",
          name: "requester",
          title: "Requester",
          description: "Who this request is for. Pre-filled from your profile where possible.",
          elements: [
            {
              type: "text",
              name: "employeeName",
              title: "Full name",
              isRequired: true,
              placeholder: "As it appears on your IC",
            },
            {
              type: "text",
              name: "employeeId",
              title: "Employee ID",
              isRequired: true,
              startWithNewLine: false,
              placeholder: "PMW-0000",
            },
            {
              type: "dropdown",
              name: "department",
              title: "Department",
              isRequired: true,
              choices: [
                "Human Resources",
                "Finance",
                "Engineering",
                "Production",
                "Quality Assurance",
                "Supply Chain",
              ],
            },
            {
              type: "text",
              name: "position",
              title: "Position",
              startWithNewLine: false,
              isRequired: true,
            },
            {
              type: "text",
              name: "email",
              inputType: "email",
              title: "Work email",
              isRequired: true,
              placeholder: "name@pmw.com.my",
            },
            {
              type: "text",
              name: "phone",
              inputType: "tel",
              title: "Contact number",
              startWithNewLine: false,
              placeholder: "01X-XXX XXXX",
            },
          ],
        },
        {
          type: "panel",
          name: "programme",
          title: "Training programme",
          description: "The course itself, and why it is being requested.",
          elements: [
            {
              type: "text",
              name: "courseTitle",
              title: "Course title",
              isRequired: true,
            },
            {
              type: "radiogroup",
              name: "trainingType",
              title: "Type",
              isRequired: true,
              choices: ["Internal", "External", "Online", "On-the-job"],
            },
            {
              type: "dropdown",
              name: "provider",
              title: "Training provider",
              visibleIf: "{trainingType} = 'External' or {trainingType} = 'Online'",
              description: "Shown only for external and online training.",
              choices: [
                { value: "hrdc", text: "HRD Corp registered provider" },
                { value: "vendor", text: "Equipment vendor" },
                { value: "university", text: "University / college" },
                { value: "other", text: "Other provider" },
              ],
              hasOther: true,
            },
            {
              type: "checkbox",
              name: "competencies",
              title: "Competencies addressed",
              description: "Select every area this training develops.",
              colCount: 2,
              choices: [
                "Technical / trade skill",
                "Safety and compliance",
                "Leadership and supervision",
                "Quality systems",
                "Digital tools",
                "Language and communication",
              ],
            },
            {
              type: "comment",
              name: "justification",
              title: "Business justification",
              isRequired: true,
              rows: 4,
              maxLength: 600,
              placeholder: "What problem does this training solve, and what changes once it is done?",
            },
            {
              type: "text",
              name: "startDate",
              inputType: "date",
              title: "Start date",
              isRequired: true,
            },
            {
              type: "text",
              name: "endDate",
              inputType: "date",
              title: "End date",
              startWithNewLine: false,
              isRequired: true,
            },
            {
              type: "rating",
              name: "priority",
              title: "Priority",
              rateMin: 1,
              rateMax: 5,
              minRateDescription: "Can wait a quarter",
              maxRateDescription: "Blocking work now",
            },
            {
              // The labelled counterpart of the scale above, so both shapes a
              // rating can take are on screen at once.
              type: "rating",
              name: "budgetConfidence",
              title: "Confidence in the quoted cost",
              description: "How firm is the figure you are about to enter?",
              rateValues: [
                { value: 1, text: "A rough guess" },
                { value: 2, text: "An estimate" },
                { value: 3, text: "A written quote" },
                { value: 4, text: "A signed quote" },
              ],
            },
          ],
        },
        {
          type: "panel",
          name: "cost",
          title: "Cost breakdown",
          description: "Enter the amounts you are requesting. The total is calculated.",
          elements: [
            {
              type: "text",
              name: "courseFee",
              inputType: "number",
              title: "Course fee",
              prefix: "RM",
              isRequired: true,
            },
            {
              type: "text",
              name: "travelCost",
              inputType: "number",
              title: "Travel",
              prefix: "RM",
              startWithNewLine: false,
            },
            {
              type: "text",
              name: "accommodationCost",
              inputType: "number",
              title: "Accommodation",
              prefix: "RM",
              startWithNewLine: false,
            },
            {
              type: "expression",
              name: "totalCost",
              title: "Total requested",
              _expression: "{courseFee} + {travelCost} + {accommodationCost}",
              displayStyle: "currency",
              currency: "MYR",
              maximumFractionDigits: 2,
              // `displayFormat` is the builder's own property name, and
              // `mapFieldToSurveyJs` derives `displayStyle` from it on publish.
              // Carrying both keeps the sample rendering as currency whether it
              // is read straight off this file or after a trip through the
              // builder, which is what the preview modal does.
              displayFormat: "currency",
            },
            {
              type: "boolean",
              name: "hrdcClaim",
              title: "Claiming against the HRD Corp levy?",
              labelTrue: "Yes",
              labelFalse: "No",
            },
            {
              type: "text",
              name: "hrdcGrantNo",
              title: "HRD Corp grant number",
              visibleIf: "{hrdcClaim} = true",
              placeholder: "Shown once the levy claim is set to Yes",
            },
            {
              type: "matrixdynamic",
              name: "attendees",
              title: "Additional attendees",
              description: "Everyone else attending under this requisition.",
              minRows: 1,
              maxRows: 8,
              addRowText: "Add attendee",
              columns: [
                { name: "name", title: "Name", cellType: "text" },
                { name: "empId", title: "Employee ID", cellType: "text" },
                {
                  name: "dept",
                  title: "Department",
                  cellType: "dropdown",
                  choices: ["Human Resources", "Finance", "Engineering", "Production"],
                },
                { name: "fee", title: "Fee (RM)", cellType: "number" },
              ],
            },
          ],
        },
        {
          // A question at the top level, sitting between two panels. It belongs
          // to neither, and it is drawn where it was written rather than being
          // gathered up with the other loose fields at the top of the form.
          type: "radiogroup",
          name: "urgency",
          title: "How soon is this needed?",
          choices: [
            { value: "urgent", text: "Urgent — within the month" },
            { value: "quarter", text: "This quarter" },
            { value: "cycle", text: "Next training cycle" },
          ],
          isRequired: true,
        },
        {
          type: "panel",
          name: "declaration",
          title: "Declaration",
          elements: [
            {
              type: "ranking",
              name: "outcomes",
              title: "Rank the expected outcomes",
              description: "Most important first.",
              choices: [
                "Reduced downtime",
                "Fewer quality escapes",
                "Faster onboarding",
                "Regulatory compliance",
              ],
            },
            {
              type: "file",
              name: "quotation",
              title: "Supporting quotation",
              description: "PDF or image of the provider's quote.",
              acceptedTypes: ".pdf,image/*",
              maxSize: 10,
              allowMultiple: true,
            },
            {
              type: "signaturepad",
              name: "requesterSignature",
              title: "Requester signature",
              isRequired: true,
            },
          ],
        },
      ],
    },
  ],
};

import { describe, it, expect } from "vitest";
import { buildFormResponseCsv, type ResponseCsvRow } from "./formResponseCsv";
import { parseCsv } from "./csv";

/** Reads a built CSV back into `header -> cell` per row, the way Excel would. */
function readBack(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const [headers, ...rest] = parseCsv(csv);
  return {
    headers,
    rows: rest.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))),
  };
}

const SURVEY = {
  pages: [
    {
      name: "page1",
      title: "Incident",
      elements: [
        { type: "text", name: "StaffName", title: "Staff name" },
        { type: "text", name: "NRIC", title: "IC number" },
        { type: "text", name: "Extension", title: "Extension", inputType: "number" },
        { type: "rating", name: "Severity", title: "Severity", rateMin: 1, rateMax: 5 },
        { type: "text", name: "IncidentOn", title: "Incident date", inputType: "date" },
        { type: "text", name: "NoticedAt", title: "Noticed at", inputType: "datetime-local" },
        { type: "text", name: "ShiftStart", title: "Shift start", inputType: "time" },
        {
          type: "dropdown",
          name: "Site",
          title: "Site",
          choices: [
            { value: "kl", text: "Kuala Lumpur" },
            { value: "jb", text: "Johor Bahru" },
          ],
        },
        { type: "checkbox", name: "Ppe", title: "PPE worn", choices: ["Helmet", "Gloves"] },
        { type: "boolean", name: "Reported", title: "Reported to HOD" },
        { type: "comment", name: "Notes", title: "What happened" },
        { type: "signaturepad", name: "Sign", title: "Reporter signature" },
        {
          type: "dynamicmatrix",
          name: "Items",
          title: "Damaged items",
          columns: [
            { name: "Item", title: "Item", cellType: "text" },
            { name: "Qty", title: "Quantity", cellType: "number" },
            { name: "Bought", title: "Purchased", cellType: "date" },
          ],
        },
      ],
    },
  ],
};

function row(overrides: Partial<ResponseCsvRow> = {}): ResponseCsvRow {
  return {
    record: {
      id: 7,
      reference: "INC-180826-0001",
      form: "Incident Report",
      version: "3",
      submittedBy: "Ali Bakar",
      submitterEmail: "ali@pmw.com",
      submittedAt: "2026-08-12T15:31:00Z",
      status: "Pending",
      currentLayer: 1,
      totalLayers: 2,
    },
    answers: {
      StaffName: "Ali Bakar",
      NRIC: "010203045678",
      Extension: "0123",
      Severity: 4,
      IncidentOn: "2026-08-12",
      NoticedAt: "2026-08-12T23:31",
      ShiftStart: "07:30",
      Site: "kl",
      Ppe: ["Helmet", "Gloves"],
      Reported: true,
      Notes: "Pallet fell from the top rack.",
    },
    surveyJson: SURVEY,
    ...overrides,
  };
}

describe("buildFormResponseCsv", () => {
  it("exports the answers in the form, not only the columns the table showed", () => {
    const { headers, rows } = readBack(buildFormResponseCsv([row()]));

    // The old export stopped at these.
    expect(headers).toContain("ID");
    expect(headers).toContain("Status");
    // The form itself, under the titles its author wrote.
    expect(headers).toEqual(
      expect.arrayContaining(["Staff name", "IC number", "Site", "PPE worn", "Reported to HOD", "What happened"]),
    );
    expect(rows[0]["Staff name"]).toBe("Ali Bakar");
    expect(rows[0]["What happened"]).toBe("Pallet fell from the top rack.");
  });

  it("keeps the questions in the order they were asked", () => {
    const { headers } = readBack(buildFormResponseCsv([row()]));
    const order = ["Staff name", "IC number", "Extension", "Severity", "Incident date"].map((header) => headers.indexOf(header));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("stamps every instant in Malaysian time and says so in the header", () => {
    const { headers, rows } = readBack(buildFormResponseCsv([row()]));
    expect(headers).toContain("Submitted At (MYT)");
    expect(rows[0]["Submitted At (MYT)"]).toBe("12/08/2026 11:31 PM");
  });

  it("leaves a typed date and time as they were entered", () => {
    const { rows } = readBack(buildFormResponseCsv([row()]));
    expect(rows[0]["Incident date"]).toBe("12/08/2026");
    expect(rows[0]["Noticed at"]).toBe("12/08/2026 11:31 PM");
    expect(rows[0]["Shift start"]).toBe("07:30 AM");
  });

  it("emits a numeric answer as a number and an identifier as text", () => {
    const csv = buildFormResponseCsv([row()]);
    const { headers, rows } = readBack(csv);

    // Bare in the file, so the column can be summed.
    expect(csv.split("\r\n")[1].split(",")[headers.indexOf("Severity")]).toBe("4");
    expect(rows[0].Severity).toBe("4");

    // Quoted, because an IC that loses its leading zero is a wrong answer.
    expect(csv).toContain('"010203045678"');
    expect(rows[0]["IC number"]).toBe("010203045678");
    expect(rows[0].Extension).toBe("0123");
  });

  it("resolves a choice to its label and joins a multi-select", () => {
    const { rows } = readBack(buildFormResponseCsv([row()]));
    expect(rows[0].Site).toBe("Kuala Lumpur");
    expect(rows[0]["PPE worn"]).toBe("Helmet, Gloves");
    expect(rows[0]["Reported to HOD"]).toBe("Yes");
  });

  it("flattens a matrix into readable rows instead of dropping it", () => {
    const { rows } = readBack(
      buildFormResponseCsv([
        row({
          matrixRows: {
            Items: [
              { Item: "Pallet", Qty: 2, Bought: "2025-01-09T00:00:00Z" },
              { Item: "Rack beam", Qty: 1 },
            ],
          },
        }),
      ]),
    );

    expect(rows[0]["Damaged items"]).toBe(
      ["1. Item: Pallet | Quantity: 2 | Purchased: 09/01/2025", "2. Item: Rack beam | Quantity: 1"].join("\n"),
    );
  });

  it("reads the rich-text copy of a matrix when there are no child rows", () => {
    const { rows } = readBack(
      buildFormResponseCsv([
        row({
          answers: {
            ...row().answers,
            Items_Html: "<table><tr><th>Item</th><th>Qty</th></tr><tr><td>Pallet &amp; skid</td><td>2</td></tr></table>",
          },
        }),
      ]),
    );

    expect(rows[0]["Damaged items"]).toBe("Item | Qty\nPallet & skid | 2");
  });

  it("says how many matrix rows outgrew the cell instead of stopping mid-row", () => {
    const many = Array.from({ length: 900 }, (_, index) => ({
      Item: `Pallet ${index} of a long inventory line`,
      Qty: index,
      Bought: "2025-01-09",
    }));
    const { rows } = readBack(buildFormResponseCsv([row({ matrixRows: { Items: many } })]));
    const cell = rows[0]["Damaged items"];

    expect(cell.length).toBeLessThanOrEqual(32_767);
    expect(cell).toContain("1. Item: Pallet 0 of a long inventory line");
    expect(cell).toMatch(/\[\d+ more rows not exported: one spreadsheet cell holds 32,767 characters — see the PDF\]$/);
    // Cut between rows, never inside one.
    expect(cell.split("\n").at(-2)).toMatch(/^\d+\. Item: /);
  });

  it("reads a rich-text answer as its text, not its markup", () => {
    const { rows } = readBack(
      buildFormResponseCsv([
        row({ answers: { ...row().answers, Notes: "<p>Pallet fell from the <strong>top</strong> rack.</p>" } }),
      ]),
    );
    expect(rows[0]["What happened"]).toBe("Pallet fell from the top rack.");
  });

  it("leaves an answer that only looks like markup alone", () => {
    const { rows } = readBack(
      buildFormResponseCsv([row({ answers: { ...row().answers, Notes: "Load must stay <30kg per pallet" } })]),
    );
    expect(rows[0]["What happened"]).toBe("Load must stay <30kg per pallet");
  });
});

describe("buildFormResponseCsv approval trail", () => {
  const layered = row({
    layers: [
      {
        layerNumber: 1,
        type: "approval",
        label: "HOD Review",
        status: "Approved",
        actedBy: "hod@pmw.com",
        decidedAt: "2026-08-13T01:05:00Z",
        signature: "data:image/png;base64,AAAA",
      },
      {
        layerNumber: 2,
        type: "approval",
        label: "Safety Officer",
        status: "Rejected",
        actedBy: "safety@pmw.com",
        decidedAt: "2026-08-14T02:00:00Z",
        remarks: "Photos missing",
      },
    ],
  });

  it("gives every layer its own dated columns", () => {
    const { headers, rows } = readBack(buildFormResponseCsv([layered]));

    expect(headers).toEqual(
      expect.arrayContaining([
        "L1 Layer",
        "L1 Status",
        "L1 Decided By",
        "L1 Decided At (MYT)",
        "L1 Signature",
        "L2 Status",
        "L2 Decided At (MYT)",
        "L2 Remarks",
      ]),
    );
    expect(rows[0]["L1 Layer"]).toBe("HOD Review (approval)");
    expect(rows[0]["L1 Decided At (MYT)"]).toBe("13/08/2026 09:05 AM");
    expect(rows[0]["L2 Decided At (MYT)"]).toBe("14/08/2026 10:00 AM");
    expect(rows[0]["L2 Remarks"]).toBe("Photos missing");
  });

  it("keeps the layer blocks in order and to the right of the answers", () => {
    const { headers } = readBack(buildFormResponseCsv([layered]));
    expect(headers.indexOf("Staff name")).toBeLessThan(headers.indexOf("L1 Status"));
    expect(headers.indexOf("L1 Status")).toBeLessThan(headers.indexOf("L2 Status"));
  });

  it("summarises the whole chain in one cell, a line per layer", () => {
    const { rows } = readBack(buildFormResponseCsv([layered]));
    expect(rows[0]["Approval History"]).toBe(
      [
        "L1 HOD Review (approval) — Approved — hod@pmw.com — 13/08/2026 09:05 AM MYT",
        'L2 Safety Officer (approval) — Rejected — safety@pmw.com — 14/08/2026 10:00 AM MYT — "Photos missing"',
      ].join("\n"),
    );
  });

  it("names a layer nobody has acted on rather than leaving the line blank", () => {
    const { rows } = readBack(
      buildFormResponseCsv([row({ layers: [{ layerNumber: 1, type: "approval", status: "" }] })]),
    );
    expect(rows[0]["Approval History"]).toBe("L1 Approval — No decision recorded");
  });

  it("puts an evaluation layer's answers beside that layer's columns", () => {
    const { headers, rows } = readBack(
      buildFormResponseCsv([
        row({
          layers: [
            { layerNumber: 1, type: "approval", status: "Approved", actedBy: "hod@pmw.com" },
            {
              layerNumber: 2,
              type: "evaluation",
              label: "Three-month review",
              status: "Confirmed",
              actedBy: "hr@pmw.com",
              decidedAt: "2026-11-12T02:00:00Z",
              evaluationFields: { Outcome: "improved", Score: 8 },
              evaluationSchema: [
                { type: "dropdown", name: "Outcome", title: "Outcome", choices: [{ value: "improved", text: "Improved" }] },
                { type: "rating", name: "Score", title: "Score out of ten" },
              ],
            },
          ],
        }),
      ]),
    );

    expect(rows[0]["L2 Outcome"]).toBe("Improved");
    expect(rows[0]["L2 Score out of ten"]).toBe("8");
    expect(headers.indexOf("L2 Signature")).toBeLessThan(headers.indexOf("L2 Outcome"));
    expect(headers.indexOf("L1 Status")).toBeLessThan(headers.indexOf("L2 Outcome"));
  });
});

describe("buildFormResponseCsv pictures", () => {
  it("carries a signature as its base64 source", () => {
    const { rows } = readBack(
      buildFormResponseCsv([row({ answers: { ...row().answers, Sign: "data:image/png;base64,iVBORw0KGgo=" } })]),
    );
    expect(rows[0]["Reporter signature"]).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("turns a stored image into a link that opens from a downloaded file", () => {
    const { rows } = readBack(
      buildFormResponseCsv([row({ answers: { ...row().answers, Sign: "/sites/OSHES/Signature Images/7.png" } })], {
        siteUrl: "https://pmw.sharepoint.com/sites/OSHES",
      }),
    );
    expect(rows[0]["Reporter signature"]).toBe("https://pmw.sharepoint.com/sites/OSHES/Signature Images/7.png");
  });

  it("says why an oversized image is not in the cell rather than truncating it", () => {
    const huge = `data:image/png;base64,${"A".repeat(40_000)}`;
    const { rows } = readBack(buildFormResponseCsv([row({ answers: { ...row().answers, Sign: huge } })]));
    expect(rows[0]["Reporter signature"]).toMatch(/^\[image not exported: \d+ KB of base64 exceeds one spreadsheet cell/);
    expect(rows[0]["Reporter signature"]).toContain("see the PDF");
  });
});

describe("buildFormResponseCsv sheet shape", () => {
  it("unions the questions of two form versions without splitting the layout", () => {
    const older = row({
      record: { ...row().record, id: 6, version: "2" },
      answers: { StaffName: "Siti", Department: "Safety" },
      surveyJson: {
        pages: [{ name: "page1", elements: [{ type: "text", name: "StaffName", title: "Staff name" }, { type: "text", name: "Department", title: "Department" }] }],
      },
      layers: [{ layerNumber: 1, type: "approval", status: "Approved", actedBy: "hod@pmw.com" }],
    });
    const { headers, rows } = readBack(buildFormResponseCsv([row(), older]));

    expect(headers).toContain("Department");
    // A question only the older version asked still sits with the answers,
    // ahead of the approval block, rather than being appended after it.
    expect(headers.indexOf("Department")).toBeLessThan(headers.indexOf("L1 Status"));
    expect(rows[0].Department).toBe("");
    expect(rows[1].Department).toBe("Safety");
  });

  it("leaves out a column no response filled, and keeps the identifying ones", () => {
    const { headers } = readBack(buildFormResponseCsv([row({ record: { id: 7, submittedAt: "", status: "" } })]));
    expect(headers).not.toContain("Company");
    expect(headers).not.toContain("Signed PDF");
    expect(headers).toEqual(expect.arrayContaining(["ID", "Submitted At (MYT)", "Status"]));
  });

  it("disambiguates two questions that share a title", () => {
    const { headers } = readBack(
      buildFormResponseCsv([
        row({
          answers: { Start: "2026-08-12", End: "2026-08-13" },
          surveyJson: {
            pages: [
              {
                name: "page1",
                elements: [
                  { type: "text", name: "Start", title: "Date", inputType: "date" },
                  { type: "text", name: "End", title: "Date", inputType: "date" },
                ],
              },
            ],
          },
        }),
      ]),
    );
    expect(headers).toContain("Date");
    expect(headers).toContain("Date (answer:End)");
  });

  it("names a column after the SharePoint key when no schema survives", () => {
    const { headers, rows } = readBack(
      buildFormResponseCsv([row({ surveyJson: null, answers: { Staff_x0020_Name: "Ali Bakar" } })]),
    );
    expect(headers).toContain("Staff Name");
    expect(rows[0]["Staff Name"]).toBe("Ali Bakar");
  });

  it("writes a header row even when there is nothing to export", () => {
    expect(buildFormResponseCsv([])).toBe('"ID","Submitted At (MYT)","Status"');
  });

  it("stops Excel executing an answer somebody typed as a formula", () => {
    const { rows } = readBack(
      buildFormResponseCsv([row({ answers: { ...row().answers, Notes: '=HYPERLINK("http://evil","click")' } })]),
    );
    expect(rows[0]["What happened"]).toBe('\'=HYPERLINK("http://evil","click")');
  });

  it("leaves a phone number written with a plus alone", () => {
    const { rows } = readBack(buildFormResponseCsv([row({ answers: { ...row().answers, Notes: "+60 12-345 6789" } })]));
    expect(rows[0]["What happened"]).toBe("+60 12-345 6789");
  });
});

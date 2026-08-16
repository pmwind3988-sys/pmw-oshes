/**
 * matrixData.ts — the shape of a dynamic-matrix answer, and what to do with it.
 *
 * These lived in `DynamicMatrix.tsx`, alongside a SurveyJS question type that
 * pulled a 1.4 MB renderer into every page that wanted to read a matrix answer.
 * The question type is gone and SurveyJS is uninstalled; this is the part that
 * was actually being used.
 *
 * `columns` still describes a matrix the way published SurveyJSON does, because
 * that is the stored format — but nothing here executes any of it.
 *
 * Pure: no React, no network.
 */

export interface MatrixColumn {
  name: string;
  title: string;
  cellType?: string;
  choices?: string[];
  multiSelect?: boolean;
  choicesSource?: { list?: string; column?: string };
  filteredListSource?: { list?: string; valueColumn?: string; filterColumn?: string; filterValue?: string; choicesLoaded?: boolean };
}

export interface MatrixRow {
  [key: string]: unknown;
}

export interface DynamicMatrixFieldMeta {
  name: string;
  columns: MatrixColumn[];
  title?: string;
}

export function getDynamicMatrixFields(surveyJson: unknown): DynamicMatrixFieldMeta[] {
  const result: DynamicMatrixFieldMeta[] = [];
  try {
    const def = surveyJson as Record<string, unknown>;
    // Handle { surveyJson: {...}, layerConfig: ... } wrapper
    const inner = (def.pages ? def : def.surveyJson) as Record<string, unknown> | undefined;
    const pages = (inner as { pages?: unknown[] } | undefined)?.pages as { elements?: unknown[] }[] | undefined;
    if (!pages) return result;

    const walk = (elements: unknown[]) => {
      for (const el of elements) {
        const elem = el as Record<string, unknown>;
        if ((elem.type === "dynamicmatrix" || elem.type === "matrixdynamic") && elem.name) {
          const cols = (elem.columns as MatrixColumn[]) || [];
          if (cols.length > 0) {
            result.push({ name: String(elem.name), columns: cols, title: elem.title as string | undefined });
          }
        }
        if (elem.elements) {
          walk(elem.elements as unknown[]);
        }
      }
    };

    for (const page of pages) {
      if (page.elements) walk(page.elements);
    }
  } catch {
    // Return empty on parse issues
  }
  return result;
}

// ── Convert row data → HTML table string (for SP rich-text column) ──
export function rowsToHtml(columns: MatrixColumn[], rows: MatrixRow[]): string {
  const headers = columns
    .map((c) => `<th style="border:1px solid #c4b5fd;padding:6px 10px;background:#ede9fe;font-size:11px;font-weight:600;color:#5b21b6;text-align:left">${c.title}</th>`)
    .join("");
  const bodyRows = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const val = row[c.name];
          const display = Array.isArray(val) ? val.join(", ") : (val ?? "");
          return `<td style="border:1px solid #e5e3f0;padding:6px 10px;font-size:12px;color:#1e1b4b">${display}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-family:Inter,'Segoe UI','Aptos','Helvetica Neue',Arial,sans-serif"><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

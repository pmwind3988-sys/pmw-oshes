import type { ChangeEvent } from "react";
import { ElementFactory, Question, Serializer } from "survey-core";
import { ReactQuestionFactory } from "survey-react-ui";
import { useState, useCallback, useEffect, useRef } from "react";

const C = {
  purple: "#5B21B6",
  purpleLight: "#7C3AED",
  purplePale: "#EDE9FE",
  purpleMid: "#DDD6FE",
  white: "#FFFFFF",
  offWhite: "#F8F7FF",
  border: "#E5E3F0",
  textPrimary: "#1E1B4B",
  textSecond: "#6B7280",
  textMuted: "#9CA3AF",
  red: "#DC2626",
  redPale: "#FEE2E2",
  green: "#059669",
  greenPale: "#D1FAE5",
} as const;

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

// Module-level store — surveyJson keyed by question name
const _questionDataRegistry = new Map<string, unknown>();

export function registerQuestionData(surveyJson: unknown): void {
  const json = surveyJson as { pages?: { elements?: unknown[] }[] } | undefined;
  const elements = (json?.pages ?? []).flatMap((p) => (p.elements ?? []) as Record<string, unknown>[]);
  for (const el of elements) {
    if (el.type === "dynamicmatrix" && el.name) {
      _questionDataRegistry.set(String(el.name), el);
    }
  }
}

export function getQuestionData(name: string): unknown | null {
  return _questionDataRegistry.get(name) ?? null;
}

// ── Walk survey JSON to discover all dynamicmatrix fields with their column definitions ──
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

// ── Cell renderer (single cell in a row) ──
function Cell({
  col,
  value,
  onChange,
  readOnly,
}: {
  col: MatrixColumn;
  value: unknown;
  onChange: (val: unknown) => void;
  readOnly: boolean;
}) {
  const base: React.CSSProperties = {
    width: "100%",
    border: "none",
    background: "transparent",
    fontSize: 12,
    fontFamily: "'DM Sans', sans-serif",
    color: C.textPrimary,
    outline: "none",
    padding: "0 4px",
  };

  if (readOnly) {
    const display = Array.isArray(value) ? value.join(", ") : (value ?? "");
    return <span style={{ fontSize: 12, color: C.textPrimary }}>{String(display)}</span>;
  }

  if (col.cellType === "dropdown" && col.multiSelect) {
    const values = Array.isArray(value) ? (value as string[]) : [];
    return (
      <select
        multiple
        value={values}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
          const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
          onChange(selected);
        }}
        style={{ ...base, cursor: "pointer", minHeight: 28 }}
      >
        {(col.choices || []).map((ch) => (
          <option key={ch} value={ch}>
            {ch}
          </option>
        ))}
      </select>
    );
  }

  if (col.cellType === "dropdown") {
    return (
      <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} style={{ ...base, cursor: "pointer" }}>
        <option value="">—</option>
        {(col.choices || []).map((ch) => (
          <option key={ch} value={ch}>
            {ch}
          </option>
        ))}
      </select>
    );
  }

  if (col.cellType === "date") {
    return <input type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} style={base} />;
  }

  if (col.cellType === "number") {
    return <input type="number" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} step="any" style={base} />;
  }

  if (col.cellType === "checkbox" && col.choices) {
    const values = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {(col.choices || []).map((ch) => (
          <label key={ch} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={values.includes(ch)}
              onChange={(e) => {
                const next = e.target.checked ? [...values, ch] : values.filter((v) => v !== ch);
                onChange(next);
              }}
              style={{ accentColor: C.purple }}
            />
            {ch}
          </label>
        ))}
      </div>
    );
  }

  if (col.cellType === "checkbox" || col.cellType === "boolean") {
    return (
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, cursor: "pointer", accentColor: C.purple }}
      />
    );
  }

  // Default: text
  return <input type="text" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} style={base} />;
}

// ── DynamicMatrixInput — the respondent-facing interactive table ──
export function DynamicMatrixInput({
  columns = [],
  minRows = 1,
  maxRows = 20,
  addRowText = "Add Row",
  value,
  onChange,
  readOnly,
}: {
  columns: MatrixColumn[];
  minRows?: number;
  maxRows?: number;
  addRowText?: string;
  value?: { rows?: MatrixRow[] };
  onChange?: (val: { rows: MatrixRow[]; html: string; json: string }) => void;
  readOnly?: boolean;
}) {
  const makeRow = useCallback(
    () => Object.fromEntries((columns || []).map((c) => [c.name, ""])),
    [columns]
  );

  const [rows, setRows] = useState<MatrixRow[]>(() => {
    if (value?.rows?.length) return value.rows;
    const count = Math.max(minRows, 1);
    return Array.from({ length: count }, () =>
      Object.fromEntries((columns || []).map((c) => [c.name, ""]))
    );
  });

  // Reset rows when columns change (e.g. after hydration)
  const prevColKey = useRef("");
  useEffect(() => {
    const key = (columns || []).map((c) => c.name).join(",");
    if (key && key !== prevColKey.current) {
      prevColKey.current = key;
      setRows((prev) => {
        const count = Math.max(prev.length, minRows);
        return Array.from({ length: count }, (_, i) =>
          Object.fromEntries((columns || []).map((c) => [c.name, (prev[i] as MatrixRow)?.[c.name] ?? ""]))
        );
      });
    }
  }, [columns, minRows]);

  const push = (newRows: MatrixRow[]) => {
    setRows(newRows);
    if (columns.length > 0) {
      const html = rowsToHtml(columns, newRows);
      onChange?.({ rows: newRows, html, json: JSON.stringify(newRows) });
    }
  };

  const addRow = () => {
    if (rows.length >= maxRows) return;
    push([...rows, makeRow()]);
  };

  const removeRow = (i: number) => {
    if (rows.length <= minRows) return;
    push(rows.filter((_, idx) => idx !== i));
  };

  const updateCell = (rowIdx: number, colName: string, val: unknown) => {
    push(rows.map((r, i) => (i === rowIdx ? { ...r, [colName]: val } : r)));
  };

  if (!columns || columns.length === 0) {
    return (
      <div style={{ padding: "12px 16px", border: `1px dashed ${C.border}`, borderRadius: 8, color: C.textMuted, fontSize: 12 }}>
        No columns defined. Add columns in the Options tab.
      </div>
    );
  }

  const colWidth = `${Math.floor(100 / (columns.length + (readOnly ? 0 : 1)))}%`;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: columns.length * 120 }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.name}
                style={{
                  padding: "8px 10px",
                  background: C.purplePale,
                  border: `1px solid ${C.purpleMid}`,
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.purple,
                  textAlign: "left",
                  width: colWidth,
                  whiteSpace: "nowrap",
                }}
              >
                {col.title || col.name}
                {col.cellType && col.cellType !== "text" && (
                  <span style={{ marginLeft: 4, fontSize: 9, color: C.textMuted, textTransform: "uppercase" }}>({col.cellType})</span>
                )}
              </th>
            ))}
            {!readOnly && <th style={{ width: 36, background: C.purplePale, border: `1px solid ${C.purpleMid}` }} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? C.white : C.offWhite }}>
              {columns.map((col) => (
                <td
                  key={col.name}
                  style={{
                    border: `1px solid ${C.border}`,
                    padding: "6px 8px",
                    verticalAlign: "middle",
                  }}
                >
                  <Cell col={col} value={row[col.name]} onChange={(val) => updateCell(rIdx, col.name, val)} readOnly={!!readOnly} />
                </td>
              ))}
              {!readOnly && (
                <td style={{ border: `1px solid ${C.border}`, padding: 4, textAlign: "center", verticalAlign: "middle" }}>
                  <button
                    onClick={() => removeRow(rIdx)}
                    disabled={rows.length <= minRows}
                    style={{
                      width: 22,
                      height: 22,
                      border: "none",
                      borderRadius: 5,
                      background: rows.length <= minRows ? C.border : C.redPale,
                      color: rows.length <= minRows ? C.textMuted : C.red,
                      cursor: rows.length <= minRows ? "not-allowed" : "pointer",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✕
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {!readOnly && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <button
            onClick={addRow}
            disabled={rows.length >= maxRows}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              border: `1px dashed ${rows.length >= maxRows ? C.border : C.purple}`,
              borderRadius: 8,
              background: "none",
              color: rows.length >= maxRows ? C.textMuted : C.purple,
              fontSize: 12,
              cursor: rows.length >= maxRows ? "not-allowed" : "pointer",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
            }}
          >
            <span>＋</span> {addRowText}
          </button>
          <span style={{ fontSize: 10, color: C.textMuted }}>
            {rows.length} / {maxRows} rows
          </span>
        </div>
      )}
    </div>
  );
}

// ── SurveyJS custom question registration ──
let _registered = false;

export function registerDynamicMatrix(): void {
  if (_registered) return;
  _registered = true;

  class QuestionDynamicMatrixModel extends Question {
    getType() {
      return "dynamicmatrix";
    }
    get columns() {
      return (this.getPropertyValue("columns") as MatrixColumn[]) ?? [];
    }
    set columns(v: MatrixColumn[]) {
      this.setPropertyValue("columns", v);
    }
    get minRows() {
      return (this.getPropertyValue("minRows") as number) ?? 1;
    }
    set minRows(v: number) {
      this.setPropertyValue("minRows", v);
    }
    get maxRows() {
      return (this.getPropertyValue("maxRows") as number) ?? 20;
    }
    set maxRows(v: number) {
      this.setPropertyValue("maxRows", v);
    }
    get addRowText() {
      return (this.getPropertyValue("addRowText") as string) ?? "Add Row";
    }
    set addRowText(v: string) {
      this.setPropertyValue("addRowText", v);
    }
  }

  Serializer.addClass(
    "dynamicmatrix",
    [
      { name: "columns", default: [] },
      { name: "minRows:number", default: 1 },
      { name: "maxRows:number", default: 20 },
      { name: "addRowText", default: "Add Row" },
    ],
    () => new QuestionDynamicMatrixModel(""),
    "question"
  );

  ElementFactory.Instance.registerElement("dynamicmatrix", (name) => new QuestionDynamicMatrixModel(name));

  // The survey-react-ui typings incorrectly declare registerQuestion as (name: string) => Element,
  // but the actual runtime passes props { question: Question }. We cast through an interface that
  // matches the real signature to preserve type safety.
  interface ReactQuestionFactoryFixed {
    registerQuestion(questionType: string, questionCreator: (props: { question: QuestionDynamicMatrixModel }) => React.JSX.Element): void;
  }

  function DynamicMatrixQuestion({ question }: { question: QuestionDynamicMatrixModel }) {
    const [cols, setCols] = useState<MatrixColumn[]>([]);
    const [minRows, setMinRows] = useState(1);
    const [maxRows, setMaxRows] = useState(20);
    const [addRowText, setAddRowText] = useState("Add Row");

    useEffect(() => {
      const raw = getQuestionData(question.name) as { columns?: MatrixColumn[]; minRows?: number; maxRows?: number; addRowText?: string } | null;
      const resolvedColumns = raw?.columns ?? (question.getPropertyValue("columns") as MatrixColumn[]) ?? [];
      setCols(resolvedColumns);
      setMinRows(raw?.minRows ?? (question.getPropertyValue("minRows") as number) ?? 1);
      setMaxRows(raw?.maxRows ?? (question.getPropertyValue("maxRows") as number) ?? 20);
      setAddRowText(raw?.addRowText ?? (question.getPropertyValue("addRowText") as string) ?? "Add Row");
    }, [question.name]);

    return (
      <DynamicMatrixInput
        key={cols.map((c) => c.name).join(",")}
        columns={cols}
        minRows={minRows}
        maxRows={maxRows}
        addRowText={addRowText}
        value={question.value as { rows?: MatrixRow[] } | undefined}
        onChange={(val) => {
          question.value = val;
        }}
        readOnly={question.isReadOnly}
      />
    );
  }

  (ReactQuestionFactory.Instance as unknown as ReactQuestionFactoryFixed).registerQuestion("dynamicmatrix", (props) => {
    return <DynamicMatrixQuestion question={props.question} />;
  });
}

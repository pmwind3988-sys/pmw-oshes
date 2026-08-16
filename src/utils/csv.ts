/**
 * csv.ts — shared CSV emitting and parsing for admin import/export.
 *
 * Quoting follows RFC 4180: every cell is quoted and embedded quotes are
 * doubled. Writing `"${value}"` without that doubling silently corrupts any row
 * containing a quote character, which is what ResponseViewer used to do.
 */

/** Byte-order mark. Built from its code point so the source stays plain ASCII. */
const UTF8_BOM = String.fromCharCode(0xfeff);

/** Quotes one cell, doubling embedded quotes. Objects are JSON, blanks empty. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** Joins one row of raw values into a CSV line. */
export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

/**
 * Reads a CSV file into rows of cells.
 *
 * Hand-written rather than split-on-comma because the files this reads come out
 * of Excel, where a department called "Safety, Health & Environment" is one
 * cell, a pasted job title can contain a line break, and a doubled `""` is one
 * literal quote. Splitting on commas turns all three into silently wrong data.
 *
 * Tolerates CRLF, a leading byte-order mark, and a missing final newline.
 * Blank lines are dropped, so a trailing newline does not produce an empty row.
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    // A line of nothing but empty cells carries no data; keeping it would show
    // up in an import preview as a row of errors the file never actually had.
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (source[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      endCell();
    } else if (char === "\n") {
      endRow();
    } else if (char !== "\r") {
      cell += char;
    }
  }

  // Whatever is left after the last newline is the final row, unless the file
  // ended on one.
  if (cell !== "" || row.length > 0) endRow();

  return rows;
}

/**
 * Downloads `csv` as a file. The BOM is what makes Excel read it as UTF-8
 * rather than the local ANSI code page, so accented names survive the trip.
 */
export function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob([`${UTF8_BOM}${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

import { describe, it, expect } from "vitest";
import { csvCell, csvRow, parseCsv } from "../csv";

describe("csvCell", () => {
  it("quotes plain values", () => {
    expect(csvCell("Ali")).toBe('"Ali"');
    expect(csvCell(42)).toBe('"42"');
  });

  it("doubles embedded quotes so the row does not break", () => {
    // The bug this replaces emitted `"He said "yes""`, which any parser reads
    // as three malformed fields.
    expect(csvCell('He said "yes"')).toBe('"He said ""yes"""');
  });

  it("keeps commas and newlines inside one field", () => {
    expect(csvCell("Engineering, Safety")).toBe('"Engineering, Safety"');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("emits nothing for blanks rather than the string 'undefined'", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("serialises objects instead of yielding [object Object]", () => {
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it("preserves a leading zero that Excel would otherwise eat", () => {
    expect(csvCell("007")).toBe('"007"');
  });
});

describe("csvRow", () => {
  it("joins cells with commas", () => {
    expect(csvRow(["a", "b"])).toBe('"a","b"');
  });

  it("keeps column count stable when a value contains a comma", () => {
    const row = csvRow(["Ali", "Engineering, Safety", null]);
    expect(row).toBe('"Ali","Engineering, Safety",');
    // Three fields, two separators outside quotes.
    expect(row.split('","').length).toBe(2);
  });
});

describe("parseCsv", () => {
  it("reads a plain file", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("keeps a quoted comma inside one cell", () => {
    expect(parseCsv('name,dept\nAli,"Safety, Health"')).toEqual([
      ["name", "dept"],
      ["Ali", "Safety, Health"],
    ]);
  });

  it("reads a doubled quote as one literal quote", () => {
    expect(parseCsv('a\n"He said ""yes"""')).toEqual([["a"], ['He said "yes"']]);
  });

  it("keeps a newline inside a quoted cell", () => {
    expect(parseCsv('a,b\n"line one\nline two",x')).toEqual([
      ["a", "b"],
      ["line one\nline two", "x"],
    ]);
  });

  it("handles Windows line endings, which is what Excel writes", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("drops the byte-order mark rather than gluing it to the first header", () => {
    const withBom = `${String.fromCharCode(0xfeff)}PersonEmail,Name\na@b.com,Ali`;
    expect(parseCsv(withBom)[0][0]).toBe("PersonEmail");
  });

  it("keeps the last row when the file does not end in a newline", () => {
    expect(parseCsv("a\n1")).toEqual([["a"], ["1"]]);
  });

  it("drops blank lines instead of yielding empty rows", () => {
    expect(parseCsv("a,b\n\n1,2\n\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("preserves empty cells within a row", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([["a", "b", "c"], ["1", "", "3"]]);
  });

  it("round-trips whatever csvRow emitted", () => {
    const written = [csvRow(["Ali", 'He said "yes"']), csvRow(["Siti", "Safety, Health"])].join("\r\n");
    expect(parseCsv(written)).toEqual([
      ["Ali", 'He said "yes"'],
      ["Siti", "Safety, Health"],
    ]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

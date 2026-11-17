import { describe, expect, it } from "vitest";
import { pageWindow, paginate } from "./paginate";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("pageWindow", () => {
  it("shows the ends and the neighbours of the current page, with gaps between", () => {
    expect(pageWindow(5, 52)).toEqual([1, "gap", 4, 5, 6, "gap", 52]);
  });

  it("lists every page when there are only a few", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });

  it("shows the single page of a one-page list", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
  });

  it("fills a one-page gap with its number instead of an ellipsis", () => {
    expect(pageWindow(4, 10)).toEqual([1, 2, 3, 4, 5, "gap", 10]);
  });
});

describe("paginate", () => {
  it("slices the requested page and reports its row span", () => {
    const result = paginate(range(1284), 2, 25);

    expect(result.rows[0]).toBe(25);
    expect(result.rows).toHaveLength(25);
    expect(result.from).toBe(26);
    expect(result.to).toBe(50);
    expect(result.last).toBe(52);
    expect(result.total).toBe(1284);
  });

  it("clamps a page past the end onto the last page", () => {
    expect(paginate(range(30), 9, 25).page).toBe(2);
  });

  it("reports an empty list as page 1 of 1 with no rows shown", () => {
    const result = paginate([], 1, 25);

    expect(result.from).toBe(0);
    expect(result.to).toBe(0);
    expect(result.last).toBe(1);
    expect(result.rows).toEqual([]);
  });
});

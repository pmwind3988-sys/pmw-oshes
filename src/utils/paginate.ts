/**
 * Paging arithmetic for the table pager. Pure, so the numbers the pager shows
 * and the rows a table slices are always the same numbers.
 */

export interface PageSpan {
  /** The page actually shown, clamped into 1..last. */
  page: number;
  /** The final page number; never below 1, so an empty list still has a page. */
  last: number;
  /** First row number on the page (1-based), or 0 when there are no rows. */
  from: number;
  /** Last row number on the page (1-based), or 0 when there are no rows. */
  to: number;
  total: number;
}

export interface Paginated<T> extends PageSpan {
  rows: T[];
}

export function pageSpan(total: number, page: number, size: number): PageSpan {
  const last = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), last);
  return {
    page: current,
    last,
    from: total === 0 ? 0 : (current - 1) * size + 1,
    to: Math.min(current * size, total),
    total,
  };
}

/**
 * The page numbers a pager should offer: the first and last page, the current
 * page and its neighbours, with "gap" wherever pages are left out. A gap of
 * exactly one page is filled with that page instead, since "…" for a single
 * hidden page is more trouble than the number itself.
 */
export function pageWindow(page: number, last: number): (number | "gap")[] {
  const wanted = new Set<number>([1, last, page - 1, page, page + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);

  const out: (number | "gap")[] = [];
  pages.forEach((n, i) => {
    const prev = pages[i - 1];
    if (prev !== undefined && n - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && n - prev > 2) out.push("gap");
    out.push(n);
  });
  return out;
}

export function paginate<T>(rows: T[], page: number, size: number): Paginated<T> {
  const span = pageSpan(rows.length, page, size);
  const start = (span.page - 1) * size;
  return { ...span, rows: rows.slice(start, start + size) };
}

import { useRef, useState, type ReactNode } from "react";
import { Box, IconButton, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon } from "../ui/Icons";
import { editorial } from "../../theme/editorial";

/** Rows per page: a phone gets a screen's worth, not a scroll through the week. */
const PAGE_SIZE = { phone: 10, wide: 25 } as const;

/** True below the `sm` breakpoint, where the smoking tables become card lists. */
// eslint-disable-next-line react-refresh/only-export-components -- a hook the smoking tables share with their cards
export function useIsPhone(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down("sm"));
}

export interface Paged<T> {
  rows: T[];
  page: number;
  pages: number;
  total: number;
  first: number;
  last: number;
  setPage: (page: number) => void;
}

/**
 * One page of `rows`. Back to page 1 whenever `resetKey` changes (a new filter),
 * but not when the same rows reload — the 30-second refresh leaves you where you were.
 */
// eslint-disable-next-line react-refresh/only-export-components -- as above
export function usePaged<T>(rows: T[], resetKey = ""): Paged<T> {
  const size = useIsPhone() ? PAGE_SIZE.phone : PAGE_SIZE.wide;
  // The page remembers which filters and page size it was chosen under; any
  // other key reads as page 1 without a reset render.
  const key = `${resetKey}|${size}`;
  const [picked, setPicked] = useState({ key, page: 0 });
  const page = picked.key === key ? picked.page : 0;
  const setPage = (next: number) => setPicked({ key, page: next });
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages - 1);
  const start = current * size;
  return {
    rows: rows.slice(start, start + size),
    page: current,
    pages,
    total: rows.length,
    first: rows.length ? start + 1 : 0,
    last: Math.min(start + size, rows.length),
    setPage,
  };
}

/** "11–20 of 64" with previous/next. Just the count when everything fits on one page. */
export function Pager({ paged, noun }: { paged: Paged<unknown>; noun: string }) {
  const { page, pages, total, first, last, setPage } = paged;
  const nav = useRef<HTMLDivElement>(null);
  if (total === 0) return null;
  // A new page starts at its first row, not wherever the old page's bottom was.
  const go = (next: number) => {
    setPage(next);
    const list = nav.current?.previousElementSibling;
    if (list && list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: "start" });
  };
  return (
    <Stack
      ref={nav}
      role="navigation"
      aria-label={`${noun} pages`}
      direction="row"
      sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, mt: 1, px: 0.5, minHeight: 40 }}
    >
      <Typography sx={{ fontSize: 12.5, color: editorial.muted, fontVariantNumeric: "tabular-nums" }} aria-live="polite">
        {pages > 1 ? `${first}–${last} of ${total} ${noun}` : `${total} ${noun}`}
      </Typography>
      {pages > 1 && (
        <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
          <IconButton size="small" aria-label="Previous page" disabled={page === 0} onClick={() => go(page - 1)} sx={{ width: 40, height: 40 }}>
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: editorial.ink, fontVariantNumeric: "tabular-nums", minWidth: 56, textAlign: "center" }}>
            {page + 1} / {pages}
          </Typography>
          <IconButton size="small" aria-label="Next page" disabled={page >= pages - 1} onClick={() => go(page + 1)} sx={{ width: 40, height: 40 }}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Stack>
      )}
    </Stack>
  );
}

/** A phone's stand-in for a wide table: one short card per row, in one frame. */
export function CardList({ children }: { children: ReactNode }) {
  return (
    <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0.75, overflow: "hidden", borderRadius: "24px", backgroundColor: editorial.paper }}>
      {children}
    </Box>
  );
}

/**
 * Title and a trailing badge on the first line, one or two quiet lines under it,
 * and the row's buttons to their right.
 */
export function CardRow({
  title,
  badge,
  lines,
  actions,
}: {
  title: ReactNode;
  badge?: ReactNode;
  lines: ReactNode[];
  actions?: ReactNode;
}) {
  return (
    <Box
      component="li"
      sx={{
        px: 1.75,
        py: 1.25,
        borderRadius: "16px",
        transition: "background-color 0.16s ease",
        "&:hover": { backgroundColor: editorial.blueSoft },
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
      }}
    >
      <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: editorial.ink, minWidth: 0, overflowWrap: "anywhere" }}>{title}</Typography>
        {badge && <Box sx={{ flex: "none" }}>{badge}</Box>}
      </Stack>
      {/* The buttons sit beside the detail lines rather than on a row of their own. */}
      <Stack direction="row" sx={{ alignItems: "flex-end", gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {lines.filter(Boolean).map((line, index) => (
            <Typography key={index} component="div" sx={{ fontSize: 12.5, color: editorial.muted, lineHeight: 1.5, mt: 0.25, overflowWrap: "anywhere" }}>
              {line}
            </Typography>
          ))}
        </Box>
        {actions && <Stack direction="row" sx={{ flex: "none", gap: 0, mr: -0.75, mb: -0.5 }}>{actions}</Stack>}
      </Stack>
    </Box>
  );
}

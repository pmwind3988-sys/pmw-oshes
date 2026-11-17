import { useId, type ReactNode } from "react";
import { Box, Button, NativeSelect, Typography } from "@mui/material";
import { pageSpan, pageWindow } from "../../utils/paginate";
import { radius } from "../../theme/surfaces";

const fmt = (n: number) => n.toLocaleString("en-US");

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const roundButton = {
  width: 44,
  height: 44,
  minWidth: 44,
  borderRadius: radius.full,
  color: "text.primary",
  "&.Mui-disabled": { color: "text.secondary", opacity: 0.5 },
} as const;

/**
 * Pages through a table: a count on the left, rows-per-page and the page
 * buttons on the right. The page is clamped into range, so a stale page number
 * never shows an empty table.
 */
export function Pager({
  total,
  page,
  size,
  onPage,
  onSize,
  sizes = [25, 50, 100],
}: {
  total: number;
  page: number;
  size: number;
  onPage: (p: number) => void;
  onSize: (s: number) => void;
  sizes?: number[];
}) {
  const selectId = useId();
  const span = pageSpan(total, page, size);
  const current = span.page;

  const pageButton = (n: number): ReactNode => {
    const active = n === current;
    return (
      <Button
        key={n}
        onClick={() => onPage(n)}
        aria-label={`Page ${n}`}
        aria-current={active ? "page" : undefined}
        sx={{
          ...roundButton,
          fontWeight: 600,
          bgcolor: active ? "text.primary" : "transparent",
          color: active ? "background.paper" : "text.primary",
          "&:hover": { bgcolor: active ? "text.primary" : "action.hover" },
        }}
      >
        {n}
      </Button>
    );
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        alignItems: { xs: "stretch", md: "center" },
        justifyContent: "space-between",
        gap: 2,
        bgcolor: "background.paper",
        borderRadius: radius.lg,
        px: 2,
        py: 1.5,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <Typography sx={{ color: "text.secondary", fontSize: 15 }}>
          Showing{" "}
          <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
            {fmt(span.from)}–{fmt(span.to)}
          </Box>{" "}
          of{" "}
          <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
            {fmt(total)}
          </Box>
        </Typography>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography component="label" htmlFor={selectId} sx={{ color: "text.secondary", fontSize: 15 }}>
            Rows per page
          </Typography>
          <NativeSelect
            value={size}
            onChange={(e) => onSize(Number(e.target.value))}
            inputProps={{ id: selectId }}
            variant="outlined"
            sx={{ borderRadius: radius.full, px: 1, minHeight: 44, fontSize: 15 }}
          >
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          justifyContent: { xs: "center", md: "flex-end" },
        }}
      >
        <Button
          onClick={() => onPage(current - 1)}
          disabled={current <= 1}
          aria-label="Previous page"
          sx={{ ...roundButton, bgcolor: "background.default" }}
        >
          <Chevron direction="left" />
        </Button>
        {pageWindow(current, span.last).map((item, i) =>
          item === "gap" ? (
            <Typography key={`gap-${i}`} component="span" aria-hidden="true" sx={{ px: 0.5, color: "text.secondary" }}>
              …
            </Typography>
          ) : (
            pageButton(item)
          ),
        )}
        <Button
          onClick={() => onPage(current + 1)}
          disabled={current >= span.last}
          aria-label="Next page"
          sx={{ ...roundButton, bgcolor: "background.default" }}
        >
          <Chevron direction="right" />
        </Button>
      </Box>
    </Box>
  );
}

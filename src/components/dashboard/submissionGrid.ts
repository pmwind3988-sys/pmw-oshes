/**
 * Column tracks shared by ListHeader and SubmissionRow so the two stay aligned.
 *
 * Grid tracks never shrink below their minmax() minimum, so the sum of the
 * minimums plus gaps and padding is the hard minimum width of the whole table.
 * Keep the md tier under the md breakpoint's usable width (960px viewport minus
 * the page container's 64px of side padding) or the table pushes the document
 * wider than the viewport and the entire page scrolls sideways.
 */
export const SUBMISSION_GRID_COLUMNS = {
  admin: {
    // 180+120+120+104+120+88 = 732, + 60 gap + 40 padding = 832 (fits 896)
    md: "minmax(180px, 2fr) minmax(120px, 1.2fr) minmax(120px, 1.1fr) minmax(104px, 0.8fr) minmax(120px, 1fr) 88px",
    lg: "minmax(240px, 2fr) minmax(180px, 1.35fr) minmax(170px, 1.15fr) minmax(132px, 0.85fr) minmax(150px, 1fr) 88px",
  },
  member: {
    // 200+130+104+120+40 = 594, + 48 gap + 40 padding = 682 (fits 896)
    md: "minmax(200px, 2.2fr) minmax(130px, 1.25fr) minmax(104px, 0.85fr) minmax(120px, 1fr) 40px",
    lg: "minmax(260px, 2.2fr) minmax(180px, 1.25fr) minmax(132px, 0.85fr) minmax(150px, 1fr) 40px",
  },
} as const;

export const SUBMISSION_GRID_GAP = { md: 1.5, lg: 2 } as const;

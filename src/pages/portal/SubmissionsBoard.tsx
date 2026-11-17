import type { ReactNode } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import type { Theme } from "@mui/material";
import { TINTS } from "../../theme/simple";
import { radius } from "../../theme/surfaces";
import { usePortal } from "../../contexts/PortalContext";
import type { BoardColumn, BoardColumnId } from "../../utils/boardColumns";
import { formTint, recordTone } from "../../utils/boardColumns";
import { initialsOf } from "../../utils/portalPeople";
import { recordKey } from "../../utils/portalRecords";
import { toneColors, type StatusTone } from "../../utils/portalWork";
import type { PortalRecord } from "../../types";

/*
 * The pieces the submissions list and board share: the status lozenge, the
 * initials avatar, and the tint a form's square is drawn in. They live here so
 * both views read the same and neither imports the other.
 */

export function StatusLozenge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        flex: "none",
        px: 1,
        py: 0.5,
        borderRadius: radius.tag,
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1.2,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
        backgroundColor: toneColors[tone].bg,
        color: toneColors[tone].fg,
      }}
    >
      {children}
    </Box>
  );
}

/** An initials circle. The account's own name is drawn in the sun accent. */
export function PersonAvatar({ name, isYou = false, size = 26 }: { name: string; isYou?: boolean; size?: number }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        width: size,
        height: size,
        flex: "none",
        borderRadius: "50%",
        backgroundColor: isYou ? TINTS.amber : TINTS.blue,
        color: "text.primary",
        fontSize: size < 26 ? 9.5 : 10.5,
        fontWeight: 800,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {initialsOf(name)}
    </Box>
  );
}

function BoardCard({
  record,
  column,
  userEmail,
  onOpen,
}: {
  record: PortalRecord;
  column: BoardColumnId;
  userEmail: string;
  onOpen: () => void;
}) {
  const yours = column === "you";
  const done = column === "done";
  const holder = column === "returned" ? record.submitter : record.currentAssignee;

  let trailing: ReactNode;
  if (yours) {
    trailing = <StatusLozenge tone="waiting">{record.ageOnLayerLabel}</StatusLozenge>;
  } else if (done) {
    trailing = <StatusLozenge tone={recordTone(record, userEmail)}>{record.status}</StatusLozenge>;
  } else if (column === "returned") {
    trailing = (
      <Typography component="span" sx={{ ml: "auto", fontSize: 12, fontWeight: 600, color: "text.secondary", whiteSpace: "nowrap" }}>
        With filer
      </Typography>
    );
  } else {
    trailing = (
      <Typography component="span" sx={{ ml: "auto", fontSize: 12, fontWeight: 600, color: "text.secondary", whiteSpace: "nowrap" }}>
        {`${record.at + 1} of ${record.totalLayers}`}
      </Typography>
    );
  }

  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        width: "100%",
        p: 1.5,
        textAlign: "left",
        font: "inherit",
        color: "text.primary",
        backgroundColor: "background.paper",
        border: "2px solid",
        borderColor: yours ? "text.primary" : "transparent",
        borderRadius: radius.xs,
        cursor: "pointer",
        "&:hover": { borderColor: yours ? "text.primary" : "primary.main" },
        "&:focus-visible": { outline: "3px solid", outlineColor: (theme: Theme) => theme.palette.primary.light, outlineOffset: 2 },
      }}
    >
      <Typography
        component="span"
        sx={{ display: "block", fontSize: 14, fontWeight: 700, lineHeight: 1.35, color: done ? "text.secondary" : "text.primary" }}
      >
        {record.subject}
      </Typography>
      <Stack component="span" direction="row" spacing={1} sx={{ alignItems: "center", fontSize: 12, fontWeight: 700 }}>
        <Box
          component="span"
          aria-hidden="true"
          sx={{ width: 18, height: 18, flex: "none", borderRadius: radius.tag, backgroundColor: formTint(record.listTitle) }}
        />
        <Typography component="span" sx={{ fontSize: 12, fontWeight: 800, color: "primary.main", whiteSpace: "nowrap" }}>
          {record.reference}
        </Typography>
        {trailing}
        {!done && holder && <PersonAvatar name={holder} isYou={yours} size={24} />}
      </Stack>
    </Box>
  );
}

/**
 * Four columns of records, each scrolling on its own. A card opens its record;
 * nothing is dragged, because a status only changes by signing.
 */
export default function SubmissionsBoard({
  columns,
  olderDone,
  onOpen,
  onShowAll,
}: {
  columns: BoardColumn[];
  /** Settled records older than the window, which the Done column points at. */
  olderDone: number;
  onOpen: (record: PortalRecord) => void;
  onShowAll: () => void;
}) {
  const { userEmail } = usePortal();
  return (
    <Box>
      <Typography sx={{ mb: 1.5, fontSize: 13, fontWeight: 600, color: "text.secondary" }}>
        Board shows open work. Done items older than 14 days move to the list.
      </Typography>
      <Box sx={{ overflowX: "auto", pb: 0.5 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(240px, 1fr))", gap: 1.5 }}>
          {columns.map((column) => (
            <Box
              key={column.id}
              component="section"
              aria-label={column.title}
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                p: 1.25,
                minHeight: 240,
                maxHeight: "70vh",
                overflowY: "auto",
                backgroundColor: TINTS.grey,
                borderRadius: radius.md,
              }}
            >
              <Typography
                component="h2"
                sx={{
                  m: "4px 6px",
                  fontSize: 12.5,
                  fontWeight: 800,
                  color: "text.secondary",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {column.title} <Box component="span" sx={{ color: "text.primary" }}>{column.items.length}</Box>
              </Typography>
              {column.items.map((record) => (
                <BoardCard
                  key={recordKey(record)}
                  record={record}
                  column={column.id}
                  userEmail={userEmail}
                  onOpen={() => onOpen(record)}
                />
              ))}
              {column.items.length === 0 && (
                <Typography sx={{ px: 1, py: 2, fontSize: 13, color: "text.secondary" }}>Nothing here.</Typography>
              )}
              {column.id === "done" && olderDone > 0 && (
                <Button
                  onClick={onShowAll}
                  sx={{ mt: 0.5, minHeight: 44, textTransform: "none", fontWeight: 700, color: "primary.main" }}
                >
                  {`Show ${olderDone} more in the list`}
                </Button>
              )}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

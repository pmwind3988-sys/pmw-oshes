import { useState } from "react";
import { Button } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { usePortal } from "../../contexts/PortalContext";
import type { PortalExportResult } from "../../utils/portalExport";

/**
 * The portal's export button, in one place.
 *
 * Three screens offer this and all three want the same four things: a token, so
 * the file can carry its pictures rather than links into a site the reader may
 * have no account on; a button that says it is working, because a hundred records
 * with signatures is a few seconds of downloads; a count afterwards; and whatever
 * the export could not carry, said out loud instead of left for the reader to
 * notice. Written per screen, that is the same four things drifting three ways.
 *
 * `run` receives the token — blank when one could not be had, which the exports
 * treat as "links, and say so" rather than as a failure.
 */
export default function ExportCsvButton({
  label,
  busyLabel,
  done,
  run,
  sx,
}: {
  label: string;
  busyLabel?: string;
  /** The line to show when it worked. Warnings are appended to it. */
  done: (rowCount: number) => string;
  run: (token: string) => Promise<PortalExportResult> | PortalExportResult;
  sx?: SxProps<Theme>;
}) {
  const { spClient, toast } = usePortal();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // A token this export cannot get is not a reason to refuse the file: the
      // rows are all here, and only the pictures need one.
      const token = await spClient.acquireToken().catch(() => "");
      const result = await run(token);
      toast([done(result.rowCount), ...result.warnings].join(" "));
    } catch (error) {
      toast(`Export failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outlined" onClick={() => void handleClick()} disabled={busy} sx={{ minHeight: 40, ...sx }}>
      {busy ? busyLabel ?? "Preparing CSV..." : label}
    </Button>
  );
}

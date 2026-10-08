import { useMemo } from "react";
import { Box, Stack, Typography } from "@mui/material";
import ReferenceTag from "../../components/ReferenceTag";
import { PageHeader, Widget, WidgetEmpty } from "../../components/Widget";
import { CheckCircle, History, Mail, Users, XCircle } from "../../components/ui/Icons";
import { editorial } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";
import { usePortal } from "../../contexts/PortalContext";
import ExportCsvButton from "../../components/portal/ExportCsvButton";
import { exportAuditCsv } from "../../utils/portalExport";
import { formatClock } from "../../utils/displayDateTime";
import type { AuditEntry } from "../../types";

/** The round icon for an event, read from its wording: a settle, a stop, a nudge, a hand-over, or anything else. */
function eventIcon(event: string) {
  const text = event.toLowerCase();
  if (/cancel|withdraw|reject|delet|remov/.test(text)) return { Icon: XCircle, tone: editorial.error, wash: editorial.errorWash };
  if (/sign|approv|evaluat|record|settl/.test(text)) return { Icon: CheckCircle, tone: editorial.success, wash: editorial.successWash };
  if (/nudge|remind|chas/.test(text)) return { Icon: Mail, tone: editorial.pmwBlueDark, wash: editorial.blueWash };
  if (/reassign|assign|hand/.test(text)) return { Icon: Users, tone: editorial.pmwPurpleDark, wash: editorial.pmwPurpleSoft };
  return { Icon: History, tone: editorial.muted, wash: editorial.neutralWash };
}

/** Day headings: "Today", "Yesterday", then the date. Keyed on the local calendar day. */
function dayHeading(date: Date, now: Date): string {
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const delta = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (delta === 0) return "Today";
  if (delta === 1) return "Yesterday";
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

interface AuditGroup {
  key: string;
  heading: string;
  rows: { entry: AuditEntry; index: number; time: string }[];
}

/**
 * Audit trail. Append-only, newest first. Every row here was written from the
 * same code path as the action it records — never separately.
 *
 * Grouped by day, so a long trail reads as a diary: one heading per day, then
 * the day's events as borderless rows with a round icon for what happened.
 */
export default function AuditScreen() {
  const { audit, access } = usePortal();

  const groups = useMemo<AuditGroup[]>(() => {
    const now = new Date();
    const byDay = new Map<string, AuditGroup>();
    audit.forEach((entry, index) => {
      const date = new Date(entry.at);
      const valid = !Number.isNaN(date.getTime());
      const key = valid ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : "unknown";
      let group = byDay.get(key);
      if (!group) {
        group = { key, heading: valid ? dayHeading(date, now) : "Undated", rows: [] };
        byDay.set(key, group);
      }
      group.rows.push({ entry, index, time: valid ? formatClock(date) : entry.whenLabel });
    });
    return [...byDay.values()];
  }, [audit]);

  return (
    <Box sx={{ maxWidth: 1060 }}>
      <PageHeader
        title="Audit trail"
        subtitle="append-only · every signature, nudge, reassignment and cancellation, including the ones made in this session"
        meta={audit.length > 0 ? `${audit.length} ${audit.length === 1 ? "entry" : "entries"}` : undefined}
        actions={
          access.canExport ? (
            <ExportCsvButton
              label="Export trail to CSV"
              done={(count) => `Exported ${count} trail row${count === 1 ? "" : "s"}, timestamped in Malaysian time.`}
              run={() => exportAuditCsv(audit)}
            />
          ) : undefined
        }
      />

      {audit.length === 0 ? (
        <Widget bare>
          <WidgetEmpty>Nothing has been recorded yet.</WidgetEmpty>
        </Widget>
      ) : (
        <Stack spacing={2.5}>
          {groups.map((group) => (
            <Box key={group.key}>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: editorial.muted, px: 1.5, mb: 0.75 }}>
                {group.heading}
              </Typography>
              <Stack spacing={0.25} component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                {group.rows.map(({ entry, index, time }) => {
                  const { Icon, tone, wash } = eventIcon(entry.event);
                  return (
                    <Stack
                      key={`${entry.at}-${entry.reference}-${index}`}
                      component="li"
                      direction="row"
                      spacing={1.5}
                      sx={{
                        alignItems: "center",
                        px: 1.5,
                        py: 1.125,
                        borderRadius: "16px",
                        flexWrap: { xs: "wrap", md: "nowrap" },
                        "&:hover": { backgroundColor: editorial.blueSoft },
                      }}
                    >
                      <Box
                        aria-hidden="true"
                        sx={{
                          flex: "none",
                          width: 36,
                          height: 36,
                          borderRadius: radius.full,
                          display: "grid",
                          placeItems: "center",
                          backgroundColor: wash,
                          color: tone,
                        }}
                      >
                        <Icon sx={{ fontSize: 18 }} />
                      </Box>
                      <Typography
                        sx={{ fontSize: 12.5, color: editorial.muted, width: 84, flex: "none", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
                      >
                        {time}
                      </Typography>
                      <Box sx={{ flex: "none" }}>
                        <ReferenceTag value={entry.reference} size="md" sx={{ whiteSpace: "nowrap" }} />
                      </Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, minWidth: 0, width: { md: 170 }, flex: "none" }} noWrap>
                        {entry.who}
                      </Typography>
                      <Typography sx={{ fontSize: 13, color: editorial.muted, minWidth: 0, flex: 1 }}>{entry.event}</Typography>
                    </Stack>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

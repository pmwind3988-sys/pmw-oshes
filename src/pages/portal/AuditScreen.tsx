import { Box, Button } from "@mui/material";
import ReferenceTag from "../../components/ReferenceTag";
import { DataCell, DataRow, DataTable, PageHeader, Widget, WidgetEmpty } from "../../components/Widget";
import { usePortal } from "../../contexts/PortalContext";
import { exportAuditCsv } from "../../utils/portalExport";

/**
 * Audit trail. Append-only, newest first. Every row here was written from the
 * same code path as the action it records — never separately.
 */
export default function AuditScreen() {
  const { audit, access, toast } = usePortal();

  return (
    <Box sx={{ maxWidth: 1060 }}>
      <PageHeader
        title="Audit trail"
        subtitle="append-only · every signature, nudge, reassignment and cancellation, including the ones made in this session"
        meta={audit.length > 0 ? `${audit.length} ${audit.length === 1 ? "entry" : "entries"}` : undefined}
        actions={
          access.canExport ? (
            <Button
              variant="outlined"
              onClick={() => toast(`Exported ${exportAuditCsv(audit)} trail rows.`)}
              sx={{ minHeight: 40 }}
            >
              Export trail to CSV
            </Button>
          ) : undefined
        }
      />

      {audit.length === 0 ? (
        <Widget bare>
          <WidgetEmpty>Nothing has been recorded yet.</WidgetEmpty>
        </Widget>
      ) : (
        <DataTable
          minWidth={820}
          columns={[
            { key: "when", label: "When", width: 130 },
            { key: "ref", label: "Reference", width: 120 },
            { key: "who", label: "Who", width: 170 },
            { key: "event", label: "Event" },
          ]}
        >
          {audit.map((entry, index) => (
            <DataRow key={`${entry.at}-${entry.reference}-${index}`}>
              <DataCell muted nowrap>
                {entry.whenLabel}
              </DataCell>
              <DataCell>
                <ReferenceTag value={entry.reference} size="md" />
              </DataCell>
              <DataCell>{entry.who}</DataCell>
              <DataCell muted>{entry.event}</DataCell>
            </DataRow>
          ))}
        </DataTable>
      )}
    </Box>
  );
}

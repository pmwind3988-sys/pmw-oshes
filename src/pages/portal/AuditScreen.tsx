import { Box } from "@mui/material";
import ReferenceTag from "../../components/ReferenceTag";
import { DataCell, DataRow, DataTable, PageHeader, Widget, WidgetEmpty } from "../../components/Widget";
import { usePortal } from "../../contexts/PortalContext";
import ExportCsvButton from "../../components/portal/ExportCsvButton";
import { exportAuditCsv } from "../../utils/portalExport";

/**
 * Audit trail. Append-only, newest first. Every row here was written from the
 * same code path as the action it records — never separately.
 */
export default function AuditScreen() {
  const { audit, access } = usePortal();

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

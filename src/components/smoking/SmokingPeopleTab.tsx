import { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { editorial } from "../../theme/editorial";
import { Callout, DataCell, DataRow, DataTable, PageHeader, Widget, WidgetEmpty } from "../Widget";
import { Download as DownloadIcon } from "../ui/Icons";
import { usePortal } from "../../contexts/PortalContext";
import { csvRow, downloadCsv } from "../../utils/csv";
import { formatMalaysiaDateTime, malaysiaDateStamp } from "../../utils/malaysiaTime";
import { loadProfiles } from "../../utils/smoking/adminStore";

type Profile = Awaited<ReturnType<typeof loadProfiles>>[number];

const signInLabel = (method: Profile["signInMethod"]) => (method === "microsoft" ? "Microsoft" : "Google");
const departmentLabel = (p: Profile) => (p.departmentFromList ? p.department : `${p.department} (typed)`);

function profilesCsv(profiles: Profile[]): string {
  const lines = [csvRow(["Name", "Email", "Department", "Position", "Company", "Staff ID", "Signed in with", "First seen", "Last seen"])];
  for (const p of profiles) {
    lines.push(
      csvRow([
        p.fullName,
        p.email,
        departmentLabel(p),
        p.position,
        p.company,
        p.staffId,
        signInLabel(p.signInMethod),
        formatMalaysiaDateTime(p.firstSeen),
        formatMalaysiaDateTime(p.lastSeen),
      ]),
    );
  }
  return lines.join("\r\n");
}

export default function SmokingPeopleTab() {
  const { spClient, toast } = usePortal();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const token = await spClient.acquireToken();
        const rows = await loadProfiles(token);
        if (!cancelled) setProfiles(rows);
      } catch (error) {
        if (cancelled) return;
        setProfiles([]);
        setLoadError(error instanceof Error ? error.message : "Could not load registered people.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spClient]);

  const handleExport = () => {
    downloadCsv(profilesCsv(profiles), `smoking-people-${malaysiaDateStamp()}.csv`);
    toast(`Exported ${profiles.length} rows`);
  };

  return (
    <Box>
      <PageHeader
        title="People"
        subtitle="everyone who has registered for the smoking log"
        actions={
          <Button variant="outlined" startIcon={<DownloadIcon fontSize="small" />} onClick={handleExport} sx={{ minHeight: 40 }}>
            Export to CSV
          </Button>
        }
      />

      {loadError && (
        <Callout tone="error" sx={{ mb: 2 }}>
          {loadError}
        </Callout>
      )}

      {loading ? (
        <Widget bare>
          <Typography sx={{ fontSize: 13, color: editorial.muted, py: 1.25 }}>Loading…</Typography>
        </Widget>
      ) : profiles.length === 0 ? (
        <Widget bare>
          <WidgetEmpty>Nobody has registered yet.</WidgetEmpty>
        </Widget>
      ) : (
        <DataTable
          minWidth={980}
          columns={[
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "department", label: "Department" },
            { key: "position", label: "Position" },
            { key: "company", label: "Company" },
            { key: "staffId", label: "Staff ID" },
            { key: "signIn", label: "Signed in with" },
            { key: "firstSeen", label: "First seen" },
            { key: "lastSeen", label: "Last seen" },
          ]}
        >
          {profiles.map((p) => (
            <DataRow key={p.id}>
              <DataCell>{p.fullName}</DataCell>
              <DataCell muted>{p.email}</DataCell>
              <DataCell muted>{departmentLabel(p)}</DataCell>
              <DataCell muted>{p.position}</DataCell>
              <DataCell muted>{p.company}</DataCell>
              <DataCell muted>{p.staffId}</DataCell>
              <DataCell muted>{signInLabel(p.signInMethod)}</DataCell>
              <DataCell muted nowrap>
                {formatMalaysiaDateTime(p.firstSeen)}
              </DataCell>
              <DataCell muted nowrap>
                {formatMalaysiaDateTime(p.lastSeen)}
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      )}
    </Box>
  );
}

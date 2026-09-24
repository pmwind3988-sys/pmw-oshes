import { useEffect, useState } from "react";
import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import { editorial } from "../../theme/editorial";
import { Callout, DataCell, DataRow, DataTable, PageHeader, Widget, WidgetEmpty } from "../Widget";
import { Ban as BlockIcon, Download as DownloadIcon, ShieldCheck as UnblockIcon, Trash2 as RemoveIcon } from "../ui/Icons";
import { usePortal } from "../../contexts/PortalContext";
import { downloadCsv } from "../../utils/csv";
import { formatMalaysiaDateTime, malaysiaDateStamp } from "../../utils/malaysiaTime";
import { writeAuditEntry } from "../../utils/portalAudit";
import { departmentLabel, profilesCsv, signInMethodLabel, type SmokingProfileRow } from "../../utils/smoking/adminData";
import { deleteProfile, loadProfiles, setProfileBlocked } from "../../utils/smoking/adminStore";
import PersonActionDialog, { type PersonAction } from "./PersonActionDialog";

type Profile = SmokingProfileRow;

/**
 * Removing a blocked person must not lift the block — SharePoint has no
 * concept of "removed but still blocked", so a fresh registration would come
 * in unblocked. Unblock first, then remove.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure helper the tests import directly, no separate file for one export
export function canRemovePerson(person: { blocked: boolean }): boolean {
  return !person.blocked;
}

const REMOVE_BLOCKED_HINT = "Unblock first — removing a blocked person would let them register again, unblocked.";

const PILL_BASE = {
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  px: 0.9,
  py: 0.4,
  borderRadius: "999px",
  border: "1px solid transparent",
} as const;

function StatusCell({ p }: { p: Profile }) {
  if (!p.blocked) {
    return (
      <Box component="span" sx={{ ...PILL_BASE, color: editorial.muted, backgroundColor: editorial.neutralWash, borderColor: editorial.border }}>
        Active
      </Box>
    );
  }
  return (
    <Tooltip title={p.blockedBy ? `Blocked by ${p.blockedBy}${p.blockedAt ? `, ${formatMalaysiaDateTime(p.blockedAt)}` : ""}` : "Blocked"}>
      <Box component="span" sx={{ ...PILL_BASE, color: editorial.error, backgroundColor: editorial.errorWash, borderColor: editorial.error }}>
        Blocked
      </Box>
    </Tooltip>
  );
}

export default function SmokingPeopleTab() {
  const { access, spClient, userEmail, appendAudit, toast } = usePortal();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionTarget, setActionTarget] = useState<{ action: PersonAction; person: Profile } | null>(null);
  const [busy, setBusy] = useState(false);

  const canWrite = access.isAdmin && !access.readOnly;

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

  const runWrite = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast(error instanceof Error ? error.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  };

  const handleActionYes = () => {
    const t = actionTarget;
    if (!t) return;
    const { action, person } = t;
    void runWrite(async () => {
      const token = await spClient.acquireToken();
      if (action === "remove") {
        await deleteProfile(token, person.id);
        const entry = await writeAuditEntry(spClient, {
          reference: `SMK-PERSON-${person.email}`,
          who: userEmail,
          event: `Smoking user removed — ${person.fullName} ${person.email}, ${person.department}, ${person.position}, ${person.company} (break records kept)`,
        });
        appendAudit(entry);
        setProfiles((rows) => rows.filter((r) => r.id !== person.id));
        toast("Person removed");
      } else {
        const blocked = action === "block";
        const at = new Date();
        await setProfileBlocked(token, person.id, blocked, userEmail, at);
        const entry = await writeAuditEntry(spClient, {
          reference: `SMK-PERSON-${person.email}`,
          who: userEmail,
          event: `Smoking user ${blocked ? "blocked" : "unblocked"} — ${person.fullName} ${person.email}`,
        });
        appendAudit(entry);
        setProfiles((rows) =>
          rows.map((r) =>
            r.id === person.id
              ? { ...r, blocked, blockedBy: blocked ? userEmail : "", blockedAt: blocked ? at.toISOString() : "" }
              : r,
          ),
        );
        toast(blocked ? "Person blocked" : "Person unblocked");
      }
      setActionTarget(null);
    });
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
          minWidth={canWrite ? 1160 : 1040}
          columns={[
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "department", label: "Department" },
            { key: "position", label: "Position" },
            { key: "company", label: "Company" },
            { key: "staffId", label: "Staff ID" },
            { key: "signIn", label: "Signed in with" },
            { key: "firstSeen", label: "First seen" },
            { key: "lastSeen", label: "Last signed in" },
            { key: "status", label: "Status" },
            ...(canWrite ? [{ key: "actions", label: "", width: 110, align: "right" as const }] : []),
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
              <DataCell muted>{signInMethodLabel(p.signInMethod)}</DataCell>
              <DataCell muted nowrap>
                {formatMalaysiaDateTime(p.firstSeen)}
              </DataCell>
              <DataCell muted nowrap>
                {formatMalaysiaDateTime(p.lastSeen)}
              </DataCell>
              <DataCell>
                <StatusCell p={p} />
              </DataCell>
              {canWrite && (
                <DataCell align="right">
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
                    <Tooltip title={p.blocked ? "Unblock" : "Block"}>
                      <IconButton
                        size="small"
                        onClick={() => setActionTarget({ action: p.blocked ? "unblock" : "block", person: p })}
                        aria-label={`${p.blocked ? "Unblock" : "Block"} ${p.fullName || p.email}`}
                      >
                        {p.blocked ? <UnblockIcon fontSize="small" /> : <BlockIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={canRemovePerson(p) ? "Remove" : REMOVE_BLOCKED_HINT}>
                      <span>
                        <IconButton
                          size="small"
                          disabled={!canRemovePerson(p)}
                          onClick={() => setActionTarget({ action: "remove", person: p })}
                          aria-label={`Remove ${p.fullName || p.email}`}
                        >
                          <RemoveIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </DataCell>
              )}
            </DataRow>
          ))}
        </DataTable>
      )}

      <PersonActionDialog
        open={!!actionTarget}
        action={actionTarget?.action ?? null}
        target={actionTarget?.person ?? null}
        busy={busy}
        onNo={() => setActionTarget(null)}
        onYes={handleActionYes}
      />
    </Box>
  );
}

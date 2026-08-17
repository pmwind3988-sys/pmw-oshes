import { useMemo } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";
import { DataCell, DataRow, DataTable, PageHeader, Widget, WidgetEmpty } from "../../components/Widget";
import { usePortal } from "../../contexts/PortalContext";
import { displayName, normalizeEmail } from "../../utils/portalPeople";
import type { PortalPerson } from "../../types";

/** Two letters, so a table of names scans as faces rather than as a column of text. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

/**
 * People & roles.
 *
 * The point of the screen: an approval layer points at a role, not a person —
 * which is what makes reassignment safe.
 */
export default function PeopleScreen() {
  const { catalogue, records, directory, userEmail, isAdmin } = usePortal();

  const people = useMemo<PortalPerson[]>(() => {
    const openByEmail = new Map<string, number>();
    for (const record of records) {
      if (record.done || record.returned || !record.currentAssigneeEmail) continue;
      openByEmail.set(record.currentAssigneeEmail, (openByEmail.get(record.currentAssigneeEmail) ?? 0) + 1);
    }

    const rows = new Map<string, PortalPerson>();
    for (const entry of catalogue) {
      for (const layer of entry.layers) {
        if (layer.assignee.type !== "user") continue;
        const email = normalizeEmail(layer.assignee.value);
        if (!email) continue;
        const role = layer.roleLabel ?? layer.title ?? entry.name;
        const key = `${email}||${role}`;
        if (rows.has(key)) continue;

        const isEvaluator = layer.type === "evaluation";
        rows.set(key, {
          name: displayName(email, directory),
          email,
          approvalRole: role,
          systemRole: isEvaluator ? "Evaluator" : "Approver",
          openItems: openByEmail.get(email) ?? 0,
          sees: isEvaluator
            ? "Full dashboard, all records, can chase"
            : "Only what is waiting on them, plus what they have signed",
        });
      }
    }

    const you = normalizeEmail(userEmail);
    if (isAdmin && you && ![...rows.values()].some((row) => row.email === you)) {
      rows.set(`${you}||admin`, {
        name: displayName(you, directory),
        email: you,
        approvalRole: "—",
        systemRole: "Administrator",
        openItems: openByEmail.get(you) ?? 0,
        sees: "Everything, plus the catalogue and roles",
      });
    }

    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogue, records, directory, userEmail, isAdmin]);

  return (
    <Box sx={{ maxWidth: 1000 }}>
      <PageHeader
        title="People & roles"
        subtitle="a role decides what the dashboard shows and what can be signed — an approval layer points at a role, not a person"
        meta={people.length > 0 ? `${people.length} ${people.length === 1 ? "person" : "people"}` : undefined}
      />

      {people.length === 0 ? (
        <Widget bare>
          <WidgetEmpty>
            No layer points at a named person yet. Assign approvers on the Layers tab of the form builder.
          </WidgetEmpty>
        </Widget>
      ) : (
        <DataTable
          minWidth={840}
          columns={[
            { key: "name", label: "Name", width: 230 },
            { key: "role", label: "Approval role", width: 170 },
            { key: "system", label: "System role", width: 130 },
            { key: "open", label: "Open items", width: 100 },
            { key: "sees", label: "Sees" },
          ]}
        >
          {people.map((person) => (
            <DataRow key={`${person.email}-${person.approvalRole}`}>
              <DataCell>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
                  <Box
                    sx={{
                      flex: "none",
                      width: 30,
                      height: 30,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: radius.full,
                      backgroundColor: editorial.pmwBlueSoft,
                      color: editorial.pmwBlueDark,
                      fontSize: 11.5,
                      fontWeight: 800,
                    }}
                  >
                    {initialsOf(person.name)}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{person.name}</Typography>
                    <Typography sx={{ fontSize: 11, color: editorial.muted }} noWrap>
                      {person.email}
                    </Typography>
                  </Box>
                </Stack>
              </DataCell>
              <DataCell>{person.approvalRole}</DataCell>
              <DataCell>
                <Box
                  component="span"
                  sx={{
                    display: "inline-block",
                    fontSize: 11,
                    fontWeight: 700,
                    px: 0.9,
                    py: 0.3,
                    borderRadius: radius.full,
                    border: editorialHairline,
                    backgroundColor: editorial.blueSoft,
                    whiteSpace: "nowrap",
                  }}
                >
                  {person.systemRole}
                </Box>
              </DataCell>
              <DataCell sx={{ fontVariantNumeric: "tabular-nums", fontWeight: person.openItems > 0 ? 800 : 400 }}>
                {person.openItems}
              </DataCell>
              <DataCell muted>{person.sees}</DataCell>
            </DataRow>
          ))}
        </DataTable>
      )}
    </Box>
  );
}

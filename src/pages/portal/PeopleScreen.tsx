import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { usePortal } from "../../contexts/PortalContext";
import { displayName, normalizeEmail } from "../../utils/portalPeople";
import type { PortalPerson } from "../../types";

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
    <Box sx={{ maxWidth: 960 }}>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
          People &amp; roles
        </Typography>
        <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>
          a role decides what the dashboard shows and what can be signed — an approval layer points at a role, not a
          person
        </Typography>
      </Box>

      {people.length === 0 ? (
        <Box sx={{ backgroundColor: editorial.panel, border: editorialHairline, borderRadius: "14px", p: 2 }}>
          <Typography sx={{ fontSize: 13, color: editorial.muted }}>
            No layer points at a named person yet. Assign approvers on the Layers tab of the form builder.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ backgroundColor: editorial.panel, border: editorialHairline, borderRadius: "14px", overflowX: "auto" }}>
          <Box component="table" sx={{ width: "100%", minWidth: 820, borderCollapse: "collapse", fontSize: 13 }}>
            <Box component="thead">
              <Box
                component="tr"
                sx={{
                  "& th": {
                    textAlign: "left",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: editorial.muted,
                    px: 2,
                    py: 1.25,
                    borderBottom: editorialHairline,
                  },
                }}
              >
                <Box component="th" sx={{ width: 190 }}>Name</Box>
                <Box component="th" sx={{ width: 170 }}>Approval role</Box>
                <Box component="th" sx={{ width: 130 }}>System role</Box>
                <Box component="th" sx={{ width: 100 }}>Open items</Box>
                <Box component="th">Sees</Box>
              </Box>
            </Box>
            <Box component="tbody">
              {people.map((person) => (
                <Box
                  component="tr"
                  key={`${person.email}-${person.approvalRole}`}
                  sx={{ "& td": { px: 2, py: 1.25, borderBottom: editorialHairline, verticalAlign: "top" } }}
                >
                  <Box component="td">
                    <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{person.name}</Typography>
                    <Typography sx={{ fontSize: 11, color: editorial.muted }}>{person.email}</Typography>
                  </Box>
                  <Box component="td">{person.approvalRole}</Box>
                  <Box component="td">
                    <Box
                      component="span"
                      sx={{
                        fontSize: 11,
                        fontWeight: 700,
                        px: 0.9,
                        py: 0.3,
                        borderRadius: "999px",
                        border: editorialHairline,
                        backgroundColor: editorial.blueSoft,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {person.systemRole}
                    </Box>
                  </Box>
                  <Box component="td" sx={{ fontVariantNumeric: "tabular-nums" }}>{person.openItems}</Box>
                  <Box component="td" sx={{ color: editorial.muted }}>{person.sees}</Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

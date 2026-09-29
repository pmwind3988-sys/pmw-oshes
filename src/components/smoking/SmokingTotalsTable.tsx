import { Typography } from "@mui/material";
import { DataCell, DataRow, DataTable, Widget, WidgetEmpty } from "../Widget";
import type { PersonTotal } from "../../utils/smoking/adminData";
import { CardList, CardRow, Pager, useIsPhone, usePaged } from "./SmokingPaging";

/** Collapses per-person totals into one row per department. */
// eslint-disable-next-line react-refresh/only-export-components -- pure helper the table itself uses, kept beside its one caller
export function groupTotalsByDepartment(totals: PersonTotal[]): PersonTotal[] {
  const byDepartment = new Map<string, PersonTotal>();
  for (const t of totals) {
    const key = t.department || "—";
    const row = byDepartment.get(key) ?? {
      email: "", fullName: key, department: key, breaks: 0, totalMinutes: 0, averageMinutes: 0, flagged: 0,
    };
    row.breaks += t.breaks;
    row.totalMinutes += t.totalMinutes;
    row.flagged += t.flagged;
    byDepartment.set(key, row);
  }
  return [...byDepartment.values()]
    .map((row) => ({ ...row, averageMinutes: row.breaks ? Math.round(row.totalMinutes / row.breaks) : 0 }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes || a.department.localeCompare(b.department));
}

export default function SmokingTotalsTable({
  totals,
  groupByDepartment,
  resetKey = "",
}: {
  totals: PersonTotal[];
  groupByDepartment: boolean;
  /** Changes when the filters do, which sends the table back to page 1. */
  resetKey?: string;
}) {
  const rows = groupByDepartment ? groupTotalsByDepartment(totals) : totals;
  const phone = useIsPhone();
  const paged = usePaged(rows, `${resetKey}|${groupByDepartment}`);

  if (rows.length === 0) {
    return (
      <Widget bare>
        <WidgetEmpty>No breaks match these filters.</WidgetEmpty>
      </Widget>
    );
  }

  return (
    <>
      {phone ? (
        <CardList>
          {paged.rows.map((t, index) => (
            <CardRow
              key={groupByDepartment ? t.department : `${t.email}-${index}`}
              title={groupByDepartment ? t.department : t.fullName || t.email}
              badge={<Typography component="span" sx={{ fontSize: 13, fontWeight: 700 }}>{t.totalMinutes} min</Typography>}
              lines={[
                [
                  groupByDepartment ? "" : t.department,
                  `${t.breaks} ${t.breaks === 1 ? "break" : "breaks"}`,
                  `avg ${t.averageMinutes} min`,
                  t.flagged ? `${t.flagged} flagged` : "",
                ].filter(Boolean).join(" · "),
              ]}
            />
          ))}
        </CardList>
      ) : (
        <DataTable
          minWidth={720}
          columns={[
            { key: "name", label: groupByDepartment ? "Department" : "Name" },
            ...(groupByDepartment ? [] : [{ key: "department", label: "Department" }]),
            { key: "breaks", label: "Breaks", align: "right" as const },
            { key: "total", label: "Total", align: "right" as const },
            { key: "average", label: "Average", align: "right" as const },
            { key: "flagged", label: "Flagged", align: "right" as const },
          ]}
        >
          {paged.rows.map((t, index) => (
            <DataRow key={groupByDepartment ? t.department : `${t.email}-${index}`}>
              <DataCell>{groupByDepartment ? t.department : t.fullName || t.email}</DataCell>
              {!groupByDepartment && <DataCell muted>{t.department}</DataCell>}
              <DataCell align="right" muted>{t.breaks}</DataCell>
              <DataCell align="right" muted>{t.totalMinutes} min</DataCell>
              <DataCell align="right" muted>{t.averageMinutes} min</DataCell>
              <DataCell align="right" muted>{t.flagged}</DataCell>
            </DataRow>
          ))}
        </DataTable>
      )}
      <Pager paged={paged} noun={groupByDepartment ? "departments" : "people"} />
    </>
  );
}

/**
 * approvalDirectory.ts — reads the `Approval Directory` list over Graph.
 *
 * The client-side equivalent is `src/utils/approvalDirectory.ts`, which goes
 * over SharePoint REST. Only the transport differs; both feed the same
 * `lookupPerson` / `lookupRoleHolder` ports on the shared resolver, and the
 * column names come from the mirrored schema module so the two cannot disagree.
 *
 * Every lookup answers `null` rather than throwing when a person or role is
 * missing. That is deliberate: a directory gap parks one submission for an
 * admin to resolve, and must never be the reason a submission is lost.
 */
import { queryListItems, graphFieldEquals, getListColumns } from "./graphClient.js";
import {
  APPROVAL_DIRECTORY_LIST,
  directoryEmailKey,
  directoryIsUsable,
  mapDirectoryColumns,
  toApprovalDirectoryRow,
  type ApprovalDirectoryRow,
  type DirectoryColumnMap,
} from "./approvalDirectorySchema.js";
import { logWarn } from "./logger.js";

/**
 * One request per distinct address, cached for the life of the invocation.
 * Walking a chain re-reads the same rows (a hop's target becomes the next hop's
 * subject), and a submission with several chain layers walks overlapping paths.
 */
export function createApprovalDirectoryReader(token: string) {
  const people = new Map<string, ApprovalDirectoryRow | null>();
  let columnsPromise: Promise<DirectoryColumnMap | null> | null = null;

  /**
   * The list's real columns. Resolved once rather than assumed: a SharePoint
   * column's internal name rarely equals what somebody typed, and filtering on
   * a name that does not exist fails the request — one mismatched column would
   * otherwise make a correct directory look completely empty.
   *
   * null when the list is absent or too incomplete to answer anything, which is
   * the normal state before the directory is set up.
   */
  function columns(): Promise<DirectoryColumnMap | null> {
    columnsPromise ??= getListColumns(token, APPROVAL_DIRECTORY_LIST)
      .then((available) => mapDirectoryColumns(available.map((column) => ({
        key: column.name,
        aliases: [column.name, column.displayName].filter(Boolean),
      }))))
      .then((map) => (directoryIsUsable(map) ? map : null))
      .catch((error) => {
        logWarn("api:approval-directory", "Could not read directory columns", {
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
    return columnsPromise;
  }

  async function lookupPerson(email: string): Promise<ApprovalDirectoryRow | null> {
    const key = directoryEmailKey(email);
    if (!key) return null;

    const cached = people.get(key);
    if (cached !== undefined) return cached;

    const map = await columns();
    let row: ApprovalDirectoryRow | null = null;
    if (map?.personEmail) {
      try {
        const matches = await queryListItems(token, APPROVAL_DIRECTORY_LIST, {
          filter: graphFieldEquals(map.personEmail, key),
          top: 2,
          preferNonIndexed: true,
        });
        row = matches
          .map((match) => toApprovalDirectoryRow(match.fields, map))
          .find((candidate) => candidate.isActive) ?? null;
      } catch (error) {
        // Treat a failure as "nobody is listed" so chain layers park with a
        // useful message instead of failing the submission outright.
        logWarn("api:approval-directory", "Person lookup failed", {
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    people.set(key, row);
    return row;
  }

  async function lookupRoleHolder(
    department: string,
    role: string,
  ): Promise<{ email: string; name: string } | null> {
    const wantedDepartment = department.trim();
    const wantedRole = role.trim();
    if (!wantedDepartment || !wantedRole) return null;

    const map = await columns();
    // Role lookup needs the two columns describing the post, which are optional
    // for chain routing and so may genuinely be absent.
    if (!map?.department || !map.position) return null;

    try {
      const matches = await queryListItems(token, APPROVAL_DIRECTORY_LIST, {
        filter: [
          graphFieldEquals(map.department, wantedDepartment),
          graphFieldEquals(map.position, wantedRole),
        ].join(" and "),
        top: 2,
        preferNonIndexed: true,
      });
      const holder = matches
        .map((match) => toApprovalDirectoryRow(match.fields, map))
        .find((candidate) => candidate.isActive && candidate.personEmail);
      return holder ? { email: holder.personEmail, name: holder.personName } : null;
    } catch (error) {
      logWarn("api:approval-directory", "Role holder lookup failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  return {
    lookupPerson: async (email: string) => {
      const row = await lookupPerson(email);
      return row
        ? {
          email: row.personEmail,
          name: row.personName,
          department: row.department,
          position: row.position,
          approverEmail: row.approverEmail,
        }
        : null;
    },
    lookupRoleHolder,
  };
}

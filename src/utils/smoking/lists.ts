/**
 * Browser mirror of smoking list names and indexes.
 * This file has no imports to avoid circular dependencies.
 * `src/utils/smoking/schema.ts` imports and re-exports these.
 */

export const SMOKING_LISTS = {
  profiles: "Smoking Profiles",
  log: "Smoking Log",
  areas: "Smoking Areas",
} as const;

/** Every scan filters on these; unindexed they fail once the log passes 5,000 rows. */
export const SMOKING_INDEXES: Record<string, string[]> = {
  [SMOKING_LISTS.profiles]: ["Email"],
  [SMOKING_LISTS.log]: ["Email", "Status", "TimeIn"],
  [SMOKING_LISTS.areas]: ["Code"],
};

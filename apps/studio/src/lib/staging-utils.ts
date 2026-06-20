/** Keep in sync with {@link STAGING_DELETED} in `@forge/core`. */
const STAGING_DELETED = "\0forge:deleted";

export function isStagedDeletion(staged: string): boolean {
  return staged === STAGING_DELETED;
}

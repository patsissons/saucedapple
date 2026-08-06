/**
 * Extracted text shorter than this is treated as a paywall stub. This (not
 * schema.org's isAccessibleForFree marker) is the paywall signal: many
 * sites declare the marker while still shipping full text for SEO, so we
 * always attempt extraction and judge by what actually comes out.
 */
export const MIN_TEXT_LENGTH = 800;

const BLOCKED_STATUSES = new Set([401, 402, 403, 429, 451]);

export function isBlockedStatus(status: number): boolean {
  return BLOCKED_STATUSES.has(status);
}

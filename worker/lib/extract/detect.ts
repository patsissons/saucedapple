/** Extracted text shorter than this is treated as a paywall stub. */
export const MIN_TEXT_LENGTH = 800;

const BLOCKED_STATUSES = new Set([401, 402, 403, 429, 451]);

export function isBlockedStatus(status: number): boolean {
  return BLOCKED_STATUSES.has(status);
}

// Schema.org paywall marker in JSON-LD, e.g. "isAccessibleForFree": false
const PAYWALL_JSONLD_RE = /"isAccessibleForFree"\s*:\s*"?false"?/i;

export function looksPaywalled(html: string): boolean {
  return PAYWALL_JSONLD_RE.test(html);
}

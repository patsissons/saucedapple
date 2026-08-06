export interface AppleNewsRef {
  id: string;
  url: string;
}

// Observed article ids look like "AtPew8L70RNexncdCICfcUg": always a leading
// "A", then base64url-ish characters. Allow some length slack.
const ID_RE = /^A[A-Za-z0-9_-]{10,40}$/;

const HOST_RE = /^((www\.)?apple\.news|news\.apple\.com)$/;

/**
 * Parse user input into an Apple News article reference. Accepts full
 * apple.news / news.apple.com URLs (with or without scheme) or a bare
 * pasted article id. Returns null when the input is not an Apple News link.
 */
export function parseAppleNewsUrl(input: string): AppleNewsRef | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  if (ID_RE.test(trimmed)) {
    return { id: trimmed, url: `https://apple.news/${trimmed}` };
  }

  let url: URL;
  try {
    url = new URL(
      /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
  } catch {
    return null;
  }

  if (!/^https?:$/.test(url.protocol)) return null;
  if (!HOST_RE.test(url.hostname)) return null;

  const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
  if (!ID_RE.test(id)) return null;

  return { id, url: `https://apple.news/${id}` };
}

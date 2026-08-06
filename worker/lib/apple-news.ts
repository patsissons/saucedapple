export interface AppleNewsPage {
  canonicalUrl: string | null;
  title: string | null;
  publisher: string | null;
  description: string | null;
  image: string | null;
}

// Matches redirectToUrl("https://...") and redirectToUrlAfterTimeout("https://...", 0)
// with an actual URL literal — the 404 page only contains the function
// definitions (redirectToUrl(url)), which this deliberately does not match.
const REDIRECT_RE =
  /redirectToUrl(?:AfterTimeout)?\(\s*(["'])(https?:\/\/(?!(?:www\.)?apple\.news)[^"']+)\1/;

// Meta tags in either attribute order: property/name first or content first.
const META_RE =
  /<meta\s+[^>]*?(?:property|name)=["']([a-z:_-]+)["'][^>]*?content=["']([^"']*)["'][^>]*?\/?>|<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']([a-z:_-]+)["'][^>]*?\/?>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function extractMeta(html: string): Map<string, string> {
  const meta = new Map<string, string>();
  for (const match of html.matchAll(META_RE)) {
    const key = (match[1] ?? match[4])?.toLowerCase();
    const content = match[1] != null ? match[2] : match[3];
    if (key && content != null && !meta.has(key)) {
      meta.set(key, decodeEntities(content));
    }
  }
  return meta;
}

// apple.news og:title format is "Article Title — Publisher Name".
const TITLE_SEPARATOR = " — ";

export function splitTitlePublisher(raw: string): {
  title: string;
  publisher: string | null;
} {
  const index = raw.lastIndexOf(TITLE_SEPARATOR);
  if (index === -1) return { title: raw, publisher: null };
  return {
    title: raw.slice(0, index),
    publisher: raw.slice(index + TITLE_SEPARATOR.length),
  };
}

function hostnamePublisher(canonicalUrl: string): string | null {
  try {
    return new URL(canonicalUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** The og:title of apple.news error/landing pages, not a real article. */
const GENERIC_TITLE = "Apple News";

/**
 * Parse an apple.news article page. Returns null when the page is not an
 * article (e.g. the soft-404 landing page, which has neither a redirect URL
 * literal nor an article og:title).
 */
export function parseAppleNewsPage(html: string): AppleNewsPage | null {
  const canonicalUrl = REDIRECT_RE.exec(html)?.[2] ?? null;
  const meta = extractMeta(html);

  const rawTitle = meta.get("og:title") ?? meta.get("twitter:title") ?? null;

  if (
    canonicalUrl === null &&
    (rawTitle === null || rawTitle === GENERIC_TITLE)
  ) {
    return null;
  }

  const { title, publisher } = rawTitle
    ? splitTitlePublisher(rawTitle)
    : { title: null, publisher: null };

  return {
    canonicalUrl,
    title,
    publisher:
      publisher ?? (canonicalUrl ? hostnamePublisher(canonicalUrl) : null),
    description:
      meta.get("og:description") ?? meta.get("twitter:description") ?? null,
    image: meta.get("og:image") ?? meta.get("twitter:image") ?? null,
  };
}

import type { ResolveResponse } from "../../shared/api";

export interface AltLink {
  key: string;
  label: string;
  href: string;
  description: string;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const ARCHIVE_TODAY = "https://archive.ph";
const WAYBACK = "https://web.archive.org/web";

/**
 * Free places to read the story, derived entirely from the resolve payload
 * (no extra API calls). Archives are linked, never fetched server-side.
 */
export function buildAltLinks(article: ResolveResponse): AltLink[] {
  const links: AltLink[] = [];
  const { canonicalUrl, title } = article;

  if (canonicalUrl) {
    const host = hostnameOf(canonicalUrl);

    links.push({
      key: "publisher",
      label: host ?? "Publisher",
      href: canonicalUrl,
      description: "The original article on the publisher's website",
    });
    links.push({
      key: "archive-today",
      label: "archive.today",
      href: `${ARCHIVE_TODAY}/newest/${canonicalUrl}`,
      description: "Newest archive.today snapshot",
    });
    links.push({
      key: "wayback",
      label: "Wayback Machine",
      href: `${WAYBACK}/${canonicalUrl}`,
      description: "Internet Archive snapshot",
    });

    if (title && host) {
      links.push({
        key: "google",
        label: "Google",
        href: `https://www.google.com/search?q=${encodeURIComponent(`"${title}" site:${host}`)}`,
        description: "Find this article via Google",
      });
    }
  }

  if (title) {
    links.push({
      key: "google-news",
      label: "Google News",
      href: `https://news.google.com/search?q=${encodeURIComponent(title)}`,
      description: "Related coverage of the same story",
    });
  }

  return links;
}

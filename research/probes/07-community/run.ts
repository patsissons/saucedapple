// P7 COMMUNITY ARCHIVE MINING — turn a failed extraction into "here's the
// discussion + a working archive link". The elegant part: HN/Reddit commenters
// routinely paste archive.today links, so we surface a working archive.today
// URL WITHOUT our server ever fetching archive.today (which is the product
// invariant — archives are linked, never server-fetched). P4 proved HN Algolia
// is browser-fetchable, so this can run client-side at zero Worker cost.
//
//   npx tsx research/probes/07-community/run.ts

import { loadPublishers } from "../../lib/corpus.ts";
import { politeFetch } from "../../lib/fetcher.ts";
import { emit, type ProbeResult } from "../../lib/metrics.ts";

const PROBE_ID = "P7-community";
const RESULTS = new URL("../../results/07-community.jsonl", import.meta.url)
  .pathname;

const ARCHIVE_LINK_RE =
  /https?:\/\/(archive\.(today|ph|is|li|vn|md)|web\.archive\.org|12ft\.io)\/[^\s"'<>)]+/gi;

interface HnHit {
  objectID: string;
  title?: string;
  url?: string;
  num_comments?: number;
  points?: number;
}

function collectCommentText(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as { text?: string; children?: unknown[] };
  if (typeof n.text === "string") out.push(n.text);
  if (Array.isArray(n.children)) for (const c of n.children) collectCommentText(c, out);
}

async function main(): Promise<void> {
  // Discussion is most valuable for paywalled stories, but check all classes.
  const items = loadPublishers();
  console.error(`P7 community mining over ${items.length} article URLs`);

  for (const item of items) {
    const ts = new Date().toISOString();
    const url = item.canonicalUrl!;
    let subrequests = 0;
    let threadUrl: string | null = null;
    let threadComments = 0;
    const archiveLinks = new Set<string>();
    let redditBlocked = false;

    try {
      // 1. Find an HN submission of this exact URL.
      const search = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(
        url,
      )}&restrictSearchableAttributes=url&hitsPerPage=3`;
      const res = await politeFetch(search, { ua: "polite" });
      subrequests++;
      if (res.ok) {
        const hits = (JSON.parse(res.body) as { hits: HnHit[] }).hits ?? [];
        // Prefer the most-commented matching submission.
        const best = hits
          .filter((h) => h.url && h.url.replace(/\/$/, "") === url.replace(/\/$/, ""))
          .sort((a, b) => (b.num_comments ?? 0) - (a.num_comments ?? 0))[0];
        if (best) {
          threadUrl = `https://news.ycombinator.com/item?id=${best.objectID}`;
          threadComments = best.num_comments ?? 0;
          // 2. Pull the thread and scan comments for archive links.
          if (threadComments > 0) {
            const item2 = await politeFetch(
              `https://hn.algolia.com/api/v1/items/${best.objectID}`,
              { ua: "polite" },
            );
            subrequests++;
            if (item2.ok) {
              const texts: string[] = [];
              collectCommentText(JSON.parse(item2.body), texts);
              for (const t of texts) {
                for (const m of t.matchAll(ARCHIVE_LINK_RE)) archiveLinks.add(m[0]);
              }
            }
          }
        }
      }

      // 3. Reddit (best-effort; datacenter IPs are commonly blocked).
      const reddit = await politeFetch(
        `https://www.reddit.com/api/info.json?url=${encodeURIComponent(url)}`,
        { ua: "chrome", headers: { accept: "application/json" } },
      );
      subrequests++;
      if (reddit.status === 403 || reddit.status === 429) redditBlocked = true;
    } catch (e) {
      // record and continue
      emit(RESULTS, {
        probeId: PROBE_ID,
        corpusId: item.id,
        class: item.class,
        route: "community",
        ok: false,
        subrequests,
        error: (e as Error).message,
        ts,
      });
      console.error(`  ${item.class} ${item.publisherHost} -> ERR ${(e as Error).message}`);
      continue;
    }

    const foundArchive = archiveLinks.size > 0;
    const row: ProbeResult = {
      probeId: PROBE_ID,
      corpusId: item.id,
      class: item.class,
      route: "hn-algolia",
      // "ok" = we surfaced something useful: a discussion thread or, better, a
      // working archive link mined from comments.
      ok: Boolean(threadUrl) || foundArchive,
      subrequests,
      notes: [
        threadUrl ? `thread(${threadComments}c)` : "no-thread",
        foundArchive ? `${archiveLinks.size} archive-links` : "no-archive-links",
        redditBlocked ? "reddit-403" : "",
      ]
        .filter(Boolean)
        .join(" "),
      ts,
    };
    emit(RESULTS, row);
    console.error(
      `  ${item.class} ${item.publisherHost} -> ${row.ok ? "OK" : "none"} ${row.notes}`,
    );
  }
  console.error(`\nWrote results to ${RESULTS}`);
}

main();

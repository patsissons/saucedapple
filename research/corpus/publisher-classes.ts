// Publisher difficulty classification, shared by resolve-corpus and
// build-publishers. Classes reflect how hard the FULL TEXT is to obtain via a
// plain server fetch (not whether the URL is public):
//   A open        - full server-rendered text, no paywall
//   B soft/metered - full text usually present in HTML/JSON-LD despite a meter
//   C hard/bot     - bot-blocks server fetches and/or ships JS shells (WSJ-class)
//   D News+ excl.  - no publisher website at all (assigned only via resolve)
import type { CorpusClass } from "../lib/metrics.ts";

// Exported so P5 (syndication mirror hunt) can reuse this as its list of
// known-open hosts that are safe to fetch as mirror candidates.
export const CLASS_A = [
  "apnews.com",
  "reuters.com",
  "npr.org",
  "bbc.com",
  "bbc.co.uk",
  "arstechnica.com",
  "theverge.com",
  "theguardian.com",
  "cbc.ca",
  "aljazeera.com",
  "propublica.org",
  "techcrunch.com",
];

const CLASS_B = [
  "nytimes.com",
  "washingtonpost.com",
  "theatlantic.com",
  "latimes.com",
  "wired.com",
  "newyorker.com",
  "vox.com",
  "theverge.com",
  "sfchronicle.com",
  "bostonglobe.com",
  "politico.com",
  "vanityfair.com",
];

const CLASS_C = [
  "wsj.com",
  "ft.com",
  "economist.com",
  "barrons.com",
  "businessinsider.com",
  "theinformation.com",
  "bloomberg.com",
  "seekingalpha.com",
  "thetimes.co.uk",
  "telegraph.co.uk",
];

function match(host: string, list: string[]): boolean {
  return list.some((h) => host === h || host.endsWith("." + h));
}

/** Best-effort class for a publisher host. Defaults to B when unknown. */
export function classifyPublisher(host: string | null): CorpusClass {
  if (!host) return "B";
  const h = host.replace(/^www\./, "");
  if (match(h, CLASS_C)) return "C";
  if (match(h, CLASS_A)) return "A";
  if (match(h, CLASS_B)) return "B";
  return "B";
}

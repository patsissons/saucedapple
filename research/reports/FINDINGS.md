# FINDINGS — free alternative-source discovery & transcript extraction

_A graduated fallback system for reading Apple News stories for free. Every
number here is reproducible from `research/results/*.jsonl` via
`npx tsx research/lib/report.ts`; the corpus and probes are in `research/`._

> ### ⚠️ Correction (supersedes the first version of this report)
> An earlier draft claimed r.jina.ai lifted coverage to **86%** and cracked hard
> paywalls (**class C 0→67%**). That was **wrong**: success was scored on jina's
> **raw word count**, which counts navigation, subscription offers, consent
> screens and footers as article text. Re-measured with an article-prose metric
> validated against hand-checked ground truth, **class C is a flat 0%** and the
> real overall gain is **50% → 57%**. Details in
> `research/probes/11-jina-reader/FINDINGS.md`. The lesson is recorded in
> "Method notes" below.

## TL;DR

**No free technique meaningfully beats the current pipeline, and none crack hard
paywalls.** The best candidate, r.jina.ai, recovers **+3 of 42 articles
(50% → 57%)** — zero of them class C. This *confirms* the long-standing
AGENTS.md position rather than overturning it: WSJ-class publishers, and Apple
News+ exclusives, are unservable by free tooling.

The durable value of this program is therefore mostly **negative knowledge** —
eight candidate techniques probed and closed out with evidence — plus a few
cheap, honest enhancements: a JSON-LD CPU fast-path, a structured "read
elsewhere" outlet list, an extra browser-readable archive, and free on-device AI
summaries of text we already have.

## Recommended architecture: a graduated fallback ladder

Try the best route first; fall to the next when a route fails or returns a stub;
show the user honest progress the whole way down. Rungs are ordered by
**expected quality × speed**, cheapest-and-best first.

| # | Rung | Where | Serves | Cost | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | **Publisher fetch + Readability** (+ JSON-LD fast-path) | Worker | class A, ~half of B | ~1 subrequest; JSON-LD parse 0.2 ms vs Readability 31 ms | P0, P2 |
| 2 | **Wayback snapshot** (availability API) | Worker | older/removed articles | 1–2 subrequests | P0/P3 |
| 3 | **r.jina.ai reader** (optional, opt-in) | Browser | +2 of B, +1 of A; **0 of C** | 0 Worker CPU; seconds; 3rd-party + privacy cost | P11, P4 |
| 4 | **"Read elsewhere" list** (Google News `<source>`, Arquivo.pt archive, HN thread) | Worker + Browser | anything with coverage/discussion | cheap; some client-side | P6, P8, P7 |
| 5 | **archive.today link** (human-navigated) | Link only | WSJ-class last resort | none (never fetched) | P10 |
| + | **On-device AI** (Chrome Summarizer): TL;DR / same-story gist | Browser | any text rungs 1–4 produced | free, Chrome-desktop only | P12 |

The ladder degrades to *information* (rung 4/5) rather than a dead end: even when
no transcript is obtainable, the user gets "N outlets covering this + a working
archive." Rungs 3 and the AI bonus are progressive enhancement — they run in the
browser and simply don't fire where unsupported, so the Worker's free-tier
budget is never the bottleneck.

### Coverage the ladder buys (measured, corrected)

| Class | Today (rung 1–2) | + rung 3 (jina) | jina recovers |
| --- | --- | --- | --- |
| A — open | 80% (12/15) | 87% (13/15) | +1 |
| B — soft/metered | 50% (9/18) | 61% (11/18) | +2 |
| C — hard/bot | **0%** | **0%** | **+0** |
| **All** | **50% (21/42)** | **57% (24/42)** | **+3 items** |

jina is not a superset of the baseline: it *loses* 3 articles the current
pipeline extracts, so it only makes sense as an additional fallback, never a
replacement.

### UX for the "it takes longer" reality

jina renders JS, so rung 3 is seconds, not milliseconds. Present it as a visible,
cancellable step — "Reading a clean copy…" → "Trying an archive…" → "Here's the
coverage elsewhere." The user asked for exactly this: slower but far more likely
to end in a readable story, with honest progress. Rungs 1–2 stay instant; the
slow rungs only run when the fast ones fail.

## Ranked candidates

| Rank | Candidate | Verdict | Why |
| --- | --- | --- | --- |
| 1 | **r.jina.ai (client-side)** — P11 | **OPT-IN / PARK** | honest gain is +3 of 42 (50→57%), **0 on class C**; 3rd-party dep, seconds of latency, and it discloses the user's IP + read URL to Jina — weigh against the app's "no tracking" positioning |
| 2 | **JSON-LD fast-path** — P2 | **PROTOTYPE** | no new coverage, but ~150× cheaper than Readability on the 14% of pages that carry `articleBody` |
| 3 | **Same-story "read elsewhere"** — P6 | **PROTOTYPE** | reliable outlet list via Google News `<source>`; a real terminal rung |
| 4 | **Arquivo.pt archive** — P8 | **PROTOTYPE** | 37% of paywalled URLs have a browser-fetchable non-Wayback snapshot (extractability TBD) |
| 5 | **On-device AI summaries** — P12 | **PROTOTYPE** | free Chrome built-in AI for TL;DR / clustering of text we already have |
| 6 | **Community mining** — P7 | **PARK** | invariant-safe archive-link surfacing, but low hit rate on arbitrary articles |
| 7 | **Wayback CDX multi-snapshot** — P3 | **PARK** | untestable on a fresh corpus; needs aged URLs; CDX is slow/throttled |
| 8 | **Browser Rendering** — P9 | **PARK** | runs on Cloudflare infra so it inherits the IP block; 10 min/day cap, unmeterable without storage |
| 9 | **Syndication-mirror hunt** — P5 | **PARK** | superseded by jina; open mirrors rare for non-wire stories |
| — | **archive.today** — P10 | **KEEP AS LINK** | hostile to automation; human-navigated link only (status quo, now evidenced) |
| — | **Apple-native content** — P1 | **DROP** | no credential-free route; apple.news is a redirect shell, news-edge 404s |
| — | Memento aggregator, `?v` cache proxies, `next-data`/AMP, Googlebot spoof | **DROP** | dead services / not in this corpus / ToS-hostile & IP-verified upstream |

## Ship-first roadmap (ordered by value-per-risk)

1. **Rung 1 — JSON-LD fast-path.** Add `extractJsonLdArticle()` beside
   `extractArticle()` in `worker/lib/extract/extract.ts`; try it before
   Readability, fall through on null/short. Pure CPU win, no behavior change
   (see `research/probes/02-structured-data/FINDINGS.md` for the exact sketch).
2. **Rung 4 — structured "read elsewhere".** Server route that queries Google
   News RSS and returns a deduped `[{outlet, url}]` from the `<source>` tags,
   plus an Arquivo.pt availability check; render as a richer alt-links row.
   Upgrades today's single Google News link.
3. **Rung 3 — jina (only if the product accepts the trade).** +3 of 42 articles
   for a third-party dependency that receives the user's IP and read URL. If
   shipped, make it explicit/opt-in, disclose it, and gate on the corrected
   article-prose detection so paywall chrome is never rendered as a transcript.

## Hard limits (record so they aren't re-litigated)

- **News+ exclusives (class D) are unservable by any free technique.** They have
  no publisher URL and Apple exposes no free content route (P1). Correct product
  answer: say so plainly (the app already returns `no_canonical`).
- **Hard paywalls resist everything free.** WSJ returns nothing to any route;
  FT and The Economist return chrome plus at most a free opening paragraph.
  Server fetch (401), Wayback (JS shell), jina (0/9), Browser Rendering
  (Cloudflare IP → 401), archive.today (automation-blocked) all fail. The
  archive.today *link*, clicked by a human, is the only path. This confirms
  AGENTS.md; it is expected, not a bug.
- **CPU budget claim is UNVERIFIED.** Readability parses measured 31 ms median /
  143 ms p90 **on a dev laptop under Node** — that is not workerd, and the app
  demonstrably runs in production today, which is counter-evidence. Do not treat
  "the baseline already blows the 10 ms budget" as established; measure on a real
  Worker before acting on it.

## Method notes & caveats

- **Corpus**: 42 current publisher URLs (RSS, real WSJ/FT/Economist) + 7 live
  apple.news links, classes A–D. Class D is fixture-only and fresh links are
  under-represented — public harvesting skews old. See `research/README.md`.
- **Archive probes (P3/P8) are conservative** here: the fresh RSS corpus has
  little archive coverage yet. Re-run against aged `links.jsonl` URLs before
  judging Wayback/CDX finally.
- **Everything is laptop evidence**; no rung was confirmed from a deployed
  Worker. Publishers block datacenter IPs, so server-side results may differ.
- **jina is a third-party dependency** — rate limit confirmed from its headers as
  20 req/min with a usage-token counter; output is deterministic per call but
  **varies over time** as its cache turns over (an article returned in full in
  one session and as a 329-word preview later).
- **Scoring lesson (the big one).** The first pass scored extraction success on
  raw text length. For Readability output that is fine (it strips chrome), but
  for a whole-page-to-markdown service it silently counts navigation,
  subscription offers and footers as article text — inflating hard-paywall
  "wins" from 0% to an apparent 67%. **Any new extraction route must be scored
  with `research/lib/article-text.ts` and validated against hand-checked ground
  truth before its numbers are believed.**

Per-probe detail: `research/probes/*/FINDINGS.md`. Raw data:
`research/results/*.jsonl`.

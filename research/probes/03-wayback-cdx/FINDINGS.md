# P3 — Wayback CDX multi-snapshot vs production availability API

**Question.** Does querying the CDX API and trying several intelligently chosen
snapshots (earliest / mid / latest, `id_` vs `if_`) beat production's single
`archive.org/wayback/available` call (`worker/lib/wayback.ts
findWaybackSnapshot`) — specifically, do non-newest snapshots recover full text
on paywalled articles where the newest snapshot is a stub?

**Run.** 2026-08-06, all 15 selected article URLs completed (6 C, 7 B, 2 A
controls from `research/corpus/publishers.jsonl`). 32 rows in
`research/results/03-wayback-cdx.jsonl`. Budget spent: **archive.org 15,
web.archive.org 19** (of a 60/host ceiling) — the run was NOT cut short; it
finished cheaply because almost no captures exist for this corpus.

## Scorecard (from `npx tsx research/lib/report.ts P3 P0`)

| Probe | Class A | Class B | Class C | All |
| --- | --- | --- | --- | --- |
| P0-baseline (direct publisher fetch) | 80% (12/15) | 50% (9/18) | 0% (0/9) | 50% (21/42) |
| P3-baseline-availability | 0% (0/2) | 14% (1/7) | 0% (0/6) | 7% (1/15) |
| P3-cdx-multi | 50% (1/2) | 14% (1/7) | 0% (0/6) | 13% (2/15) |

## What actually happened

- **13 of 15 URLs have zero Wayback captures.** The corpus was harvested the
  same day it was probed (RSS, 2026-08-06); the Wayback Machine simply has not
  crawled these day-old article URLs yet. Both strategies fail identically on
  those 13. Every class-C (hard-paywall) URL — WSJ ×2, FT ×2, Economist ×2 —
  had no captures at all.
- **cdx-multi beat baseline-availability on exactly 1 article**:
  `pub-arstechnica.com-4` (class A). The availability API said "no snapshot",
  but CDX returned a same-day capture (`20260806182250`) that extracted OK
  (2,443 chars, 398 words). This is an **availability-API index-lag/coverage
  win, not a snapshot-selection win** — the capture CDX found was the ONLY
  capture.
- **Non-newest-snapshot wins: 0 of 15.** The whole thesis was untestable:
  every URL with any capture had exactly one capture, so earliest = mid =
  latest. There was never a pre-paywall-era snapshot to prefer. A fair test
  needs a corpus of articles that are weeks-to-months old (e.g. the
  apple.news `links.jsonl` items with real `publishedAt` dates).
- **`id_` vs `if_` made no difference** on both testable articles: identical
  extractions (arstechnica 2,443 chars both flags; wired 6,155 chars both
  flags). Readability doesn't care about the Wayback toolbar chrome at these
  sizes.
- **Where both worked (wired-25), they tied**: same single capture
  (`20260806200535`), same 6,155-char extraction.

## Cost

- **Latency**: the availability API answered in 0.14–5.3 s. The CDX API took
  **3.6–13.3 s** on the 9 queries that completed and **timed out at 15 s on 3
  of 15** (wsj-34, wsj-35, washingtonpost-20 — "This operation was aborted").
  Production's Wayback timeout is 8 s (`WAYBACK_TIMEOUT_MS`); 6 of the 12
  completed CDX queries exceeded 8 s. CDX as implemented here would blow the
  Worker's timeout roughly half the time.
- **Subrequests**: baseline = 2/article (availability + snapshot); cdx-multi
  worst case = 5/article (CDX + ≤3 `id_` + 1 `if_`), observed 1–3/article
  because captures were so sparse. Actual totals this run: 34 network
  requests for 15 articles across both strategies.

## Rate limiting observed

**None.** Zero 429/503, no `x-rl` header, over 34 requests — with the
mitigations on: `ua:"polite"` (identifiable UA + contact), ≥3 s per-host
spacing via `politeFetch`, disk cache (1 hit: wired's cdx-earliest URL was
identical to the baseline snapshot URL), and the 60/host `RequestBudget`.
The earlier 503 `x-rl:1` report appears tied to burst/anonymous traffic; slow
identified traffic sailed through. Keep the 3 s spacing.

## Verdict: **PARK**

- The core hypothesis (non-newest snapshot wins on paywalled articles) got
  **zero** supporting evidence — but the corpus couldn't test it: same-day
  articles have 0–1 captures. Re-run P3 against aged articles (links.jsonl
  with `publishedAt` weeks+ old) before any final call.
- What the data does support is small: **CDX can find captures the
  availability API misses** (1/15). But CDX's 3.6–13 s latency and 20%
  timeout rate make it a poor fit for the Worker's 8 s budget and free-tier
  subrequest limits, for a marginal gain on exactly the class (C) where no
  captures exist anyway.
- For this product (fresh Apple News articles), Wayback of any flavor is weak:
  7–13% vs 50% for the direct fetch (P0). Archives lag the news cycle by
  design.

### Integration sketch (only if a re-run on aged corpus shows wins)

In `worker/lib/wayback.ts`, keep the availability call as the fast path; when
it returns no snapshot (today it returns `null` and gives up), add ONE CDX
fallback query with a hard 8 s timeout and a tight query
(`&fl=timestamp,original&filter=statuscode:200&collapse=digest&limit=-3` for
the newest 3), then probe candidates newest-first through the existing
`attemptExtraction` gate (`MIN_TEXT_LENGTH` 800). Skip the `if_` flag — it
measured identical to `id_`. Cache negative CDX results aggressively; each
fallback costs 1–4 extra subrequests and up to 8 s.

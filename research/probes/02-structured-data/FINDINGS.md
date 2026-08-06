# P2 — Structured-data / CMS-API extraction ladder

**Verdict: PARK the ladder; PROTOTYPE `jsonld-articlebody` only — as a CPU
optimization, not a coverage lever.** 156 rows over 42 items in
`results/02-structured-data.jsonl` (live run + `PROBE_REPLAY=1` verified).

## Incremental recovery (the decision metric): 0 of 21

Baseline fails on 21 items (A=3, B=9, C=9). **P2 recovers 0 of them.** Every P2
success is an item Readability already extracts. `P0 ∪ P2` = the baseline,
unchanged (A 80% / B 50% / C 0%).

| Route | Fires (>0w) | Recovers baseline failures (A/B/C) | Note |
| --- | --- | --- | --- |
| `jsonld-articlebody` | 5/42 | 0/3 · 0/9 · 0/9 | only 14% of pages carry a real `articleBody`, all class B |
| `next-data` | 0/42 | — | `__NEXT_DATA__` on no page — App Router killed it |
| `embedded-state` | 3/42 | 0 | BBC/Condé/NYT state blobs; partial (0.5–0.99×) |
| `arc-fusion` | 2/42 | 0 | **the informative failure — see below** |
| `amp` | 0/42 | — | no page carries `rel="amphtml"`; AMP is gone |
| `googlebot-ua`, `google-referer` | 0/24 | 0 | class-C stays 401/403; ToS-hostile; drop |

## Why the premise fails

- **Metered sites do not leak full text in structured form.** Both WaPo
  articles embed Arc XP `globalContent` with `content_elements[]`, but the array
  holds exactly **one** truncated `text` element (22w / 49w). The meter is
  applied server-side *before* the CMS payload is serialized. NYT and the
  Atlantic withhold it the same way. This directly refutes the candidate's
  central hypothesis.
- **Class C fails at the HTTP layer** — WSJ 401, FT/Economist 403 — so there is
  no HTML to parse. UA/referer spoofing changed 0 of 24 statuses; Googlebot is
  verified by reverse DNS, so spoofing from a non-Google IP (and Workers egress
  is nowhere near Google's) just fails. Drop these routes from the final report.

## The one genuine win: CPU

| Parse | median | p90 | max |
| --- | --- | --- | --- |
| Readability (baseline) | **31.6 ms** | 142.7 ms | 155.6 ms |
| `jsonld-articlebody` | **0.2 ms** | 0.5 ms | 0.6 ms |
| whole ladder, summed per item | **1.0 ms** | — | 9.4 ms |

~150× cheaper than Readability at the median. Since the baseline already blows
the ~10 ms CPU budget on **every** request, a JSON-LD fast-path is a real
latency/CPU improvement even though it changes no success/failure outcome.
Fidelity where both succeed: 0.92–0.99× Readability's word count (JSON-LD omits
captions/subheads), so the Readability fallback must stay unconditional.

## Recommendation

- **Drop:** `next-data`, `amp`, `googlebot-ua`, `google-referer` (0 hits; last
  two ToS-hostile and IP-verified upstream).
- **Park:** `arc-fusion` + `embedded-state` — parsers work, but proved the
  payload is pre-truncated. Re-point only if P3/P5/P9 find a fetch context where
  the Arc payload arrives intact.
- **Prototype:** `extractJsonLdArticle(html, sourceUrl): ExtractedArticle|null`
  beside `extractArticle()` in `worker/lib/extract/extract.ts` — regex-scan
  `<script type="application/ld+json">`, tolerant `JSON.parse` (publishers emit
  raw newlines in JSON-LD strings), flatten `@graph`, take the longest
  `articleBody` on an Article node, wrap paragraphs through the existing
  `absolutizeHtml`. `attemptExtraction()` tries it first, falls through to
  Readability on null / below `MIN_TEXT_LENGTH`. Same gate, same shape. Must
  tolerate the 1.5 MB body cap (a clipped JSON-LD block won't parse).

**Class-B/C coverage has to come from P5/P9/P11, not structured data.**

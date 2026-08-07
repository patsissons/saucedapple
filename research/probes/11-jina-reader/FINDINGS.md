# P11 — r.jina.ai reader proxy

**Verdict: MARGINAL — recovers +3 of 42 articles (50% → 57%). It does NOT crack
paywalls.** This file supersedes an earlier version of these findings that
claimed "class C 0% → 67%". That claim was **wrong** — see the correction
below, which is the most important thing on this page.

## The measurement bug (why the first result was wrong)

The first pass scored success on the **raw word count of jina's output**. jina
converts the *whole page* to markdown, so navigation, subscription offers,
related-article teasers, cookie/consent screens, and footers all counted as
"article text". Paywalled pages therefore scored as 900–1300 "word" wins while
containing **zero article prose**. The FT's output, in full, is subscription
and footer boilerplate ("Then $75 per month… © THE FINANCIAL TIMES LTD").

The fix (`research/lib/article-text.ts`) measures **only prose that plausibly
belongs to the article**: paragraphs ≥100 chars, minus chrome/consent/footer
boilerplate; success needs ≥400 article words in ≥3 paragraphs. It was
validated against hand-checked ground truth (open articles must pass,
paywall stubs must fail) before any number below was trusted.

The gap between the two metrics is enormous — e.g. `ft.com` raw **2628 w** vs
article **252 w**; `economist.com` raw **697 w** vs article **0 w**.

## Corrected results

| Class | Baseline | jina | Union | **jina recovers baseline failures** |
| --- | --- | --- | --- | --- |
| A open | 12/15 | 13/15 | 13/15 | **+1** |
| B soft paywall | 9/18 | 8/18 | 11/18 | **+2** |
| C hard paywall | 0/9 | **0/9** | 0/9 | **+0** |
| **All** | **21/42 (50%)** | 21/42 | **24/42 (57%)** | **+3 items** |

- **Class C is a flat zero.** WSJ returns nothing at all; FT and The Economist
  return only chrome plus, at best, the free opening paragraph (47–252 words).
  This **restores the original AGENTS.md position**: WSJ-class hard paywalls are
  unservable by free tooling. My earlier finding wrongly contradicted it.
- **Class B is inconsistent**: Wired/LA Times/New Yorker often come back with
  real full text; NYT is blocked outright (30 words); the Atlantic returns a
  ~330-word preview. Net +2 recoveries, and jina *loses* 3 that the baseline
  gets — it is not a superset.
- Class A is already handled by the baseline, so its wins are near-worthless.

## Other corrected assumptions

- **There is NO "user's residential IP" advantage.** I claimed the client-side
  call wins because it originates from the user's IP. Wrong: the browser cannot
  fetch publishers (CORS), so **jina fetches from its own infrastructure** —
  Google Cloud, per its response headers (`via: 1.1 google`,
  `x-cloud-trace-context`). The publisher sees a datacenter IP either way. The
  only real client-side benefits are **zero Worker CPU and zero subrequests**.
- **Output is deterministic per call** (3 identical repeats) but **varies over
  time** as jina's cache turns over — the Atlantic returned a full article in
  one session and a 329-word preview later. Coverage is not stable.
- **Rate limit confirmed from response headers**: `x-ratelimit-limit = 20, 20;w=60`
  (20 requests/minute), and a `x-usage-tokens` counter — i.e. metered usage that
  could be gated later.

## Recommendation

**Park, or ship only as an explicitly opt-in step.** +3 of 42 articles (7
percentage points) is a real but modest gain, weighed against:

- a **third-party dependency** with a 20 rpm shared limit and shifting terms;
- **seconds of latency** (it renders JS);
- **a privacy cost that conflicts with the product's stated positioning** — the
  app advertises "no account, no tracking", but this sends the user's IP and the
  URL they are reading to Jina AI. That is a product decision, not a technical
  one, and it should be disclosed if shipped.

If shipped, it must use the corrected prose detection — otherwise it renders
FT/NYT paywall boilerplate to users as a "transcript".

## Reproduce

```sh
PROBE_REPLAY=1 npx tsx research/probes/11-jina-reader/run.ts   # offline re-score
npx tsx research/lib/report.ts P11 P0
```

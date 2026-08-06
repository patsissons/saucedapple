# P6 / P7 / P8 — Discovery & lateral routes

These don't extract the exact article; they surface OTHER ways to read the
story. They matter most as the **terminal rungs of the fallback ladder**: when
every extraction route fails, "we couldn't pull the text, but here are N outlets
covering this + a working archive" is far better than a dead end.

## P6 — Same-story discovery (Google News RSS) — **PROTOTYPE**

Corrected mechanic: read each result's publisher from the `<source url="…">`
element (no need to decode Google's opaque redirect links — the trap the first
pass fell into).

- **Reliable outlet identification**: raw distinct other-outlets per story ran
  from a handful up to **60**.
- With a strict same-story headline-token filter (Jaccard ≥ 0.15): **21% of
  articles (9/42)** surfaced ≥3 other outlets clearly on the same story; big
  stories hit 5–11, niche/local stories 0–2.
- **Honest caveats**: Google News RSS median item age ~6.6 days (weak for
  breaking news), and the *open-to-read* subset of same-story outlets was
  usually **0** — coverage exists, but it isn't necessarily free.
- Verdict: prototype. Genuine "read elsewhere" value, low cost, server-side
  only (no ACAO). Upgrade the app's current plain Google News link into a
  structured, deduped outlet list.

## P7 — Community archive mining (HN Algolia / Reddit) — **PARK (cheap bonus)**

- HN thread found for **4/42** arbitrary current articles; **0** archive.today
  links mined from comments; **Reddit 403 on 42/42** (datacenter IP blocked).
- The mechanic is sound and *invariant-safe* — it surfaces archive.today links
  that commenters posted, so our server never fetches archive.today — and P4
  showed HN Algolia is browser-fetchable (zero Worker cost). But hit rate on an
  arbitrary corpus is low; it pays off only for widely-discussed stories.
- Verdict: park as a near-free client-side bonus rung ("discussed on HN →
  here's the thread"), not a load-bearing route. Reddit needs OAuth to be
  usable from a server and isn't worth it.

## P8 — Archive federation (Arquivo.pt / UKWA) — **PROTOTYPE**

- **Arquivo.pt had a snapshot for 10/27 (37%)** of paywalled URLs — meaningful
  supplementary coverage beyond Wayback, and P4 confirmed Arquivo snapshot
  content is **browser-fetchable** (unlike Wayback), so a hit is usable
  client-side at zero Worker cost.
- UKWA TimeMap endpoint returned 0 (endpoint/format likely wrong or gated) —
  dropped.
- **Unverified**: snapshot *existence* ≠ full *text* (Arquivo may have archived
  the paywalled version). A follow-up should extract the Arquivo snapshots and
  score them like P3 before shipping.
- Verdict: prototype — promising as an extra archive rung, pending an
  extractability check.

## Net

Discovery is the safety net, not the win: P6 as a structured "read elsewhere"
list, P8 as an extra browser-readable archive to try, P7 as a free bonus when a
thread exists. All belong at the bottom of the ladder, after extraction routes.

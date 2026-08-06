# P4 — Browser CORS inventory (the client-side gate)

**Verdict: the "do the fetching in the browser" thesis SURVIVES, but reroutes.**
Confirmed with a real headless Chromium doing genuine cross-origin `fetch()`
from an http origin (not `null`), matching the server-side ACAO header scan
exactly.

## Result

| Upstream | Browser can fetch + read? | Client-side use it unlocks |
| --- | --- | --- |
| `archive.org/wayback/available` | ✅ (48 B) | snapshot **URL** only — not content |
| **`web.archive.org/web/…id_/…` (snapshot content)** | ❌ Failed to fetch | — |
| `web.archive.org/cdx` | ❌ Failed to fetch | — |
| `news.google.com/rss` | ❌ Failed to fetch | — |
| **`hn.algolia.com/api`** | ✅ (33 KB) | community archive-link mining |
| `reddit.com/search.json` | ❌ Failed to fetch | — |
| **`r.jina.ai/<url>`** | ✅ (**21 KB readable article text**) | **full extraction in-browser** |
| **`arquivo.pt/wayback/cdx`** | ✅ (307 B) | archive federation in-browser |

## What this means

Two beliefs going in were **wrong**, and one payoff is **bigger** than expected:

1. ❌ **The browser cannot read Wayback snapshot content.** `wayback/available`
   is CORS-open but only yields the snapshot *URL*; the snapshot *body*
   (`…id_/…`) sends no ACAO, so JS can't read it. The "let the user's browser
   pull the archive" idea is dead for Wayback. Archives are a **navigate-to**
   destination (a link), not a **fetch-and-parse** source — which is exactly
   the existing product invariant, now confirmed for Wayback too.

2. ✅ **`r.jina.ai` is fully browser-fetchable** and returned 21 KB of clean
   article text for a live Guardian URL, cross-origin, in-browser. This is the
   headline finding: a client-side extraction route that
   - spends **zero Worker CPU** (dodges the 10 ms budget entirely), and
   - originates from the **user's residential IP** — which routinely beats the
     Worker on publishers that block Cloudflare/datacenter IP ranges.
   It reshapes the ranking: jina (P11) is no longer just a server fallback, it
   has a client-side deployment path. P11 measures its real hit rate.

3. ✅ **HN Algolia and Arquivo.pt are browser-fetchable**, so community
   archive-link mining (P7) and archive federation (P8) can run client-side
   with no Worker cost.

Everything else (Google News RSS, Reddit, Wayback CDX) is **server-side only** —
those must run in the Worker, under its CPU/subrequest budget.

## Reproduce

```sh
npx tsx research/probes/04-cors-inventory/run.ts
```

# P11 — r.jina.ai reader proxy

**Verdict: SHIP (client-side) — the single biggest coverage win in the study.**
r.jina.ai fetches + renders (incl. JS) + extracts an article to clean markdown,
free, no API key. Combined with P4 (it is CORS-open and browser-fetchable), it
has a client-side deployment path that costs the Worker **zero CPU** and fetches
from the **user's residential IP**.

## Result — over the publisher corpus (server-side run)

| Class | Baseline (Readability) | **P11 jina** | Δ |
| --- | --- | --- | --- |
| A (open) | 80% (12/15) | **100% (15/15)** | +20 |
| B (soft/metered) | 50% (9/18) | **78% (14/18)** | +28 |
| C (hard/bot) | **0% (0/9)** | **67% (6/9)** | **+67** |

The class-C wins are **real full text**, not stubs (gate: ≥250 words + no
block-marker): FT 3/3 (3443 / 1626 / 1632 words) and Economist 3/3 (1111 / 967 /
964 words). **WSJ remains impervious** — jina returns a 23-word stub for all
three WSJ URLs, consistent with WSJ being the hardest bot-hardened publisher.

So jina converts the paywall picture from "class C is hopeless" to "class C is
mostly readable except WSJ." That is a category change in what the app can do.

## Why it wins where we can't

- It runs its **own** rendering + fetching infrastructure, so it executes the JS
  shells that defeat our plain fetch, and it isn't fetching from a Cloudflare IP.
- P4 proved the browser can call `r.jina.ai/<url>` directly (21 KB read
  cross-origin), so the **recommended deployment is client-side**: the SPA
  fetches jina, the Worker never touches it. That sidesteps both the 10 ms CPU
  budget and the laptop-vs-Worker IP trap in one move.

## Risks / honesty (the reason it's a fallback rung, not the only strategy)

- **Third-party dependency.** Free tier ~20 rpm, no key today, but terms/limits
  can change; it can rate-limit or disappear. Must degrade gracefully.
- **Latency.** It renders JS, so it is seconds, not milliseconds — acceptable
  as a user-initiated "try harder" step with progress UX, not for an instant
  first paint.
- **Attribution/ToS.** It re-serves publisher content; surface it as a reader
  route with clear provenance, and keep the direct-publisher and archive routes
  ahead of it where they work.
- **WSJ-class still unsolved** — needs P9 (browser rendering) or the
  archive.today link, if anything.

## Integration (fits the graduated fallback ladder)

Client-side rung, after "publisher fetch + Readability" fails or returns a
stub: `fetch(\`https://r.jina.ai/${canonicalUrl}\`)` from the SPA, render the
returned markdown through the existing sanitize path. Show a "fetching a clean
copy…" progress state. Because it's client-side it needs no Worker CPU and no
new server dependency; the only server change is optionally passing the
canonical URL to the client (already in the resolve payload).

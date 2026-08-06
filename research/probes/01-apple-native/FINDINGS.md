# P1 — Apple-native content route

**Verdict: DROP.** No credential-free route to Apple-hosted article text exists.
This was the highest-*ceiling* bet (the only one that could ever serve News+
exclusives or bypass publisher paywalls), but it comes back a clean negative.

## Result

0 full-text successes across **56 anonymous attempts** (7 apple.news articles ×
8 routes). Scored with the same bar as the rest of the harness — Readability
`textLength ≥ 800` — so a JS shell cannot register as a false positive.

| Route | Result |
| --- | --- |
| `apple.news/<id>` (html, `AppleNews` UA, `Accept: application/json`, `?amp=1`) | 200, but always the **~9 KB JS redirect shell** — only `redirectToUrl("<publisher>")`, zero article body |
| `news-edge.apple.com/articles/<id>`, `/v1/articles/<id>`, `/publisher/article/<id>` | **404** `application/json` (~112 B error envelope) for every id |
| `apple.news/<id>/embed`, `apple.news/oembed?url=` | **404** |

### Why it fails

- The public `apple.news/<id>` page is a **pure client-side redirect shell**.
  It contains the publisher canonical URL (which the app already uses) and OG
  card meta — **no article text, no Apple News Format (ANF) JSON, no
  `news-edge` reference**. There is nothing Apple-native to extract from it.
- `news-edge.apple.com` is live and answers unauthenticated at the edge, but
  returns a generic 404 envelope to every article path shape tried. The real
  News app reaches article content through this host **with a signed-in session
  token and a private article-id namespace** — which is exactly the line the
  hard gate forbids: unauthenticated ≠ authorized, and lifting a token from a
  signed-in app would both cross a legal boundary and invalidate the finding.

## Consequence for the program

- **Class D (News+ exclusives) is unservable by any technique in this study.**
  P1 was the only candidate that could have reached articles with no publisher
  website; with P1 dead, the honest product answer for News+ exclusives is
  "there is no free, legitimate transcript route — surface that plainly to the
  user" (the app already returns `no_canonical` for these).
- Removing this speculative top bet early is the point of Phase 1: effort now
  concentrates on the boring-but-real winners (structured data, syndication).

## Reproduce

```sh
npx tsx research/probes/01-apple-native/run.ts
# results/01-apple-native.jsonl -> 0 ok rows
```

_Aside: bare `fetch().text()` against `news-edge.apple.com` throws a Node 25
undici `TransformError` (a content-encoding decode quirk for that host); the
harness fetcher streams raw bytes via a reader and reads the 404 cleanly, which
is how the status was captured._

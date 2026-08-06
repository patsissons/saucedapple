# Research harness — free alternative-source discovery & transcript extraction

This directory is a **self-contained experimentation harness**. Its job is to
prove or disprove candidate techniques for two problems, under one hard rule
(**completely free to operate — no paid APIs, ever**):

1. **Source discovery** — more free routes to the exact article, plus other
   outlets covering the same story.
2. **Transcript extraction** — pull full article text where the current
   pipeline fails (soft paywalls, bot-hardened publishers, News+ exclusives).

The final deliverable is [`reports/FINDINGS.md`](reports/FINDINGS.md): a ranked
list of candidates by measured user value.

> **`research/` is never deployed and never touches the production toolchain.**
> It has its own `tsconfig.json` and is excluded from the root `tsconfig`,
> `vite` test globs, ESLint, and Prettier — so `pnpm validate` is unaffected.
> No file here is imported by `worker/` or `src/`. The Cloudflare Worker's
> asset/entry globs (`wrangler.jsonc`) never reach it. It reuses `worker/lib`
> code read-only, to score every probe against the real production pipeline.

## Running

Everything runs under `tsx` (a devDependency — native Node type-stripping can't
resolve `worker/lib`'s extensionless imports):

```sh
# Rebuild the corpus (hits the network; polite + cached)
npx tsx research/corpus/build-corpus.ts --write      # harvest apple.news links
npx tsx research/corpus/resolve-corpus.ts --write     # resolve + classify -> links.jsonl
npx tsx research/corpus/build-publishers.ts --write   # current article URLs -> publishers.jsonl

# Baseline: replay the current production extraction pipeline
npx tsx research/probes/00-baseline/run.ts

# Any probe
npx tsx research/probes/NN-name/run.ts

# Regenerate the scorecard from results/ (numbers are never hand-typed)
npx tsx research/lib/report.ts            # all probes
npx tsx research/lib/report.ts P2 P3      # selected

# Offline re-scoring (fail on cache miss instead of hitting the network)
PROBE_REPLAY=1 npx tsx research/probes/NN-name/run.ts
```

## Politeness & safety rules (non-negotiable)

Publishers block Cloudflare/datacenter IP ranges, and archives rate-limit
aggressively — a probe that gets our IP banned poisons the well for everyone.

- **Every** outbound request goes through `lib/fetcher.ts` → per-host throttle
  (`lib/ratelimit.ts`): ≥3s between `web.archive.org` calls, ≥1.5s default.
- Responses are disk-cached to `corpus/cache/` (gitignored); re-runs cost zero
  network. Use `PROBE_REPLAY=1` to guarantee offline.
- Archives fetched **only** with the identifiable `polite` UA (contact URL).
- **archive.today is never fetched from anything server-shaped** — it is a
  browser-only path. P10 uses headed Playwright on a residential IP, ≤10
  requests total, and findings are phrased as "surface the link," never "fetch."
- **The Apple-native probe (P1) counts only from a clean, credential-free
  client.** The instant a token from a signed-in News app is involved, the
  candidate is dropped: unauthenticated ≠ authorized.

## Corpus

Two frozen JSONL files under `corpus/`:

- **`links.jsonl`** — real `apple.news` links (harvested via HN Algolia +
  Reddit), resolved to publisher canonical URLs and auto-classified. Drives P1
  and the end-to-end resolve→extract baseline.
- **`publishers.jsonl`** — real *current* publisher article URLs pulled from
  public RSS feeds across classes. The URL is public even when the body is
  paywalled, so this is our route to genuine **class-C** coverage without the
  scarce hard-paywall apple.news links. Drives all extraction probes.

Difficulty classes (by how hard the **full text** is to obtain, not whether the
URL is public):

| Class | Meaning | Examples |
| --- | --- | --- |
| **A** | Open — full server-rendered text | AP, NPR, Ars, Guardian, BBC, ProPublica |
| **B** | Soft / metered — full text usually in HTML/JSON-LD | NYT, WaPo, Atlantic, Wired, LA Times, New Yorker |
| **C** | Hard / bot-hardened — blocks server fetch, JS shells | WSJ, FT, Economist, Barron's, Business Insider |
| **D** | News+ exclusive — **no publisher website at all** | (apple.news links only) |

### Known corpus gaps (be honest in the report)

- **Class D is not represented by live data.** News+ exclusives circulate
  almost exclusively inside the macOS/iOS News app and can't be harvested
  publicly. Only the recorded fixture `worker/lib/__fixtures__/…exclusive…`
  represents this class. **P1 is the only technique that could ever serve
  class D**, so confirming it fully needs a live News+ id captured by hand
  (`Cmd-Opt-C` in the News app). Documented, not hidden.
- **Fresh (<48h) links are under-represented** — public harvesting skews old.
  Age stratification is best-effort; top up by hand before a freshness-
  sensitive re-run.
- **Reddit harvesting 403s from datacenter IPs** — HN Algolia carries the load.

### Gold set (`corpus/gold.jsonl`)

Hand-verified reference: true word count + head/tail fingerprints per article,
so "did we get the **full** transcript" is measured, not guessed. Where a human
hasn't verified an item, the report step uses **best-known word count across all
probes** for that article as the reference (see `lib/score.ts`).

## Scoring

`lib/score.ts` defines success identically for every probe:
`ok = titleGate && wordCount ≥ 0.80 × reference` (reference = gold, else
best-known). `tailMatched` catches silent truncation; `cpuMsParse` times only
the pure-CPU section, because the Worker's budget is **CPU**, not wall-clock.

## Baseline finding (reference bar)

The current production pipeline over `publishers.jsonl`:

| Class A | Class B | Class C |
| --- | --- | --- |
| 80% | 50% | 0% |

And a load-bearing constraint surfaced immediately: **every Readability parse
exceeded 10ms** (median ~31ms, p90 ~143ms on the dev laptop). The AGENTS.md
"~10ms CPU/request" budget is already being exceeded by the baseline, so any
candidate that adds CPU-heavy parsing is suspect until confirmed on the real
Worker (Phase 3.5). This is an open question flagged for the report.

## Probe index

| Probe | Question | Status |
| --- | --- | --- |
| P0 baseline | Current pipeline coverage per class | ✅ A80/B50/C0 |
| P1 apple-native | Free full text via `news-edge.apple.com` / embedded ANF JSON? | ❌ DROP (0/56) |
| P2 structured-data | JSON-LD `articleBody` / `__NEXT_DATA__` / CMS APIs? | ⚠️ PARK (0 recovery; CPU win) |
| P3 wayback-cdx | Do date-aware multi-snapshot picks beat one availability call? | ⚠️ PARK (untestable on fresh corpus) |
| P4 cors-inventory | Which upstreams can the **browser** fetch directly? | ✅ jina/HN/Arquivo open; Wayback closed |
| P5 syndication | Wire/syndicated copies open on Yahoo/MSN/AOL/regional? | ⚠️ PARK (superseded by jina) |
| P6 same-story | Google News for other coverage | 🔶 PROTOTYPE (21% ≥3 outlets) |
| P7 community | HN Algolia / Reddit URL search → archive links | ⚠️ PARK (low yield; invariant-safe) |
| P8 archive-fed | Arquivo.pt / UK Web Archive federation | 🔶 PROTOTYPE (Arquivo 37%, browser-readable) |
| P9 browser-render | Cloudflare Browser Rendering (10 min/day) on class C | ⏳ deploy step |
| P10 archive-today | Browser-only archive.today (≤10 requests, manual) | ⏳ deploy step |
| P11 jina-reader | r.jina.ai free reader hit rate + latency | ✅ **SHIP** (C 0→67%, client-side) |
| P12 client-ai | Chrome built-in AI / WebLLM feasibility | 🔶 PROTOTYPE (post-processing only) |

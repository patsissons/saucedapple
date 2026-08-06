# P5 — Syndication-mirror hunt

**Verdict: PARK — thesis unconfirmed, and P6 data suggests low free yield.**

The idea: a paywalled story often exists in full, open, elsewhere (wire copy on
Yahoo/MSN/AOL, syndication). The probe scored **0 open mirrors across 27 class
B/C items** — but that number is not trustworthy as a refutation, for two
reasons:

1. **Measurement failure.** The probe located candidates via Google News RSS
   then tried to resolve `news.google.com` redirect links to identify the mirror
   host — and Google now serves opaque encoded redirects, so host
   identification failed and the allowlist filter matched nothing. (The fix,
   found while correcting P6, is to read the `<source url="…">` element, which
   names the outlet directly — but by then jina/P6 had covered the ground.)
2. **P6's corrected data shows open mirrors are genuinely rare** for arbitrary
   articles: same-story results were dominated by *other paywalled/niche*
   outlets, with `openOutlets = 0` on most items. Wire stories (AP/Reuters) are
   the exception, but they are a minority of a general corpus.

## Why park rather than pursue

- The strongest form of this idea — "find the SAME article free elsewhere" — is
  **superseded by P11 jina**, which just extracts the paywalled article directly
  (FT/Economist cracked), removing the need to find a mirror at all.
- The weaker form — "surface other outlets" — is **P6's job**, done properly via
  the `<source>` tag.

If revisited: rebuild on the `<source>`-tag mechanism, restrict to wire-detected
stories (AP/Reuters byline), and only for those hunt an open reprint. Expected
yield is modest and it competes with jina, which is why this is parked.

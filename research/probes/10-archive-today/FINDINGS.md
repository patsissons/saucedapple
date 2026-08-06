# P10 — archive.today (browser-only)

**Verdict: KEEP AS A SURFACED LINK (status quo) — cannot be programmatically
used, which validates the existing invariant.**

## Result

Drove a real (headless) Chromium from a residential IP to `archive.ph/newest/…`
for 6 class-C URLs (WSJ ×3, FT ×3), ≤10 navigations, 4s apart. **All six
returned an identical ~101-word page** — an archive.today landing/challenge
stub, not an article snapshot. No article text was retrievable by automation.

## Interpretation

- archive.today is **hostile to any automated/server-shaped access** — even a
  real browser engine driven programmatically gets a challenge/stub. This is
  exactly why AGENTS.md makes it a linked-never-fetched invariant.
- The value it provides is real but **only for a human**: a person clicking the
  archive.today link in their own browser (solving a captcha if shown) may reach
  a snapshot that our automation cannot. archive.today executes JS when
  capturing, so it sometimes holds WSJ-class snapshots nothing else can produce.
- We can neither fetch it server-side nor verify a snapshot exists client-side
  without tripping the challenge. So there is nothing to "extract" — the correct
  product behavior is the current one: **surface the link and let the user's
  browser go there**.

## Consequence

archive.today stays a bottom-of-ladder *link*, presented prominently for
WSJ-class articles (the one class jina can't crack), with copy that sets
expectations ("opens archive.today — may require a captcha"). No server or
client fetch. No change from today's behavior, now with evidence behind it.

# P9 — Cloudflare Browser Rendering (desk-check)

**Verdict: PARK — dominated by client-side jina; not worth the deploy.** This is
the one probe intentionally resolved by reasoning rather than a live run,
because the reasoning is decisive and a live test needs a throwaway
browser-binding Worker deploy that wasn't justified mid-session.

## The argument

1. **It inherits the Cloudflare-IP block.** Browser Rendering runs on
   Cloudflare's own infrastructure, so it fetches target pages from Cloudflare
   IP ranges — the exact ranges bot-hardened publishers block. WSJ returns a
   401 bot-block to *all* server-side fetches (AGENTS.md); Browser Rendering
   executes JS but cannot change the originating IP, so it will very likely hit
   the same 401 / JS-shell. It can only help pages that gate on *JS execution*
   (some class-B shells), not pages that gate on *IP/bot detection* (class C).
2. **jina already covers the JS-shell case, better.** P11 showed r.jina.ai
   cracks FT/Economist and lifts class B to 78% — and P4 proved it runs
   **client-side from the user's residential IP**, which beats both the Worker
   and Browser Rendering on IP-blocked publishers. Anything Browser Rendering
   could render, jina renders too, from a better IP, at zero Worker cost.
3. **The free budget is tiny and unmeterable.** Verified: **10 minutes of
   rendering per day, account-wide** (~60–120 renders, then 429 to 00:00 UTC).
   The app has no KV/D1/R2 to count usage, so a busy morning silently exhausts
   it. A route that can serve maybe 100 users/day and then hard-fails, while
   being dominated by a free client-side option, isn't worth shipping.

## When it could matter

Only if a future need appears that jina can't serve AND that gates on JS rather
than IP (e.g. a specific class-B publisher jina refuses). Then Browser Rendering
becomes a user-initiated, 429-graceful last resort — never automatic. Testing it
then is a ~1-hour throwaway-Worker deploy (pre-approved), scoped to a handful of
renders. Until such a need exists, it stays parked behind jina.

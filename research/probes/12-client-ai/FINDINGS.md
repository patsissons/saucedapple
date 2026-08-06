# P12 — Client-side AI (free, on-device)

**Verdict: PROTOTYPE as progressive enhancement — for post-processing extracted
text, never for fetching blocked content.** AI can't retrieve what a paywall
withholds; its value is making text we ALREADY have more useful (summaries,
same-story clustering, cleanup), for free, on the user's device.

## Result — capability probe (Playwright Chromium, headless)

Even a stock headless Chromium (no special profile) exposes the Chrome built-in
AI surface:

| API | Present | Availability |
| --- | --- | --- |
| `Summarizer` | ✅ | `downloadable` (Gemini Nano fetches on first use) |
| `LanguageModel` (Prompt) | ✅ | `downloadable` |
| `Translator` | ✅ | present |
| `navigator.gpu` (WebGPU → WebLLM) | ✅ | present |
| `WebAssembly` (transformers.js) | ✅ | present |

So the platform is really there in 2026 Chrome. Two free families:

1. **Chrome built-in AI (Gemini Nano)** — on-device, we pay nothing, no key.
   `Summarizer`/`Prompt`/`Translator` are stable in current Chrome. Cost to the
   user: a one-time multi-GB model download, and it's **Chrome-desktop-only**
   (no iOS/Android, no Safari/Firefox) — i.e. zero mobile coverage.
2. **WebLLM / transformers.js** — we ship/CDN a model the browser runs via
   WebGPU/WASM. Works cross-browser but means a large download per session;
   heavier than built-in AI for the same job.

## Honest limits

- **Not an extraction tool.** It cannot get past a paywall or bot wall — it only
  processes text another rung already fetched. It is orthogonal to the coverage
  problem, not a solution to it.
- **Availability is real but partial.** `downloadable` ≠ ready: first use blocks
  on a model download, and the whole thing is desktop-Chrome-only. Must
  feature-detect (`'Summarizer' in window`) and silently no-op elsewhere.
- Headless-Chromium presence is the availability **floor**; real users' Chrome
  channel/OS/hardware decide actual readiness.

## Good free uses (progressive enhancement)

- **Summarize** the extracted transcript ("TL;DR") — `Summarizer` API.
- **Cluster same-story results** from P6 into "here's the gist across N outlets."
- **Clean up** messy extracted markdown before render.

## Integration

Pure client-side, feature-detected: after any rung yields text, if
`'Summarizer' in window`, offer an on-device summary. No Worker involvement, no
key, no cost. Falls away invisibly on unsupported browsers — a bonus rung on the
"we got you text" side of the ladder, not part of the fetch ladder itself.

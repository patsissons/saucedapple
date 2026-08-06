// P12 client-side AI — feasibility + availability, NOT quality. The question:
// can we run useful AI (summarize / clean-up / same-story clustering) for FREE
// on the USER's device, so it costs us nothing and needs no key? Two families:
//   1. Chrome built-in AI (Gemini Nano): Summarizer / LanguageModel (Prompt) /
//      Translator APIs — on-device, no download cost to us, Chrome-only.
//   2. WebLLM / transformers.js: we ship/CDN a model the browser runs via
//      WebGPU/WASM — multi-hundred-MB download, but any browser.
// This probe checks what a real Chromium actually exposes (headless, no flags),
// which is the floor of availability. The landscape assessment is in FINDINGS.
//
//   npx tsx research/probes/12-client-ai/run.ts

import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { emit } from "../../lib/metrics.ts";

const PROBE_ID = "P12-client-ai";
const RESULTS = new URL("../../results/12-client-ai.jsonl", import.meta.url)
  .pathname;

async function probeChromium(flags: string[], label: string) {
  const server = createServer((_r, res) => {
    res.setHeader("content-type", "text/html");
    res.end("<!doctype html><title>ai-probe</title>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;

  const browser = await chromium.launch({ args: flags });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}`);

  // NOTE: no function definitions inside this callback — esbuild (via tsx)
  // injects a `__name` helper for any named/assigned function, and that helper
  // doesn't exist in the page context. Everything here is inline expressions.
  const caps = await page.evaluate(async () => {
    const g = globalThis as Record<string, unknown>;
    let summarizerAvail = "absent";
    try {
      const s = g["Summarizer"] as { availability?: () => Promise<string> };
      if (s?.availability) summarizerAvail = await s.availability();
      else if (s) summarizerAvail = "present";
    } catch (e) {
      summarizerAvail = `err:${(e as Error).message.slice(0, 30)}`;
    }
    let languageModelAvail = "absent";
    try {
      const m = g["LanguageModel"] as { availability?: () => Promise<string> };
      if (m?.availability) languageModelAvail = await m.availability();
      else if (m) languageModelAvail = "present";
    } catch (e) {
      languageModelAvail = `err:${(e as Error).message.slice(0, 30)}`;
    }
    return {
      windowAi: "ai" in g,
      Summarizer: "Summarizer" in g,
      LanguageModel: "LanguageModel" in g,
      Translator: "Translator" in g,
      Writer: "Writer" in g,
      Rewriter: "Rewriter" in g,
      webgpu: "gpu" in (g.navigator as object),
      wasm: typeof (g as { WebAssembly?: unknown }).WebAssembly !== "undefined",
      summarizerAvail,
      languageModelAvail,
    };
  });

  await browser.close();
  server.close();
  return { label, flags, caps };
}

async function main(): Promise<void> {
  const runs = [
    await probeChromium([], "chromium-default"),
    await probeChromium(
      [
        "--enable-features=Summarizer,LanguageModel,BuiltInAIAPI",
        "--optimization-guide-on-device-model-execution",
      ],
      "chromium-ai-flags",
    ),
  ];

  for (const run of runs) {
    const ts = new Date().toISOString();
    const c = run.caps;
    const anyBuiltIn =
      c.Summarizer || c.LanguageModel || c.Translator || c.windowAi;
    emit(RESULTS, {
      probeId: PROBE_ID,
      corpusId: run.label,
      class: "A",
      route: "capability-probe",
      ok: Boolean(anyBuiltIn),
      notes: JSON.stringify(c),
      ts,
    });
    console.error(`\n[${run.label}] flags: ${run.flags.join(" ") || "(none)"}`);
    console.error(`  built-in AI present: ${anyBuiltIn ? "YES" : "no"}`);
    console.error(`  Summarizer=${c.Summarizer}(${c.summarizerAvail}) LanguageModel=${c.LanguageModel}(${c.languageModelAvail}) Translator=${c.Translator}`);
    console.error(`  webgpu(for WebLLM)=${c.webgpu} wasm(for transformers.js)=${c.wasm}`);
  }
  console.error(`\nWrote results to ${RESULTS}`);
  console.error(
    "Note: headless Chromium without the multi-GB Gemini Nano model download is the FLOOR of availability. Real availability depends on the user's Chrome channel/OS/hardware — see FINDINGS.md.",
  );
}

main();

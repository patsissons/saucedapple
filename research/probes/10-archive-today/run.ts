// P10 archive.today — BROWSER-ONLY, by product invariant. archive.today blocks
// server-shaped fetchers, so this probe drives a real headed browser from the
// dev's residential IP, ≤10 total navigations, and its finding is framed as
// "surface the link / let the user's browser go there" — NEVER "fetch it from
// the Worker". We target the one case nothing else solves: WSJ-class hard
// paywalls (jina cracks FT/Economist but not WSJ).
//
//   npx tsx research/probes/10-archive-today/run.ts
//
// SAFETY: hard cap of 10 navigations; only class-C URLs; 4s between loads.

import { chromium } from "@playwright/test";
import { loadPublishers } from "../../lib/corpus.ts";
import { emit, type ProbeResult, wordCount } from "../../lib/metrics.ts";

const PROBE_ID = "P10-archive-today";
const RESULTS = new URL("../../results/10-archive-today.jsonl", import.meta.url)
  .pathname;
const MAX_NAVIGATIONS = 10;
const MIRROR = "https://archive.ph";

async function main(): Promise<void> {
  // Only the hardest class, and only a few — this is a manual-grade check.
  const items = loadPublishers({ classes: ["C"] }).slice(0, 6);
  console.error(
    `P10 archive.today (browser-only, ≤${MAX_NAVIGATIONS} navigations) over ${items.length} class-C URLs`,
  );

  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  let navigations = 0;
  for (const item of items) {
    if (navigations >= MAX_NAVIGATIONS) {
      console.error("  (navigation cap reached — stopping)");
      break;
    }
    const ts = new Date().toISOString();
    const archiveUrl = `${MIRROR}/newest/${item.canonicalUrl}`;
    let row: ProbeResult;
    try {
      navigations++;
      const resp = await page.goto(archiveUrl, {
        waitUntil: "domcontentloaded",
        timeout: 25_000,
      });
      // archive.today may show a snapshot, a "no results" page, or a captcha.
      const status = resp?.status() ?? 0;
      const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
      const words = wordCount(bodyText);
      const noSnapshot = /no results|has not been archived|save this url/i.test(
        bodyText.slice(0, 2000),
      );
      const captcha = /are you human|verify you are|hcaptcha|recaptcha/i.test(
        bodyText.slice(0, 2000),
      );
      // A usable snapshot: substantial article text, not a stub/captcha/empty.
      const ok = !noSnapshot && !captcha && words >= 400;
      row = {
        probeId: PROBE_ID,
        corpusId: item.id,
        class: item.class,
        route: "archive-ph-newest",
        ok,
        httpStatus: status,
        wordCount: words,
        subrequests: 1,
        notes: [
          noSnapshot ? "no-snapshot" : "",
          captcha ? "captcha" : "",
          `nav=${navigations}`,
        ]
          .filter(Boolean)
          .join(" "),
        ts,
      };
      console.error(
        `  ${item.publisherHost} -> ${ok ? "READABLE" : "no"} ${words}w ${row.notes}`,
      );
    } catch (e) {
      row = {
        probeId: PROBE_ID,
        corpusId: item.id,
        class: item.class,
        route: "archive-ph-newest",
        ok: false,
        error: (e as Error).message,
        subrequests: 1,
        ts,
      };
      console.error(`  ${item.publisherHost} -> ERR ${(e as Error).message}`);
    }
    emit(RESULTS, row);
    await new Promise((r) => setTimeout(r, 4_000));
  }

  await browser.close();
  console.error(
    `\nWrote results to ${RESULTS}. Reminder: finding is a LINK to surface, never a server fetch.`,
  );
}

main();

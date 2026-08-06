// P4 CORS INVENTORY — the gate on the whole "do the fetching in the user's
// browser" thesis. A browser fetch from the app origin succeeds only if the
// upstream sends a permissive Access-Control-Allow-Origin AND lets JS read the
// body. Server-side ACAO headers predict this; here we CONFIRM it with a real
// headless Chromium doing genuine cross-origin fetches from an http origin
// (so Origin is a real http origin, not "null").
//
//   npx tsx research/probes/04-cors-inventory/run.ts
//
// Why this matters: if the browser can fetch an upstream directly, that work
// leaves the Worker entirely — zero CPU against the 10ms budget, and the
// request comes from the user's residential IP (publishers block Cloudflare IP
// ranges, so residential frequently wins where the Worker is blocked).

import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { emit } from "../../lib/metrics.ts";

const PROBE_ID = "P4-cors";
const RESULTS = new URL("../../results/04-cors-inventory.jsonl", import.meta.url)
  .pathname;

interface Target {
  name: string;
  url: string;
  clientValue: string;
}

const TARGETS: Target[] = [
  {
    name: "wayback-available",
    url: "https://archive.org/wayback/available?url=nytimes.com",
    clientValue: "gives snapshot URL only (not content)",
  },
  {
    name: "wayback-snapshot-content",
    url: "https://web.archive.org/web/2id_/https://www.theguardian.com/world",
    clientValue: "KEY: reading archived article text in-browser",
  },
  {
    name: "wayback-cdx",
    url: "https://web.archive.org/cdx/search/cdx?url=nytimes.com&limit=1&output=json",
    clientValue: "client-side smart snapshot selection",
  },
  {
    name: "google-news-rss",
    url: "https://news.google.com/rss/search?q=test",
    clientValue: "same-story discovery in-browser",
  },
  {
    name: "hn-algolia",
    url: "https://hn.algolia.com/api/v1/search?query=test",
    clientValue: "community archive-link mining in-browser",
  },
  {
    name: "reddit-json",
    url: "https://www.reddit.com/search.json?q=test",
    clientValue: "community mining in-browser",
  },
  {
    name: "jina-reader",
    url: "https://r.jina.ai/https://www.theguardian.com/world",
    clientValue: "KEY: full extraction in-browser, residential IP, 0 Worker CPU",
  },
  {
    name: "arquivo-cdx",
    url: "https://arquivo.pt/wayback/cdx?url=bbc.com&limit=1",
    clientValue: "archive federation in-browser",
  },
];

interface BrowserFetchResult {
  ok: boolean;
  status: number;
  bodyReadable: boolean;
  len: number;
  error: string | null;
}

async function main(): Promise<void> {
  // A real http origin so cross-origin requests carry a proper Origin header.
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end("<!doctype html><title>cors-probe</title>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const origin = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(origin);

  console.error(`P4: real-browser cross-origin fetch from ${origin}\n`);
  for (const t of TARGETS) {
    const ts = new Date().toISOString();
    const result = (await page.evaluate(async (url: string) => {
      try {
        const res = await fetch(url, { method: "GET" });
        let body = "";
        let bodyReadable = false;
        try {
          body = await res.text();
          bodyReadable = true;
        } catch {
          bodyReadable = false;
        }
        return {
          ok: res.ok,
          status: res.status,
          bodyReadable,
          len: body.length,
          error: null,
        };
      } catch (e) {
        // A CORS block surfaces here as a TypeError with no status.
        return {
          ok: false,
          status: 0,
          bodyReadable: false,
          len: 0,
          error: (e as Error).message,
        };
      }
    }, t.url)) as BrowserFetchResult;

    const browserFetchable = result.bodyReadable && result.len > 0;
    emit(RESULTS, {
      probeId: PROBE_ID,
      corpusId: t.name,
      class: "A",
      route: "browser-fetch",
      ok: browserFetchable,
      httpStatus: result.status,
      bytes: result.len,
      error: result.error ?? undefined,
      notes: t.clientValue,
      ts,
    });
    console.error(
      `  ${browserFetchable ? "✅ CAN" : "❌ cannot"}  ${t.name.padEnd(24)} ${
        result.error ? `(${result.error})` : `http ${result.status}, ${result.len}b`
      }`,
    );
  }

  await browser.close();
  server.close();
  console.error(`\nWrote results to ${RESULTS}`);
}

main();

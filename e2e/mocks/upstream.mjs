// Hermetic upstream mock for e2e: stands in for apple.news, the publisher
// site, and the Wayback Machine so Playwright runs never touch the network.
// The worker is pointed here via the wrangler `e2e` environment vars.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = 8799;
const ORIGIN = `http://127.0.0.1:${PORT}`;

// Ids must satisfy the app's id regex: ^A[A-Za-z0-9_-]{10,40}$
export const FREE_ID = "Ae2eFreeArticle0testXX";
export const EXCLUSIVE_ID = "Ae2eExclusive0testXXXX";
// Resolves to a publisher page too thin to extract and with no Wayback
// snapshot, so /api/extract fails — exercising the client-side reader fallback.
export const PAYWALL_ID = "Ae2ePaywall00testXXXX";

const publisherArticle = readFileSync(
  new URL(
    "../../worker/lib/__fixtures__/publisher-article.html",
    import.meta.url,
  ),
  "utf8",
);

function appleNewsArticle() {
  return `<!DOCTYPE html>
<html><head>
<script>
  function redirectToUrl(url) {}
  redirectToUrl("${ORIGIN}/publisher/article");
</script>
<meta property="og:title" content="How Cider Makers Reinvented an Industry — The Orchard Report" />
<meta property="og:description" content="A wave of small producers began treating cider the way winemakers treat grapes." />
<meta property="og:image" content="${ORIGIN}/publisher/hero.jpg" />
</head><body></body></html>`;
}

function appleNewsExclusive() {
  return `<!DOCTYPE html>
<html><head>
<script>function redirectToUrl(url) {}</script>
<meta property="og:title" content="An Exclusive Story — Apple News+ Magazine" />
<meta property="og:description" content="Only available inside Apple News." />
</head><body></body></html>`;
}

function appleNewsPaywall() {
  return `<!DOCTYPE html>
<html><head>
<script>
  function redirectToUrl(url) {}
  redirectToUrl("${ORIGIN}/publisher/paywalled");
</script>
<meta property="og:title" content="A Paywalled Investigation — The Ledger" />
<meta property="og:description" content="Members only." />
</head><body></body></html>`;
}

function appleNewsNotFound() {
  return `<!DOCTYPE html>
<html><head>
<script>function redirectToUrl(url) {}</script>
<meta property="og:title" content="Apple News" />
</head><body>Story not available.</body></html>`;
}

const ONE_PX_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const server = createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  const send = (status, body, type = "text/html") => {
    res.writeHead(status, { "content-type": type });
    res.end(body);
  };

  if (url.pathname === "/health") {
    return send(200, '{"ok":true}', "application/json");
  }

  if (url.pathname.startsWith("/apple-news/")) {
    const id = url.pathname.split("/")[2] ?? "";
    if (id === FREE_ID) return send(200, appleNewsArticle());
    if (id === EXCLUSIVE_ID) return send(200, appleNewsExclusive());
    if (id === PAYWALL_ID) return send(200, appleNewsPaywall());
    return send(404, appleNewsNotFound());
  }

  if (url.pathname === "/publisher/article") {
    return send(200, publisherArticle);
  }
  if (url.pathname === "/publisher/paywalled") {
    // Too little text to clear MIN_TEXT_LENGTH — extraction fails here.
    return send(
      200,
      "<!DOCTYPE html><html><head><title>Paywalled</title></head>" +
        "<body><article><h1>A Paywalled Investigation</h1>" +
        "<p>Subscribe to continue reading.</p></article></body></html>",
    );
  }
  if (url.pathname === "/publisher/hero.jpg") {
    res.writeHead(200, { "content-type": "image/gif" });
    return res.end(ONE_PX_GIF);
  }

  if (url.pathname === "/wayback/available") {
    return send(200, '{"archived_snapshots":{}}', "application/json");
  }

  // Stands in for Google News RSS so the "read elsewhere" row is hermetic.
  // Item titles echo the query so the same-story similarity filter matches.
  if (url.pathname === "/google-news/rss/search") {
    const query = url.searchParams.get("q") ?? "";
    return send(
      200,
      `<?xml version="1.0"?><rss><channel>` +
        `<item><title>${query}</title>` +
        `<source url="https://www.reuters.com">Reuters</source></item>` +
        `<item><title>${query} — analysis</title>` +
        `<source url="https://www.npr.org">NPR</source></item>` +
        `</channel></rss>`,
      "application/xml",
    );
  }

  return send(404, "not found", "text/plain");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`e2e upstream mock listening on ${ORIGIN}`);
});

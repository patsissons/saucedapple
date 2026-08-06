import { parseHTML } from "linkedom/worker";

function absolutize(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function absolutizeSrcset(value: string, baseUrl: string): string {
  return value
    .split(",")
    .map((entry) => {
      const [url, ...descriptor] = entry.trim().split(/\s+/);
      return url ? [absolutize(url, baseUrl), ...descriptor].join(" ") : entry;
    })
    .join(", ");
}

/** Rewrite relative link/image URLs in an HTML fragment against baseUrl. */
export function absolutizeHtml(html: string, baseUrl: string): string {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);

  for (const anchor of document.querySelectorAll("a[href]")) {
    anchor.setAttribute(
      "href",
      absolutize(anchor.getAttribute("href") ?? "", baseUrl),
    );
  }
  for (const el of document.querySelectorAll("img[src], source[src]")) {
    el.setAttribute("src", absolutize(el.getAttribute("src") ?? "", baseUrl));
  }
  for (const el of document.querySelectorAll("img[srcset], source[srcset]")) {
    el.setAttribute(
      "srcset",
      absolutizeSrcset(el.getAttribute("srcset") ?? "", baseUrl),
    );
  }

  return document.body.innerHTML;
}

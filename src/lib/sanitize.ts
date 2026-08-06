import DOMPurify from "dompurify";

const purify = DOMPurify();

const HTTP_RE = /^https?:/i;

purify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }

  // DOMPurify permits data: URIs on img regardless of ALLOWED_URI_REGEXP;
  // article images must be plain http(s).
  const src = node.getAttribute("src");
  if (src && !HTTP_RE.test(src.trim())) {
    node.removeAttribute("src");
  }
  const srcset = node.getAttribute("srcset");
  if (
    srcset &&
    !srcset
      .split(",")
      .every((entry) => HTTP_RE.test(entry.trim().split(/\s+/)[0] ?? ""))
  ) {
    node.removeAttribute("srcset");
  }
});

/**
 * Sanitize extracted article HTML before rendering. ExtractResponse.html is
 * untrusted publisher markup — NEVER render it without going through here.
 */
export function sanitizeArticleHtml(html: string): string {
  return purify.sanitize(html, {
    ALLOWED_TAGS: [
      "a",
      "abbr",
      "aside",
      "b",
      "blockquote",
      "br",
      "caption",
      "cite",
      "code",
      "div",
      "em",
      "figcaption",
      "figure",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "i",
      "img",
      "li",
      "mark",
      "ol",
      "p",
      "picture",
      "pre",
      "q",
      "s",
      "small",
      "source",
      "span",
      "strong",
      "sub",
      "sup",
      "table",
      "tbody",
      "td",
      "tfoot",
      "th",
      "thead",
      "time",
      "tr",
      "u",
      "ul",
    ],
    ALLOWED_ATTR: [
      "alt",
      "cite",
      "colspan",
      "datetime",
      "height",
      "href",
      "loading",
      "media",
      "rel",
      "rowspan",
      "sizes",
      "src",
      "srcset",
      "target",
      "title",
      "width",
    ],
    ALLOWED_URI_REGEXP: /^https?:/i,
  });
}

// Honest article-body measurement.
//
// WHY THIS EXISTS: P11's first pass scored success on the RAW word count of
// r.jina.ai's output. That was wrong — jina returns the whole page converted to
// markdown, so navigation, subscription offers, related-article teasers, cookie
// notices and footers all counted as "article text". Paywalled pages therefore
// scored as 900+ "word" wins while containing zero article prose (FT's output
// is literally "Then $75 per month… © THE FINANCIAL TIMES LTD").
//
// This module measures only PROSE THAT PLAUSIBLY BELONGS TO THE ARTICLE, so a
// paywall stub can't masquerade as a transcript.

/**
 * Boilerplate that appears in page chrome but not in article prose. Includes
 * consent/privacy-wall vocabulary: some publishers (e.g. Wired) serve a
 * multi-paragraph CCPA/GDPR consent screen that is long, prose-shaped, and
 * would otherwise sail past a pure length gate.
 */
const CHROME_RE =
  /\b(subscribe|subscriptions?|digital access|per month|per week|per year|cancel anytime|free trial|sign in|log in|create an account|newsletters?|cookies?|privacy (policy|center|rights)|personal information|targeted advertising|opt[- ]out|do not sell|consent|terms of (use|service)|all rights reserved|trademarks? of|registered office|vat reg|advertise with|follow us on|download the app|app store|google play|most popular|related stories|read more|share this|skip to content)\b/i;

/** © lines, nav rails, and menu dumps that survive the length filter. */
const FOOTER_RE = /©|\ball rights reserved\b|\bregistered in england\b/i;

/** A paragraph must be at least this long to count as prose. */
const MIN_PARAGRAPH_CHARS = 100;

export interface ProseAnalysis {
  /** Words in paragraphs that look like article prose. */
  articleWords: number;
  /** Count of article-prose paragraphs. */
  articleParagraphs: number;
  /** Paragraphs rejected as chrome/boilerplate. */
  chromeParagraphs: number;
  /** Raw word count over everything — the OLD, inflated metric. */
  rawWords: number;
  /** First article paragraph, for eyeballing correctness. */
  sample: string;
}

/** Markdown (or HTML) -> plain text, dropping link/image syntax. */
export function toPlainText(input: string): string {
  return input
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> label
    .replace(/<[^>]+>/g, " ") // stray html
    .replace(/[#>*_`]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function words(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Analyze a document (jina markdown, or any text) for genuine article prose.
 * Paragraph-per-line, which is how jina emits markdown.
 */
export function analyzeProse(input: string): ProseAnalysis {
  const lines = input.split("\n").map(toPlainText);
  const paragraphs = lines.filter((l) => l.length >= MIN_PARAGRAPH_CHARS);

  const article: string[] = [];
  let chromeParagraphs = 0;
  for (const p of paragraphs) {
    if (CHROME_RE.test(p) || FOOTER_RE.test(p)) {
      chromeParagraphs++;
      continue;
    }
    article.push(p);
  }

  return {
    articleWords: words(article.join(" ")),
    articleParagraphs: article.length,
    chromeParagraphs,
    rawWords: words(toPlainText(input)),
    sample: article[0]?.slice(0, 160) ?? "",
  };
}

/** Minimum real prose for a document to count as a usable transcript. */
export const MIN_ARTICLE_WORDS = 400;
export const MIN_ARTICLE_PARAGRAPHS = 3;

export function isUsableTranscript(analysis: ProseAnalysis): boolean {
  return (
    analysis.articleWords >= MIN_ARTICLE_WORDS &&
    analysis.articleParagraphs >= MIN_ARTICLE_PARAGRAPHS
  );
}

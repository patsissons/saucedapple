export interface ResolveResponse {
  id: string;
  appleNewsUrl: string;
  /** null means the article has no publisher website (News+ exclusive). */
  canonicalUrl: string | null;
  title: string | null;
  publisher: string | null;
  description: string | null;
  image: string | null;
}

export interface ExtractResponse {
  source: "publisher" | "wayback";
  sourceUrl: string;
  title: string | null;
  byline: string | null;
  excerpt: string | null;
  /**
   * Readability output. NOT sanitized — clients MUST run it through
   * sanitizeArticleHtml() before rendering.
   */
  html: string;
  textLength: number;
}

export type ErrorCode =
  | "invalid_url"
  | "not_found"
  | "no_canonical"
  | "upstream_error"
  | "upstream_timeout"
  | "extraction_failed";

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
  };
}

import type {
  ApiError,
  ErrorCode,
  ExtractResponse,
  ResolveResponse,
} from "../../shared/api";

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; code: ErrorCode; message: string };

async function getJson<T>(path: string, url: string): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${path}?url=${encodeURIComponent(url)}`);
  } catch {
    return {
      ok: false,
      code: "upstream_error",
      message: "Network error — please try again",
    };
  }

  if (!response.ok) {
    try {
      const body = (await response.json()) as ApiError;
      return { ok: false, ...body.error };
    } catch {
      return {
        ok: false,
        code: "upstream_error",
        message: `Unexpected ${response.status} from the API`,
      };
    }
  }

  return { ok: true, data: (await response.json()) as T };
}

export function resolveArticle(
  url: string,
): Promise<ApiResult<ResolveResponse>> {
  return getJson<ResolveResponse>("/api/resolve", url);
}

export function extractArticle(
  url: string,
): Promise<ApiResult<ExtractResponse>> {
  return getJson<ExtractResponse>("/api/extract", url);
}

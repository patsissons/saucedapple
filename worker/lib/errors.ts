import type { ApiError, ErrorCode } from "../../shared/api";

const STATUS: Record<ErrorCode, number> = {
  invalid_url: 400,
  not_found: 404,
  no_canonical: 422,
  extraction_failed: 422,
  upstream_error: 502,
  upstream_timeout: 504,
};

export function errorResponse(code: ErrorCode, message: string): Response {
  const body: ApiError = { error: { code, message } };
  return Response.json(body, { status: STATUS[code] });
}

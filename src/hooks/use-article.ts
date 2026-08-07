import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolveResponse } from "../../shared/api";
import {
  parseAppleNewsUrl,
  parseArticleParams,
} from "../../shared/apple-news-url";
import { resolveArticle } from "@/lib/api";

export type ArticleState =
  | { status: "idle" }
  | { status: "loading"; url: string }
  | { status: "resolved"; url: string; article: ResolveResponse }
  | { status: "error"; url: string; code: string; message: string };

/** Build the canonical permalink for an article id. */
function permalinkFor(id: string): URL {
  const target = new URL(window.location.href);
  target.search = "";
  target.searchParams.set("id", id);
  return target;
}

/**
 * Resolve-state machine synced with the ?id= query param: submitting pushes a
 * permalink, and loading a permalink (or navigating history) resolves
 * automatically. Legacy ?url= permalinks still resolve and are rewritten to
 * ?id= in place, so old shared links keep working but stop propagating.
 */
export function useArticle() {
  const [state, setState] = useState<ArticleState>({ status: "idle" });
  const requestSeq = useRef(0);

  const resolve = useCallback(async (input: string) => {
    const parsed = parseAppleNewsUrl(input);
    if (!parsed) {
      setState({
        status: "error",
        url: input,
        code: "invalid_url",
        message: "That doesn't look like an Apple News link",
      });
      return;
    }

    const seq = ++requestSeq.current;
    setState({ status: "loading", url: parsed.url });
    const result = await resolveArticle(parsed.url);
    if (seq !== requestSeq.current) return; // superseded by a newer request

    if (result.ok) {
      setState({ status: "resolved", url: parsed.url, article: result.data });
    } else {
      setState({
        status: "error",
        url: parsed.url,
        code: result.code,
        message: result.message,
      });
    }
  }, []);

  const submit = useCallback(
    (input: string) => {
      const parsed = parseAppleNewsUrl(input);
      if (parsed) {
        const target = permalinkFor(parsed.id);
        if (target.href !== window.location.href) {
          window.history.pushState({}, "", target);
        }
      }
      void resolve(input);
    },
    [resolve],
  );

  useEffect(() => {
    const fromLocation = () => {
      const params = new URL(window.location.href).searchParams;
      const parsed = parseArticleParams(params);
      if (!parsed) {
        setState({ status: "idle" });
        return;
      }
      // Normalize a legacy ?url= permalink to ?id= without adding history.
      if (!params.has("id")) {
        window.history.replaceState({}, "", permalinkFor(parsed.id));
      }
      void resolve(parsed.url);
    };
    fromLocation();
    window.addEventListener("popstate", fromLocation);
    return () => window.removeEventListener("popstate", fromLocation);
  }, [resolve]);

  return { state, submit };
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolveResponse } from "../../shared/api";
import { parseAppleNewsUrl } from "../../shared/apple-news-url";
import { resolveArticle } from "@/lib/api";

export type ArticleState =
  | { status: "idle" }
  | { status: "loading"; url: string }
  | { status: "resolved"; url: string; article: ResolveResponse }
  | { status: "error"; url: string; code: string; message: string };

function urlFromLocation(): string | null {
  return new URL(window.location.href).searchParams.get("url");
}

/**
 * Resolve-state machine synced with the ?url= query param: submitting
 * pushes a permalink, and loading a permalink (or navigating history)
 * resolves automatically.
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
      const canonical = parsed?.url ?? input;
      const target = new URL(window.location.href);
      target.search = "";
      target.searchParams.set("url", canonical);
      if (target.href !== window.location.href) {
        window.history.pushState({}, "", target);
      }
      void resolve(input);
    },
    [resolve],
  );

  useEffect(() => {
    const fromLocation = () => {
      const url = urlFromLocation();
      if (url) {
        void resolve(url);
      } else {
        setState({ status: "idle" });
      }
    };
    fromLocation();
    window.addEventListener("popstate", fromLocation);
    return () => window.removeEventListener("popstate", fromLocation);
  }, [resolve]);

  return { state, submit };
}

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { extractArticle } from "@/lib/api";
import { extractViaReader } from "@/lib/jina";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";

type Source = "publisher" | "wayback" | "reader";

interface Transcript {
  source: Source;
  sourceUrl: string;
  byline: string | null;
  html: string;
}

type ReaderState =
  | { status: "collapsed" }
  | { status: "loading" }
  | { status: "loading-reader" }
  | { status: "loaded"; transcript: Transcript }
  | { status: "failed"; message: string };

const SOURCE_LABEL: Record<Source, string> = {
  publisher: "the publisher's site",
  wayback: "a Wayback Machine snapshot",
  reader: "a reader view (r.jina.ai)",
};

export function ReaderView({
  appleNewsUrl,
  canonicalUrl,
}: {
  appleNewsUrl: string;
  canonicalUrl: string;
}) {
  const [state, setState] = useState<ReaderState>({ status: "collapsed" });
  const [open, setOpen] = useState(false);

  async function load() {
    // Rung 1–2: the Worker's own extraction (publisher page, then Wayback).
    setState({ status: "loading" });
    const extracted = await extractArticle(appleNewsUrl);
    if (extracted.ok) {
      setState({
        status: "loaded",
        transcript: {
          source: extracted.data.source,
          sourceUrl: extracted.data.sourceUrl,
          byline: extracted.data.byline,
          html: extracted.data.html,
        },
      });
      return;
    }

    // Rung 3: client-side reader from the user's own IP, zero Worker cost.
    setState({ status: "loading-reader" });
    const reader = await extractViaReader(canonicalUrl);
    if (reader.ok) {
      setState({
        status: "loaded",
        transcript: {
          source: "reader",
          sourceUrl: reader.data.sourceUrl,
          byline: null,
          html: reader.data.html,
        },
      });
      return;
    }

    setState({
      status: "failed",
      message:
        "Couldn't pull the article text — try one of the links above instead.",
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && state.status === "collapsed") void load();
  }

  const loading =
    state.status === "loading" || state.status === "loading-reader";

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} className="w-full">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400"
        >
          <ChevronDown
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
          {open ? "Hide transcript" : "Read transcript"}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">
        {loading && (
          <div className="space-y-3" aria-label="Loading article text">
            {state.status === "loading-reader" && (
              <p className="text-muted-foreground text-sm">
                Fetching a clean copy from the reader… this can take a few
                seconds.
              </p>
            )}
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-full" />
          </div>
        )}
        {state.status === "failed" && (
          <p className="text-muted-foreground text-sm">{state.message}</p>
        )}
        {state.status === "loaded" && (
          <article>
            {state.transcript.byline && (
              <p className="text-muted-foreground mb-2 text-sm">
                {state.transcript.byline}
              </p>
            )}
            <div
              className="prose prose-neutral dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{
                __html: sanitizeArticleHtml(state.transcript.html),
              }}
            />
            <p className="text-muted-foreground mt-4 text-xs">
              Extracted from{" "}
              <a
                href={state.transcript.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {SOURCE_LABEL[state.transcript.source]}
              </a>
              .
            </p>
          </article>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

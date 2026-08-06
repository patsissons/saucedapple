import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ExtractResponse } from "../../shared/api";
import { extractArticle, type ApiResult } from "@/lib/api";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";

type ReaderState =
  | { status: "collapsed" }
  | { status: "loading" }
  | { status: "loaded"; extract: ExtractResponse }
  | { status: "failed"; message: string };

export function ReaderView({ appleNewsUrl }: { appleNewsUrl: string }) {
  const [state, setState] = useState<ReaderState>({ status: "collapsed" });
  const [open, setOpen] = useState(false);

  async function load() {
    setState({ status: "loading" });
    const result: ApiResult<ExtractResponse> =
      await extractArticle(appleNewsUrl);
    if (result.ok) {
      setState({ status: "loaded", extract: result.data });
    } else {
      setState({
        status: "failed",
        message:
          "Couldn't pull the article text — try one of the links above instead.",
      });
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && state.status === "collapsed") void load();
  }

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} className="w-full">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <ChevronDown
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
          {open ? "hide transcript" : "read transcript"}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">
        {state.status === "loading" && (
          <div className="space-y-3" aria-label="Loading article text">
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
            {state.extract.byline && (
              <p className="text-muted-foreground mb-2 text-sm">
                {state.extract.byline}
              </p>
            )}
            <div
              className="prose prose-neutral dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{
                __html: sanitizeArticleHtml(state.extract.html),
              }}
            />
            <p className="text-muted-foreground mt-4 text-xs">
              Extracted from{" "}
              <a
                href={state.extract.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {state.extract.source === "wayback"
                  ? "a Wayback Machine snapshot"
                  : "the publisher's site"}
              </a>
              .
            </p>
          </article>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

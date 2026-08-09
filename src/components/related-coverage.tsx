import { useEffect, useState } from "react";
import { Newspaper } from "lucide-react";
import type { RelatedOutlet } from "../../shared/api";
import { fetchRelated } from "@/lib/api";

// Always shown for a resolved article (when coverage exists), including
// Apple News+ exclusives with no publisher site — for those, other outlets'
// coverage is often the only free way into the story.
export function RelatedCoverage({ appleNewsUrl }: { appleNewsUrl: string }) {
  const [outlets, setOutlets] = useState<RelatedOutlet[] | null>(null);

  useEffect(() => {
    let active = true;
    void fetchRelated(appleNewsUrl).then((result) => {
      if (!active) return;
      setOutlets(result.ok ? result.data.outlets : []);
    });
    return () => {
      active = false;
    };
  }, [appleNewsUrl]);

  // Render nothing while loading or when there is no coverage to show —
  // an empty "related coverage" heading is worse than silence.
  if (!outlets || outlets.length === 0) return null;

  return (
    <div className="w-full">
      <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-sm">
        <Newspaper className="size-4" />
        Other outlets covering this story
      </p>
      <ul className="space-y-1.5">
        {outlets.map((outlet) => (
          <li key={outlet.host}>
            <a
              href={outlet.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-amber-600 dark:hover:text-amber-400"
            >
              <span className="text-sm font-medium">{outlet.outlet}</span>
              <span className="text-muted-foreground ml-2 text-xs">
                {outlet.title}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

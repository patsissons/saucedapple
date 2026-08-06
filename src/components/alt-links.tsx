import type { ResolveResponse } from "../../shared/api";
import { buildAltLinks } from "@/lib/alt-links";
import { Button } from "@/components/ui/button";

export function AltLinks({ article }: { article: ResolveResponse }) {
  const links = buildAltLinks(article);
  if (links.length === 0) return null;

  return (
    <section aria-label="Places to read this story" className="w-full">
      <h2 className="text-muted-foreground mb-2 text-sm font-medium">
        Read it at
      </h2>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Button
            key={link.key}
            variant="outline"
            size="sm"
            asChild
            className="hover:border-amber-500/70 hover:text-amber-700 dark:hover:border-amber-500/70 dark:hover:text-amber-400"
          >
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              title={link.description}
            >
              {link.label}
            </a>
          </Button>
        ))}
      </div>
    </section>
  );
}

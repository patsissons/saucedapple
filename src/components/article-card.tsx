import { useState } from "react";
import type { ResolveResponse } from "../../shared/api";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ArticleCard({ article }: { article: ResolveResponse }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <Card className="w-full overflow-hidden pt-0">
      {article.image && !imageFailed && (
        <img
          src={article.image}
          alt=""
          loading="lazy"
          className="max-h-56 w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      )}
      <CardHeader className="pt-6">
        <div className="flex items-center gap-2">
          {article.publisher && (
            <Badge variant="secondary">{article.publisher}</Badge>
          )}
        </div>
        <CardTitle className="text-xl leading-snug">
          {article.title ?? "Untitled article"}
        </CardTitle>
        {article.description && (
          <CardDescription>{article.description}</CardDescription>
        )}
      </CardHeader>
      {article.canonicalUrl === null && (
        <CardContent>
          <p className="text-muted-foreground text-sm">
            This looks like an Apple News+ exclusive — it has no publisher
            website, so it can only be read in{" "}
            <a
              href={article.appleNewsUrl}
              className="underline underline-offset-2"
            >
              Apple News
            </a>
            .
          </p>
        </CardContent>
      )}
    </Card>
  );
}

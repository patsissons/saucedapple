import { AlertCircle } from "lucide-react";
import { AltLinks } from "@/components/alt-links";
import { Logo } from "@/components/logo";
import { PageActions } from "@/components/page-actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArticleCard } from "@/components/article-card";
import { ReaderView } from "@/components/reader-view";
import { UrlForm } from "@/components/url-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useArticle } from "@/hooks/use-article";

const ERROR_TITLES: Record<string, string> = {
  invalid_url: "Not an Apple News link",
  not_found: "Article not found",
  upstream_error: "Apple News is unreachable",
  upstream_timeout: "Apple News took too long",
};

export default function App() {
  const { state, submit } = useArticle();

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-xl flex-col px-4">
      <div className="fixed top-4 right-4 flex items-center gap-1">
        <PageActions />
        <ThemeToggle />
      </div>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 py-12">
        <header className="flex flex-col items-center text-center">
          <Logo className="mb-3 size-20" />
          <h1 className="text-4xl font-bold tracking-tight">
            sauced <span className="text-red-500">apple</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Read Apple News links without a subscription
          </p>
        </header>

        <UrlForm
          initialValue={state.status === "idle" ? "" : state.url}
          busy={state.status === "loading"}
          onSubmit={submit}
        />

        {state.status === "loading" && (
          <div className="w-full space-y-3" aria-label="Resolving article">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}

        {state.status === "error" && (
          <Alert variant="destructive" className="w-full">
            <AlertCircle className="size-4" />
            <AlertTitle>
              {ERROR_TITLES[state.code] ?? "Something went wrong"}
            </AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        {state.status === "resolved" && (
          <div className="flex w-full flex-col gap-4">
            <ArticleCard article={state.article} />
            {state.article.canonicalUrl && (
              <>
                <AltLinks article={state.article} />
                <ReaderView appleNewsUrl={state.article.appleNewsUrl} />
              </>
            )}
          </div>
        )}
      </main>

      <footer className="text-muted-foreground pb-6 text-center text-xs">
        <p>
          Paste an apple.news link to find free ways to read the story — the
          publisher's own page, public archives, or an extracted transcript. No
          account, no tracking.
        </p>
      </footer>
    </div>
  );
}

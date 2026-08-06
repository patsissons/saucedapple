import { Check, Link as LinkIcon, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Share / copy-link buttons for the current page (permalink-aware). */
export function PageActions() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (permissions/insecure context) — no feedback
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: document.title,
          url: window.location.href,
        });
      } catch {
        // user dismissed the share sheet
      }
    } else {
      await copy();
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={share}
        aria-label="Share this page"
      >
        <Share2 className="size-5" />
      </Button>
      <Button variant="ghost" size="icon" onClick={copy} aria-label="Copy link">
        {copied ? (
          <Check className="size-5 text-green-500" />
        ) : (
          <LinkIcon className="size-5" />
        )}
      </Button>
    </>
  );
}

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface UrlFormProps {
  initialValue: string;
  busy: boolean;
  onSubmit: (url: string) => void;
}

export function UrlForm({ initialValue, busy, onSubmit }: UrlFormProps) {
  const [value, setValue] = useState(initialValue);

  // Adopt a new initial value (e.g. a permalink resolving) by adjusting
  // state during render — React's recommended alternative to an effect.
  const [prevInitial, setPrevInitial] = useState(initialValue);
  if (initialValue !== prevInitial) {
    setPrevInitial(initialValue);
    if (initialValue) setValue(initialValue);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full gap-2">
      <Input
        type="text"
        inputMode="url"
        placeholder="https://apple.news/… or an article id"
        aria-label="Apple News link"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoFocus
      />
      <Button type="submit" disabled={busy || value.trim() === ""}>
        {busy ? "Saucing…" : "Sauce it!"}
      </Button>
    </form>
  );
}

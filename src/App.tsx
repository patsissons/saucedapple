import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-bold tracking-tight">saucedapple</h1>
      <p className="text-muted-foreground">
        Vite + React + Tailwind + shadcn/ui
      </p>
      <Button onClick={() => setCount((c) => c + 1)}>Count is {count}</Button>
    </main>
  );
}

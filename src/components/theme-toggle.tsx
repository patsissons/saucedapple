import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const { toggle } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle theme"
      className="hover:text-amber-600 dark:hover:text-amber-400"
    >
      <Sun className="size-5 scale-100 rotate-0 transition-all duration-500 dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute size-5 scale-0 rotate-90 transition-all duration-500 dark:scale-100 dark:rotate-0" />
    </Button>
  );
}

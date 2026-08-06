import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "theme";
const TRANSITION_CLASS = "theme-transition";
const TRANSITION_MS = 400;

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function currentDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

function apply(next: boolean): void {
  const root = document.documentElement;
  root.classList.add(TRANSITION_CLASS);
  root.classList.toggle("dark", next);
  window.setTimeout(
    () => root.classList.remove(TRANSITION_CLASS),
    TRANSITION_MS,
  );
}

/**
 * Light/dark theme state. The boot script in index.html applies the initial
 * class pre-paint; this hook owns toggling and following system changes.
 * Toggling back to the system's preference clears the stored override so
 * the site resumes following the OS setting.
 */
export function useTheme() {
  const [dark, setDark] = useState(currentDark);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (window.localStorage.getItem(STORAGE_KEY)) return;
      apply(query.matches);
      setDark(query.matches);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    const next = !currentDark();
    if (next === systemPrefersDark()) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    }
    apply(next);
    setDark(next);
  }, []);

  return { dark, toggle };
}

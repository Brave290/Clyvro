/**
 * Theme preference handling shared by the inline no-flicker script,
 * the ThemeToggle component, and tests.
 *
 * Storage value: "system" | "light" | "dark" (absent = "system",
 * the default for first-time visitors). The *resolved* theme is
 * applied as a `dark` class on <html>.
 */
export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "clyvro-theme";

export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return systemPrefersDark ? "dark" : "light";
}

/**
 * Inline script injected before first paint (in <head>) so the correct
 * theme class is present for SSR'd markup — no flash, and with
 * suppressHydrationWarning on <html> no hydration mismatch.
 * Kept in sync with parseThemePreference/resolveTheme above.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");if(p!=="light"&&p!=="dark"&&p!=="system")p="system";var dark=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var d=document.documentElement;d.classList.toggle("dark",dark);d.style.colorScheme=dark?"dark":"light";}catch(e){}})();`;

"use client";
import { useCallback, useEffect, useState } from "react";
import { Monitor, Sun, Moon } from "lucide-react";
import {
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System theme", Icon: Monitor },
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "dark", label: "Dark theme", Icon: Moon },
];

function applyPreference(pref: ThemePreference) {
  const dark = resolveTheme(pref, window.matchMedia("(prefers-color-scheme: dark)").matches) === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/**
 * Three-way theme control (System / Light / Dark). System is the default
 * for first-time visitors and live-follows OS changes; explicit choices
 * persist in localStorage. Initial paint is handled by THEME_INIT_SCRIPT.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [pref, setPref] = useState<ThemePreference>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPref(parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY)));
    setMounted(true);
  }, []);

  // In System mode, react to OS theme changes without a reload.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPreference("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const choose = useCallback((value: ThemePreference) => {
    setPref(value);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch { /* storage unavailable — theme still applies for this visit */ }
    applyPreference(value);
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={`inline-flex items-center gap-1 rounded-full border border-line bg-canvas p-1 ${className}`}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && pref === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => choose(value)}
            className={`grid h-11 w-11 place-items-center rounded-full transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
              active
                ? "bg-surface text-accent-deep shadow-[0_1px_3px_rgba(15,23,42,0.12)] ring-1 ring-line"
                : "text-ink-mute hover:text-ink"
            }`}
          >
            <Icon size={15} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

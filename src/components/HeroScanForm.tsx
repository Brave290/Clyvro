"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radar, Globe, Sparkles } from "lucide-react";

export default function HeroScanForm() {
  const [value, setValue] = useState("");
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const url = value.trim();
    if (!url) return;
    router.push(`/scan?url=${encodeURIComponent(url)}`);
  }

  return (
    <form onSubmit={submit} className="w-full">
      <label htmlFor="hero-scan-url" className="sr-only">Website address to scan</label>
      <div className="flex flex-col gap-2 rounded-full border border-white/60 bg-white/80 p-2 shadow-[0_12px_40px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all duration-300 focus-within:border-accent/30 focus-within:shadow-[0_16px_48px_rgba(37,99,235,0.15)] dark:border-white/10 dark:bg-surface/70 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Globe size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-mute" aria-hidden />
          <input
            id="hero-scan-url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            required
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="your-client-site.com"
            className="form-control form-control-quiet !min-h-[44px] !rounded-full !border-transparent !bg-transparent !pl-10 pr-3 placeholder:text-ink-mute/70 focus:!border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={!value.trim()}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-accent px-7 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.30)] transition-all hover:bg-accent-hover hover:shadow-[0_10px_28px_rgba(37,99,235,0.35)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 sm:shrink-0"
        >
          <Radar size={16} aria-hidden /> Run free scan
        </button>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-mute">
        <Sparkles size={11} className="text-accent" aria-hidden />
        Paste any public link — we check 10 pages in ~2 minutes
      </p>
    </form>
  );
}

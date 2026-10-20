"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radar, Globe } from "lucide-react";

/** Homepage scan entry point — hands the URL to /scan, which runs the real scan. */
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
      <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-2.5 shadow-[0_10px_36px_rgba(2,6,23,0.08)] transition-shadow duration-300 focus-within:shadow-[0_14px_44px_rgba(37,99,235,0.16)] sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Globe size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute" aria-hidden />
          <input
            id="hero-scan-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="your-client-site.com"
            className="w-full rounded-xl bg-transparent py-3 pl-10 pr-3 text-sm outline-none placeholder:text-ink-mute"
          />
        </div>
        <button
          type="submit"
          disabled={!value.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-lg active:translate-y-0 disabled:translate-y-0 disabled:opacity-50"
        >
          <Radar size={16} aria-hidden /> Run free scan
        </button>
      </div>
    </form>
  );
}

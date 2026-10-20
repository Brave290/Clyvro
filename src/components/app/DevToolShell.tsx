"use client";

import { useState } from "react";
import { CheckCircle2, Info, LoaderCircle, TriangleAlert, Wrench, XCircle } from "lucide-react";
import { ReportSkeleton } from "@/components/app/CheckReport";
import { RemainingNote, UpgradePanel, useToolAccess } from "@/components/app/ToolGate";

export interface DevFact { label: string; value: string; status?: "pass" | "warn" | "fail" | "info" }
export interface DevToolResult {
  tool: string;
  target: string;
  facts: DevFact[];
  sections: { title: string; items: string[] }[];
}

const FACT_ICON = {
  pass: <CheckCircle2 size={14} className="shrink-0 text-good" aria-hidden />,
  warn: <TriangleAlert size={14} className="shrink-0 text-warn" aria-hidden />,
  fail: <XCircle size={14} className="shrink-0 text-bad" aria-hidden />,
  info: <Info size={14} className="shrink-0 text-ink-mute" aria-hidden />,
};

/** Shared runner + result view for the Developer Tools (Beta) suite. */
export default function DevToolShell({ tool, title, blurb, targetLabel, targetPlaceholder, showTestPath = false }: {
  tool: string;
  title: string;
  blurb: string;
  targetLabel: string;
  targetPlaceholder: string;
  showTestPath?: boolean;
}) {
  const [target, setTarget] = useState("");
  const [testPath, setTestPath] = useState("/");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DevToolResult | null>(null);
  const { access, refresh } = useToolAccess(tool);
  const exhausted = access !== null && !access.allowed;

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dev-tools", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool, target, ...(showTestPath ? { testPath } : {}) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "The check couldn't run.");
      setResult(json.result as DevToolResult);
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check couldn't run.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          {title}
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Beta</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{blurb}</p>
      </header>

      {exhausted && access ? <UpgradePanel access={access} /> : (<>
      <form onSubmit={run} aria-busy={busy} className="form-panel mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="dt-target" className="form-label">{targetLabel} <span className="text-bad" aria-hidden="true">*</span></label>
          <input id="dt-target" required value={target} onChange={(e) => setTarget(e.target.value)} placeholder={targetPlaceholder} inputMode="url"
            className="form-control mt-1.5" disabled={busy} />
        </div>
        {showTestPath && (
          <div className="sm:w-52">
            <label htmlFor="dt-path" className="form-label">Path to test</label>
            <input id="dt-path" value={testPath} onChange={(e) => setTestPath(e.target.value)} placeholder="/pricing"
              className="form-control mt-1.5" disabled={busy} />
          </div>
        )}
        <button type="submit" disabled={busy} className="button-primary">
          {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <Wrench size={15} aria-hidden />}
          {busy ? "Checking…" : "Run check"}
        </button>
      </form>
      {error && <p role="alert" className="form-error mt-4">{error}</p>}
      <RemainingNote access={access} />
      </>)}
      {busy && <ReportSkeleton />}

      {result && !busy && (
        <section aria-label={`${title} result`} className="mt-8 space-y-6">
          <h2 className="text-lg font-bold">{result.target}</h2>
          <dl className="grid gap-2 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2">
            {result.facts.map((f) => (
              <div key={f.label} className="flex items-start justify-between gap-4 border-b border-line/60 pb-2 last:border-0">
                <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-mute">
                  {f.status ? FACT_ICON[f.status] : null}{f.label}
                </dt>
                <dd className="max-w-[60%] break-words text-right text-sm font-semibold">{f.value}</dd>
              </div>
            ))}
          </dl>
          {result.sections.map((section) => (
            <div key={section.title} className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold">{section.title}</h3>
              <ul className="mt-3 space-y-1.5">
                {section.items.map((item, i) => (
                  <li key={i} className="break-words text-sm leading-relaxed text-ink-soft">{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Ban, CircleAlert, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import type { ScanReport } from "@/lib/scanner/types";
import { SCAN_MODE_BLURBS, SCAN_MODE_LABELS, type ScanMode } from "@/lib/scan-modes";
import ReportView, { type FindingMeta } from "@/components/ReportView";
import SharePanel from "@/components/app/SharePanel";
import { useToast } from "@/components/Toast";

type AuditStatus = "queued" | "running" | "completed" | "partial" | "failed" | "timed_out" | "cancelled";
interface ScanProgress {
  jobStatus: string | null;
  stage: "queued" | "crawling" | "verifying" | "done";
  pagesFetched: number; pagesParsed: number; linksChecked: number; linksDiscovered: number;
  queuedPages: number; attempts: number; failureCount: number;
  currentUrl?: string | null;
  currentTitle?: string | null;
}
interface AuditPayload {
  audit: {
    id: string;
    projectId: string | null;
    status: AuditStatus;
    targetUrl: string;
    auditTypes: string[];
    scanMode: ScanMode;
    createdAt: string;
    errorMessage?: string | null;
  };
  progress: ScanProgress | null;
  report: ScanReport | null;
  findingMeta: Record<string, FindingMeta>;
}

export default function AuditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [payload, setPayload] = useState<AuditPayload | null>(null);
  const [meta, setMeta] = useState<Record<string, FindingMeta>>({});
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<"cancel" | "retry" | null>(null);
  const polls = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/audits/${id}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error?.message ?? "Couldn't load this audit.");
      return false;
    }
    const p = data as AuditPayload;
    setPayload(p);
    setMeta(p.findingMeta ?? {});
    return p.audit.status === "queued" || p.audit.status === "running";
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const keepPolling = await load();
      if (cancelled) return;
      polls.current += 1;
      // Poll until the persisted state reaches a terminal status — the
      // backend guarantees one (completed/partial/failed/timed_out/
      // cancelled), so this always ends. Progress below comes from the
      // durable checkpoint, not from an animation.
      if (keepPolling) timer = setTimeout(() => void tick(), 3000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  const onFindingStatus = useCallback(async (findingId: string, status: FindingMeta["status"]) => {
    const prev = meta;
    const key = Object.keys(meta).find((k) => meta[k].id === findingId);
    if (key) setMeta({ ...meta, [key]: { ...meta[key], status } });
    const res = await fetch(`/api/findings/${findingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setMeta(prev);
      toast("error", "Couldn't update the finding");
    } else {
      toast("success", "Finding updated", `Status set to ${status}.`);
    }
  }, [meta, toast]);

  if (error) {
    return (
      <div className="mt-8 rounded-2xl border border-bad/25 bg-bad-soft p-6" role="alert">
        <p className="flex items-center gap-2 font-semibold text-bad"><CircleAlert size={18} aria-hidden /> {error}</p>
        <p className="mt-2 text-sm">
          The audit may not exist, or it belongs to a different workspace.{" "}
          <Link href="/app" className="font-semibold text-accent hover:underline">Back to projects</Link>
        </p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="mt-8" aria-busy="true" role="status" aria-label="Loading audit">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-28" />
        <Skeleton className="mt-4 h-64" />
      </div>
    );
  }

  async function act(kind: "cancel" | "retry") {
    setActionBusy(kind);
    try {
      const res = await fetch(`/api/audits/${id}/${kind}`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? `Couldn't ${kind} the scan.`);
      toast("success", kind === "cancel" ? "Scan cancelled" : "Scan re-queued", kind === "cancel" ? "No quota was charged." : "We're running it again.");
      polls.current = 0;
      await load();
    } catch (err) {
      toast("error", `Couldn't ${kind} the scan`, err instanceof Error ? err.message : undefined);
    } finally {
      setActionBusy(null);
    }
  }

  const { audit, report } = payload;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {audit.projectId ? (
        <Link href={`/app/projects/${audit.projectId}`} className="text-sm font-semibold text-accent hover:underline">
          ← Back to project
        </Link>
      ) : (
        <Link href="/app/scan" className="text-sm font-semibold text-accent hover:underline">
          ← Back to Scan
        </Link>
      )}
        <Link href="/app/audits" className="text-xs font-semibold text-ink-mute hover:text-ink hover:underline">All scans</Link>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent-soft/60 px-2.5 py-0.5 text-xs font-semibold text-accent">
          {SCAN_MODE_LABELS[audit.scanMode]} scan
        </span>
        <span className="text-xs text-ink-mute">{SCAN_MODE_BLURBS[audit.scanMode]}</span>
      </p>

      {(audit.status === "queued" || audit.status === "running") && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm" role="status" aria-live="polite">
          <div className="flex items-end gap-3 bg-canvas px-4 pt-3">
            <span className="flex gap-1.5 pb-2.5" aria-hidden>
              <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
              <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
              <span className="h-3 w-3 rounded-full bg-[#28C840]" />
            </span>
            <span className="pb-2 text-xs font-bold uppercase tracking-wide text-ink-mute">
              {audit.scanMode === "deep" ? "Deep crawl — live" : "Live crawl"}
            </span>
            <span className="ml-auto mb-2 rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent">● Live</span>
          </div>
          <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate rounded-md bg-canvas px-2.5 py-1.5 font-mono text-xs text-ink-soft" title={payload.progress?.currentUrl ?? audit.targetUrl}>
              {payload.progress?.currentUrl ?? audit.targetUrl}
            </span>
          </div>
          <div className="bg-[#0b1020] px-6 py-8 text-sm text-white/85">
            <p className="flex items-center gap-2 font-semibold text-white">
              <LoaderCircle size={16} className="animate-spin text-accent" aria-hidden />
              {audit.status === "queued" ? "Queued — waiting for a worker" : payload.progress?.currentTitle ? `Reading “${payload.progress.currentTitle}”` : "Fetching the next public page…"}
            </p>
            <p className="mt-2 text-xs text-white/60">
              This pass is the HTTP crawler (rules 7) — every URL below was actually requested. The live picture of the rendered page is on Flow Scan / Full Scan, where Chromium walks the site.
            </p>
            {payload.progress && (
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-white/50">Stage</dt><dd className="mt-0.5 font-semibold capitalize text-white">{payload.progress.stage}</dd></div>
                <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-white/50">Pages read</dt><dd className="mt-0.5 font-semibold text-white">{payload.progress.pagesParsed} ({payload.progress.pagesFetched} fetched)</dd></div>
                <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-white/50">Links verified</dt><dd className="mt-0.5 font-semibold text-white">{payload.progress.linksChecked} of {payload.progress.linksDiscovered} found</dd></div>
                <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-white/50">Still queued</dt><dd className="mt-0.5 font-semibold text-white">{payload.progress.queuedPages} page(s)</dd></div>
              </dl>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line bg-canvas px-4 py-3">
            <p className="flex-1 text-xs text-ink-mute">Progress is saved. No quota is charged unless a report is produced.</p>
            <button type="button" disabled={actionBusy !== null} onClick={() => void act("cancel")} className="button-secondary !min-h-9">
              {actionBusy === "cancel" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <Ban size={15} aria-hidden />} Cancel scan
            </button>
          </div>
        </div>
      )}

      {(audit.status === "timed_out" || audit.status === "cancelled") && (
        <div className="mt-6 rounded-2xl border border-warn/30 bg-warn-soft p-6" role="alert">
          <p className="flex items-center gap-2 font-semibold"><TriangleAlert size={18} className="text-warn" aria-hidden /> {audit.status === "timed_out" ? "This scan timed out" : "This scan was cancelled"}</p>
          <p className="mt-2 text-sm leading-relaxed">{audit.errorMessage ?? report?.error?.message ?? "The scan did not produce a report."}</p>
          {report && report.coverage.pagesFetched > 0 && (
            <p className="mt-2 text-sm text-ink-soft">{report.coverage.pagesFetched} pages and {report.coverage.linksDiscovered} links checked before stopping. No quota charged.</p>
          )}
          <button type="button" disabled={actionBusy !== null} onClick={() => void act("retry")} className="button-primary mt-4">
            {actionBusy === "retry" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <RotateCcw size={15} aria-hidden />} Retry scan
          </button>
        </div>
      )}

      {audit.status === "failed" && report && (
        <div className="mt-6 rounded-2xl border border-warn/30 bg-warn-soft p-6" role="alert">
          <p className="flex items-center gap-2 font-semibold"><TriangleAlert size={18} className="text-warn" aria-hidden /> Scan failed</p>
          <p className="mt-2 text-sm leading-relaxed">{report.error?.message ?? "The scan failed."}</p>
          <p className="mt-2 text-xs text-ink-soft">Failed scans do not use your quota.</p>
          <button type="button" disabled={actionBusy !== null} onClick={() => void act("retry")} className="button-primary mt-4">
            {actionBusy === "retry" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <RotateCcw size={15} aria-hidden />} Retry scan
          </button>
        </div>
      )}

      {report && !["failed", "timed_out", "cancelled"].includes(audit.status) && (
        <>
          <ReportView report={report} contextNote="saved audit" findingMeta={meta} onFindingStatus={onFindingStatus} />
          <SharePanel auditId={audit.id} />
        </>
      )}
    </div>
  );
}

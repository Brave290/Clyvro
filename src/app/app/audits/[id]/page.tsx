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
      {audit.projectId ? (
        <Link href={`/app/projects/${audit.projectId}`} className="text-sm font-semibold text-accent hover:underline">
          ← Back to project
        </Link>
      ) : (
        <Link href="/app/scan" className="text-sm font-semibold text-accent hover:underline">
          ← Back to Scan
        </Link>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent-soft/60 px-2.5 py-0.5 text-xs font-semibold text-accent">
          {SCAN_MODE_LABELS[audit.scanMode]} scan
        </span>
        <span className="text-xs text-ink-mute">{SCAN_MODE_BLURBS[audit.scanMode]}</span>
      </p>

      {(audit.status === "queued" || audit.status === "running") && (
        <div className="mt-6 rounded-2xl border border-accent/25 bg-accent-soft/60 p-6" role="status" aria-live="polite">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <LoaderCircle size={18} className="animate-spin text-accent" aria-hidden />
            <span className="min-w-0 break-all">
              {audit.status === "queued" ? "Audit queued — " : "Scanning — "}{audit.targetUrl}
            </span>
          </p>
          {payload.progress && (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Stage</dt><dd className="mt-0.5 font-semibold capitalize">{payload.progress.stage}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Pages read</dt><dd className="mt-0.5 font-semibold">{payload.progress.pagesParsed} ({payload.progress.pagesFetched} fetched)</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Links verified</dt><dd className="mt-0.5 font-semibold">{payload.progress.linksChecked} of {payload.progress.linksDiscovered} found</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Still queued</dt><dd className="mt-0.5 font-semibold">{payload.progress.queuedPages} page(s)</dd></div>
            </dl>
          )}
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Progress is the real, saved crawl state — it only moves when pages are actually checked.
            You can leave and come back; the scan keeps its place and always ends in a finished,
            timed-out, or failed state (never charged unless a report is produced).
          </p>
          <button type="button" disabled={actionBusy !== null} onClick={() => void act("cancel")} className="button-secondary mt-4">
            {actionBusy === "cancel" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <Ban size={15} aria-hidden />} Cancel scan
          </button>
        </div>
      )}

      {(audit.status === "timed_out" || audit.status === "cancelled") && (
        <div className="mt-6 rounded-2xl border border-warn/30 bg-warn-soft p-6" role="alert">
          <p className="flex items-center gap-2 font-semibold"><TriangleAlert size={18} className="text-warn" aria-hidden /> {audit.status === "timed_out" ? "This scan timed out" : "This scan was cancelled"}</p>
          <p className="mt-2 text-sm leading-relaxed">{audit.errorMessage ?? report?.error?.message ?? "The scan did not produce a report."}</p>
          {report && report.coverage.pagesFetched > 0 && (
            <p className="mt-2 text-sm text-ink-soft">Before stopping it had fetched {report.coverage.pagesFetched} page(s) and discovered {report.coverage.linksDiscovered} link(s). No quota was charged.</p>
          )}
          <button type="button" disabled={actionBusy !== null} onClick={() => void act("retry")} className="button-primary mt-4">
            {actionBusy === "retry" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <RotateCcw size={15} aria-hidden />} Retry scan
          </button>
        </div>
      )}

      {audit.status === "failed" && report && (
        <div className="mt-6 rounded-2xl border border-warn/30 bg-warn-soft p-6" role="alert">
          <p className="flex items-center gap-2 font-semibold"><TriangleAlert size={18} className="text-warn" aria-hidden /> This audit couldn&apos;t be completed</p>
          <p className="mt-2 text-sm leading-relaxed">{report.error?.message ?? "The scan failed."}</p>
          <p className="mt-2 text-xs text-ink-soft">Failed scans don&apos;t use your monthly quota.</p>
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

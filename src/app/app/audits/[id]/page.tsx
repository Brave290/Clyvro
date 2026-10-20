"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CircleAlert, LoaderCircle, TriangleAlert } from "lucide-react";
import type { ScanReport } from "@/lib/scanner/types";
import ReportView, { type FindingMeta } from "@/components/ReportView";
import SharePanel from "@/components/app/SharePanel";
import { useToast } from "@/components/Toast";

interface AuditPayload {
  audit: {
    id: string;
    projectId: string;
    status: "queued" | "running" | "completed" | "partial" | "failed";
    targetUrl: string;
    auditTypes: string[];
    createdAt: string;
  };
  report: ScanReport | null;
  findingMeta: Record<string, FindingMeta>;
}

export default function AuditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [payload, setPayload] = useState<AuditPayload | null>(null);
  const [meta, setMeta] = useState<Record<string, FindingMeta>>({});
  const [error, setError] = useState<string | null>(null);
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
      if (keepPolling && polls.current < 90) timer = setTimeout(() => void tick(), 2000);
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
      <p className="mt-10 flex items-center gap-2 text-sm text-ink-mute" role="status">
        <LoaderCircle size={16} className="animate-spin text-accent" aria-hidden /> Loading audit…
      </p>
    );
  }

  const { audit, report } = payload;

  return (
    <div className="mt-8">
      <Link href={`/app/projects/${audit.projectId}`} className="text-sm font-semibold text-accent hover:underline">
        ← Back to project
      </Link>

      {(audit.status === "queued" || audit.status === "running") && (
        <div className="mt-6 rounded-2xl border border-accent/25 bg-accent-soft/60 p-6" role="status" aria-live="polite">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <LoaderCircle size={18} className="animate-spin text-accent" aria-hidden />
            <span className="min-w-0 break-all">
              {audit.status === "queued" ? "Audit queued — " : "Scanning — "}{audit.targetUrl}
            </span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            The scan runs in the background. This page updates automatically; you can also leave and
            come back — the report will be here when it finishes.
          </p>
        </div>
      )}

      {audit.status === "failed" && report && (
        <div className="mt-6 rounded-2xl border border-warn/30 bg-warn-soft p-6" role="alert">
          <p className="flex items-center gap-2 font-semibold"><TriangleAlert size={18} className="text-warn" aria-hidden /> This audit couldn&apos;t be completed</p>
          <p className="mt-2 text-sm leading-relaxed">{report.error?.message ?? "The scan failed."}</p>
          <p className="mt-2 text-xs text-ink-soft">Failed scans don&apos;t use your monthly quota. Run a new audit from the project page.</p>
        </div>
      )}

      {report && audit.status !== "failed" && (
        <>
          <ReportView report={report} contextNote="saved audit" findingMeta={meta} onFindingStatus={onFindingStatus} />
          <SharePanel auditId={audit.id} />
        </>
      )}
    </div>
  );
}

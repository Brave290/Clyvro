"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Radar } from "lucide-react";
import { AUDIT_TYPES, type AuditType } from "@/lib/plans";
import { useToast } from "@/components/Toast";

interface RunAuditFormProps {
  projectId: string;
  defaultUrl: string;
  allowedTypes: AuditType[];
  planName: string;
}

export default function RunAuditForm({ projectId, defaultUrl, allowedTypes, planName }: RunAuditFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [url, setUrl] = useState(defaultUrl);
  const [selected, setSelected] = useState<AuditType[]>(["generic"]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(type: AuditType) {
    if (type === "generic") {
      setSelected(["generic"]);
      return;
    }
    setSelected((cur) => {
      const base = cur.filter((t) => t !== "generic");
      const next = base.includes(type) ? base.filter((t) => t !== type) : [...base, type];
      return next.length ? next : ["generic"];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/audits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, auditTypes: selected }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't start the audit.");
      toast("success", "Audit queued", "The scan is running in the background.");
      router.push(`/app/audits/${data.auditId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the audit.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="flex items-center gap-2 font-semibold"><Radar size={17} className="text-accent" aria-hidden /> Run an audit</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        Audits run in the background and are saved to this project. {planName} plan limits apply.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-bad/25 bg-bad-soft p-3 text-sm text-bad">{error}</p>
      )}
      <label htmlFor="ra-url" className="mt-4 block text-sm font-medium">Start URL</label>
      <input id="ra-url" type="text" inputMode="url" required value={url} onChange={(e) => setUrl(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition hover:border-accent/50 focus:border-accent focus:ring-2 focus:ring-accent/25" />
      <fieldset className="mt-5">
        <legend className="text-sm font-medium">Audit types</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {AUDIT_TYPES.map((t) => {
            const allowed = allowedTypes.includes(t.id) || t.id === "generic";
            const active = selected.includes(t.id);
            return (
              <button
                key={t.id} type="button" disabled={!allowed}
                aria-pressed={active}
                title={allowed ? t.blurb : `${t.name} isn't included in the ${planName} plan`}
                onClick={() => toggle(t.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-accent text-white shadow-sm"
                    : "border border-line bg-surface hover:border-accent/50"
                } ${!allowed ? "cursor-not-allowed opacity-45 hover:border-line" : ""}`}
              >
                {t.name}{!allowed ? " · higher plan" : ""}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-mute">
          Focused audits run the rule subset for that concern; Generic Audit runs the full ruleset.
          Categories deepen phase by phase — a focused audit never fakes checks that don&apos;t exist yet.
        </p>
      </fieldset>
      <button type="submit" disabled={busy}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-md active:translate-y-0 disabled:opacity-60">
        {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
        {busy ? "Queuing…" : "Start audit"}
      </button>
    </form>
  );
}

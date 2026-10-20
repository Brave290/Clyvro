"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";

interface SettingsData {
  organization: {
    id: string;
    name: string;
    planId: string;
    brandName: string | null;
    brandColor: string | null;
    reportFooter: string | null;
  };
  whiteLabel: boolean;
  planName: string;
  myRole: string;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<SettingsData | null>(null);
  const [brandName, setBrandName] = useState("");
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [reportFooter, setReportFooter] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/org/settings");
    if (!res.ok) return;
    const json = (await res.json()) as SettingsData;
    setData(json);
    setBrandName(json.organization.brandName ?? "");
    setBrandColor(json.organization.brandColor ?? "#2563eb");
    setReportFooter(json.organization.reportFooter ?? "");
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data) {
    return <div className="mx-auto max-w-3xl px-5 py-14 text-sm text-ink-mute">Loading settings…</div>;
  }

  const canManage = data.myRole === "owner" || data.myRole === "admin";
  const previewName = brandName.trim() || data.organization.name;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/org/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandName, brandColor, reportFooter }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message: string } };
      if (!res.ok) throw new Error(json.error?.message ?? "Couldn't save the changes.");
      toast("success", "Settings saved");
      await load();
    } catch (e) {
      toast("error", "Settings not saved", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Workspace settings</h1>
      <p className="mt-1 text-sm text-ink-mute">
        {data.organization.name} · {data.planName} plan
      </p>

      <section className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">Report branding</h2>
        <p className="mt-1 text-sm text-ink-mute">
          How your name appears on reports you share with clients.
          {!data.whiteLabel && (
            <> On the {data.planName} plan, reports are signed &quot;prepared by {data.organization.name} via Clyvro&quot;.
              Save branding now and it applies the moment a white-label plan is active (<Link href="/pricing" className="font-semibold text-accent hover:underline">see plans</Link>).</>
          )}
        </p>

        {!canManage ? (
          <p className="mt-4 rounded-lg border border-warn/25 bg-warn-soft px-4 py-3 text-sm">
            Only owners and admins can change these settings.
          </p>
        ) : (
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => { e.preventDefault(); void save(); }}
          >
            <label className="block">
              <span className="text-sm font-medium">Name shown on reports</span>
              <input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                maxLength={80}
                placeholder={data.organization.name}
                className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
              <span className="mt-1 block text-xs text-ink-mute">Leave blank to use the workspace name.</span>
            </label>

            <label className="block">
              <span className="text-sm font-medium">Accent colour</span>
              <span className="mt-1.5 flex items-center gap-3">
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1"
                  aria-label="Pick accent colour"
                />
                <input
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  maxLength={7}
                  className="w-32 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
                  aria-label="Accent colour hex"
                />
              </span>
              <span className="mt-1 block text-xs text-ink-mute">Must be dark enough to read on a white page — we&apos;ll stop you if it isn&apos;t.</span>
            </label>

            <label className="block">
              <span className="text-sm font-medium">Report footer (optional)</span>
              <input
                value={reportFooter}
                onChange={(e) => setReportFooter(e.target.value)}
                maxLength={200}
                placeholder="e.g. Prepared for Harbor Logistics — questions? hello@youragency.com"
                className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save branding"}
            </button>
          </form>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">Preview</h2>
        <p className="mt-1 text-xs text-ink-mute">
          {data.whiteLabel
            ? "This is what clients see at the top of a shared report."
            : "With a white-label plan active, your shared reports would open like this:"}
        </p>
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          <div className="px-5 py-4" style={{ backgroundColor: brandColor }}>
            <p className="text-sm font-bold text-white">{previewName}</p>
            <p className="text-xs text-white/80">Website check report</p>
          </div>
          <div className="bg-white px-5 py-4 text-sm text-neutral-600">
            <p className="font-semibold text-neutral-900">Here&apos;s what we found, in plain words</p>
            <p className="mt-1">Every shared report starts with a short summary and the few fixes that matter most.</p>
          </div>
          {reportFooter.trim() && (
            <div className="border-t border-line bg-white px-5 py-3 text-xs text-neutral-500">{reportFooter}</div>
          )}
        </div>
      </section>
    </div>
  );
}

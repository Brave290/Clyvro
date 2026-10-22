"use client";

import { useCallback, useEffect, useState } from "react";
import { PageSkeleton } from "@/components/Skeleton";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import BrandColorPicker, { DEFAULT_BRAND_COLOR } from "@/components/app/BrandColorPicker";
import DeleteAllProjects from "@/components/app/DeleteAllProjects";
import DeleteAccount from "@/components/app/DeleteAccount";

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
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_COLOR);
  const [reportFooter, setReportFooter] = useState("");
  const [notifyPrefs, setNotifyPrefs] = useState({ scanResults: true, scheduledRuns: true, billing: true, quota: true, productNews: true });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/org/settings");
    if (!res.ok) return;
    const json = (await res.json()) as SettingsData;
    setData(json);
    setBrandName(json.organization.brandName ?? "");
    setBrandColor(json.organization.brandColor ?? DEFAULT_BRAND_COLOR);
    setReportFooter(json.organization.reportFooter ?? "");
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void fetch("/api/account/preferences").then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json?.preferences) setNotifyPrefs(json.preferences); }).catch(() => undefined);
  }, []);

  async function savePrefs(next: typeof notifyPrefs) {
    setNotifyPrefs(next);
    const res = await fetch("/api/account/preferences", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(next),
    });
    if (res.ok) toast("success", "Email preferences saved");
    else toast("error", "Couldn't save email preferences");
  }

  if (!data) {
    return <PageSkeleton />;
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
    <div className="mt-8 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Workspace settings</h1>
      <p className="mt-1 text-sm text-ink-mute">
        {data.organization.name} · {data.planName} plan
      </p>

      <section className="form-panel mt-8">
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
            className="mt-5 space-y-5"
            onSubmit={(e) => { e.preventDefault(); void save(); }}
            aria-busy={busy}
          >
            <label className="block">
              <span className="form-label">Name shown on reports</span>
              <input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                maxLength={80}
                placeholder={data.organization.name}
                className="form-control mt-1.5"
              />
              <span className="form-hint">Leave blank to use the workspace name.</span>
            </label>

            <BrandColorPicker
              value={brandColor}
              onChange={setBrandColor}
              onReset={() => setBrandColor(DEFAULT_BRAND_COLOR)}
            />

            <label className="block">
              <span className="form-label">Report footer (optional)</span>
              <input
                value={reportFooter}
                onChange={(e) => setReportFooter(e.target.value)}
                maxLength={200}
                placeholder="e.g. Prepared for Harbor Logistics — thank you for the partnership"
                className="form-control mt-1.5"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="button-primary"
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

      {data.myRole === "owner" && <DeleteAllProjects />}
      <section className="form-panel mt-8">
        <h2 className="font-semibold">Email notifications</h2>
        <p className="mt-1 text-sm text-ink-mute">
          Choose which product emails you receive. Each event is emailed at most once — retries never duplicate.
        </p>
        <div className="mt-4 space-y-3">
          {([
            ["scanResults", "Scan results", "When a scan finishes, fails, times out, or finds something newly serious."],
            ["scheduledRuns", "Scheduled checks", "Results from your scheduled monitoring runs."],
            ["billing", "Billing", "Payment confirmations and plan changes."],
            ["quota", "Quota warnings", "When your workspace is nearly out of monthly scans."],
            ["productNews", "Product news", "When a feature you voted for on the roadmap ships."],
          ] as const).map(([key, label, blurb]) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-canvas/60 px-4 py-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#2563EB]"
                checked={notifyPrefs[key]}
                onChange={(e) => void savePrefs({ ...notifyPrefs, [key]: e.target.checked })}
                aria-label={label}
              />
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-sm text-ink-mute">{blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="form-panel mt-8">
        <h2 className="font-semibold">API &amp; keys</h2>
        <p className="mt-1 text-sm text-ink-mute">
          Bearer keys for Full Scan and Site Guard live on their own page now.
        </p>
        <Link href="/app/api-keys" className="button-secondary mt-4 inline-flex">Open API &amp; keys</Link>
      </section>
      <DeleteAccount />
    </div>
  );
}

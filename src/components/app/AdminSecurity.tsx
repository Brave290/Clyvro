"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import LocalDateTime from "@/components/LocalDateTime";
import { ConfirmDialog } from "@/components/Dialog";
import { Pagination, SectionShell, useAdminActions, usePaged } from "@/components/app/AdminConsole";
import type { ShieldOverview } from "@/lib/services/shield";
import type { ShieldMode } from "@/lib/shield/rules";

type EventRow = ShieldOverview["events"][number];
type Filter = "all" | "blocked" | "monitored" | "suspicious" | "login";

const MODES: { id: ShieldMode; title: string; summary: string; detail: string; Icon: typeof ShieldCheck }[] = [
  {
    id: "monitor",
    title: "Monitor",
    summary: "Watch and learn (recommended to start)",
    detail: "Attack signatures (SQL injection, XSS, traversal…) are recorded as “would block” but let through, so you can confirm no real customer trips them. Honeypots, attack-tool fingerprints, bans and rate limits are still enforced.",
    Icon: ShieldCheck,
  },
  {
    id: "enforce",
    title: "Enforce",
    summary: "Block everything that scores as an attack",
    detail: "Same rules as Monitor, but requests whose signature score reaches the block threshold get a 403 and count towards the ban ladder. Switch here once Monitor shows only genuine attacks.",
    Icon: ShieldAlert,
  },
  {
    id: "under-attack",
    title: "Under attack",
    summary: "Emergency: Enforce + rate limits cut to a quarter",
    detail: "Use during a flood. Every limit is divided by four, so heavy legitimate use (many tabs, fast polling) may see 429s. Turn it off again when the wave passes.",
    Icon: ShieldOff,
  },
];

const VERDICT_STYLE: Record<string, string> = {
  blocked: "bg-bad-soft text-bad",
  banned: "bg-bad-soft text-bad",
  "rate-limited": "bg-warn-soft text-warn",
  monitored: "bg-warn-soft text-warn",
  suspicious: "bg-canvas text-ink-mute",
  "login-failed": "bg-canvas text-ink-mute",
  "login-locked": "bg-bad-soft text-bad",
  emergency: "bg-accent-soft text-accent",
};

function Verdict({ v }: { v: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${VERDICT_STYLE[v] ?? "bg-canvas text-ink-mute"}`}>{v}</span>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" | "warn" | "good" }) {
  const color = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "good" ? "text-good" : "text-ink";
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}

type Me = { masked: string; hash: string; allowlisted: boolean; trustedUntil: string | null; emergencyKeyConfigured: boolean };

export function AdminSecurity({ overview, me }: { overview: ShieldOverview; me: Me }) {
  const { busy, act } = useAdminActions();
  const [mode, setMode] = useState<ShieldMode>(overview.settings.mode);
  const [confirmMode, setConfirmMode] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [trustBusy, setTrustBusy] = useState(false);
  const [trustedUntil, setTrustedUntil] = useState<string | null>(me.trustedUntil);
  const [trustError, setTrustError] = useState<string | null>(null);

  async function trustThisBrowser(enable: boolean) {
    setTrustBusy(true);
    setTrustError(null);
    try {
      const res = await fetch("/api/admin/trust", { method: enable ? "POST" : "DELETE" });
      const json = (await res.json().catch(() => null)) as { trusted?: boolean; expiresAt?: string | null; error?: { message?: string } } | null;
      if (!res.ok) throw new Error(json?.error?.message ?? "Could not update this browser's trust.");
      setTrustedUntil(json?.trusted ? json.expiresAt ?? null : null);
      try { window.sessionStorage.setItem("clyvro.adminTrust.v1", enable ? "1" : "0"); } catch { /* ignore */ }
    } catch (err) {
      setTrustError(err instanceof Error ? err.message : "Could not update this browser's trust.");
    } finally {
      setTrustBusy(false);
    }
  }
  const [note, setNote] = useState("Founder");
  const [banIp, setBanIp] = useState("");
  const [banMinutes, setBanMinutes] = useState("60");
  const [banReason, setBanReason] = useState("manual");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => overview.events.filter((e) => {
    if (filter === "all") return true;
    if (filter === "blocked") return e.verdict === "blocked" || e.verdict === "banned" || e.verdict === "rate-limited";
    if (filter === "login") return e.verdict.startsWith("login");
    return e.verdict === filter;
  }), [overview.events, filter]);
  // Show only 3 by default; pagination reveals the rest (backend already limits to 200, paginated here with real pages).
  const paged = usePaged(filtered, 3);
  const bans = usePaged(overview.bans, 10);
  const { stats } = overview;
  const current = overview.settings.mode;

  function saveMode() {
    if (mode === current) return;
    if (mode === "under-attack") { setConfirmMode(true); return; }
    void act({ action: "shield.setMode", mode }, "mode");
  }

  return (
    <div className="space-y-10">
      <SectionShell title="Clyvro Shield"
        note="Clyvro's own request firewall. It runs at the edge in front of every page and API route, keeps only hashed addresses, fails open if anything breaks, and explains every decision below.">
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <span className="font-semibold">Mode now:</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${current === "monitor" ? "bg-good-soft text-good" : current === "enforce" ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad"}`}>{current}</span>
          <span className="text-ink-mute">Always on in every mode: honeypot paths, attack-tool fingerprints, null bytes, rate limits, bans and sign-in lockouts.</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Blocked · 24 h" value={stats.blocked24h} tone={stats.blocked24h > 0 ? "bad" : undefined} />
          <Stat label="Would block (monitor) · 24 h" value={stats.monitored24h} tone={stats.monitored24h > 0 ? "warn" : undefined} />
          <Stat label="Suspicious · 24 h" value={stats.suspicious24h} />
          <Stat label="Failed sign-ins · 24 h" value={stats.loginFailed24h} tone={stats.loginFailed24h > 10 ? "warn" : undefined} />
          <Stat label="Active bans" value={stats.activeBans} tone={stats.activeBans > 0 ? "warn" : "good"} />
        </div>
      </SectionShell>

      <SectionShell title="Protection mode" note="Start in Monitor, read the “would block” events for a few days, then move to Enforce. Changes apply at the edge within ~10 seconds and are audit-logged.">
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {MODES.map(({ id, title, summary, detail, Icon }) => (
            <label key={id} className={`cursor-pointer rounded-2xl border p-4 transition ${mode === id ? "border-accent bg-accent/5" : "border-line bg-surface hover:border-ink-mute/40"}`}>
              <span className="flex items-center gap-2">
                <input type="radio" name="shield-mode" value={id} checked={mode === id} onChange={() => setMode(id)} className="h-4 w-4 accent-[#2563EB]" />
                <Icon size={16} aria-hidden />
                <span className="font-semibold">{title}</span>
                {current === id && <span className="ml-auto rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-mute">current</span>}
              </span>
              <span className="mt-2 block text-sm font-semibold text-ink-soft">{summary}</span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-mute">{detail}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="button-primary" disabled={busy !== null || mode === current} onClick={saveMode}>
            {busy === "mode" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null} Save mode
          </button>
          {mode !== current && <span className="text-xs text-ink-mute">Switching {current} → {mode}.</span>}
        </div>
        <ConfirmDialog open={confirmMode} onCancel={() => setConfirmMode(false)}
          onConfirm={() => { setConfirmMode(false); void act({ action: "shield.setMode", mode: "under-attack" }, "mode"); }}
          title="Switch to Under attack?"
          message="All rate limits drop to a quarter and every attack signature blocks. Legitimate heavy users may see 429 errors until you switch back."
          confirmLabel="Yes, we're under attack" />
      </SectionShell>

      <SectionShell title="Your access can never be locked out" note="Shield trusts administrators by browser, not by address: a signed 30-day cookie follows you across Wi-Fi, mobile data and VPNs and bypasses bans, rate limits and attack rules. The hidden /emergency page issues the same cookie before sign-in.">
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="form-panel space-y-3">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              This browser
              {trustedUntil
                ? <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-good">trusted</span>
                : <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-warn">not trusted yet</span>}
            </p>
            <p className="text-sm leading-relaxed text-ink-soft">
              {trustedUntil
                ? <>Shield lets this browser through on any network until <LocalDateTime value={trustedUntil} />. Opening the admin area renews it automatically.</>
                : <>The admin area asks for trust automatically when it opens; if a content blocker interfered, grant it here.</>}
            </p>
            {trustError && <p className="form-error">{trustError}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="button-secondary" disabled={trustBusy} onClick={() => void trustThisBrowser(true)}>
                {trustBusy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null} {trustedUntil ? "Renew for 30 days" : "Trust this browser"}
              </button>
              {trustedUntil && (
                <button type="button" className="button-secondary" disabled={trustBusy} onClick={() => void trustThisBrowser(false)}>Forget this browser</button>
              )}
            </div>
          </div>
          <div className="form-panel space-y-3">
            <p className="text-sm font-semibold">Emergency door &amp; revocation</p>
            <ul className="space-y-2 text-sm leading-relaxed text-ink-soft">
              <li><span className="font-mono text-xs font-semibold text-ink">/emergency</span> — hidden, noindex, exempt from Shield blocks. Sign in there with your password{me.emergencyKeyConfigured ? " or the emergency key" : ""}; success lifts a ban on your current address and trusts the browser.</li>
              <li>
                Emergency key: {me.emergencyKeyConfigured
                  ? <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-good">configured</span>
                  : <><span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-warn">not set</span> — add <span className="font-mono text-xs">ADMIN_EMERGENCY_KEY</span> (32+ random characters) in Vercel so Google-only admin accounts can use the door.</>}
              </li>
              <li>Lost a device? Revoking invalidates every trusted browser within ~10 seconds (token generation {overview.settings.trustVersion}{overview.settings.trustRevokedAt ? <>, last revoked <LocalDateTime value={overview.settings.trustRevokedAt} /></> : null}).</li>
            </ul>
            <button type="button" className="button-danger" disabled={busy !== null} onClick={() => setConfirmRevoke(true)}>
              {busy === "revokeTrust" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null} Revoke all trusted browsers
            </button>
          </div>
        </div>
        <ConfirmDialog open={confirmRevoke} onCancel={() => setConfirmRevoke(false)}
          onConfirm={() => { setConfirmRevoke(false); setTrustedUntil(null); void act({ action: "shield.revokeTrust", confirm: true }, "revokeTrust"); }}
          title="Revoke every trusted browser?"
          message="All administrators' browsers (including this one) lose their Shield bypass. They are re-trusted automatically the next time an admin opens the admin area from an address that is not blocked, or via /emergency."
          confirmLabel="Revoke all" />
      </SectionShell>

      <SectionShell title="Your connection & allowlist" note="Allowlisted addresses bypass Shield completely — use it for uptime monitors or a fixed office address. Addresses are stored hashed; only the masked form is shown. (Your own browser is covered by the trusted-browser cookie above.)">
        <div className="form-panel mt-4 space-y-4">
          <p className="text-sm">
            You are browsing from <span className="font-mono font-semibold">{me.masked}</span>
            {me.allowlisted
              ? <span className="ml-2 rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-good">allowlisted</span>
              : <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-mute">not allowlisted</span>}
          </p>
          {!me.allowlisted && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-56">
                <label htmlFor="allow-note" className="form-label">Label</label>
                <input id="allow-note" className="form-control mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
              </div>
              <button type="button" className="button-secondary" disabled={busy !== null}
                onClick={() => void act({ action: "shield.allow", current: true, note }, "allow")}>
                {busy === "allow" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null} Allowlist my current address
              </button>
              <p className="w-full text-xs text-ink-mute">Mobile networks rotate addresses, so you may need to redo this occasionally. Being allowlisted means you can never lock yourself out while testing Enforce.</p>
            </div>
          )}
          {overview.settings.allow.length > 0 ? (
            <ul className="divide-y divide-line/60 rounded-xl border border-line">
              {overview.settings.allow.map((a) => (
                <li key={a.hash} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-mono font-semibold">{a.label}</span>
                  <span className="text-ink-mute">{a.note || "—"}</span>
                  <span className="text-xs text-ink-mute">added <LocalDateTime value={a.addedAt} /></span>
                  {a.hash === me.hash && <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-good">you</span>}
                  <button type="button" className="button-secondary !min-h-9 !px-3 !py-1.5 ml-auto text-xs" disabled={busy !== null}
                    onClick={() => void act({ action: "shield.unallow", hash: a.hash }, "unallow")}>Remove</button>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-ink-mute">No allowlisted addresses yet.</p>}
        </div>
      </SectionShell>

      <SectionShell title="Last 24 hours at a glance">
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-sm font-bold">Top rules</p>
            {overview.topRules.length === 0 ? <p className="mt-2 text-xs text-ink-mute">Nothing recorded yet. That is good news.</p> : (
              <ul className="mt-2 space-y-1 text-sm">
                {overview.topRules.map((r) => <li key={r.rule} className="flex justify-between"><span className="font-mono text-xs">{r.rule}</span><span className="font-semibold">{r.n}</span></li>)}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-sm font-bold">Busiest addresses</p>
            {overview.topAddresses.length === 0 ? <p className="mt-2 text-xs text-ink-mute">No events yet.</p> : (
              <ul className="mt-2 space-y-1 text-sm">
                {overview.topAddresses.map((a) => (
                  <li key={a.ipHash} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{a.ipMasked}</span>
                    {a.country && <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink-mute">{a.country}</span>}
                    <span className="font-semibold">{a.n}</span>
                    {a.ipHash !== me.hash && (
                      <button type="button" className="button-secondary !min-h-8 !px-2.5 !py-1 ml-auto text-xs" disabled={busy !== null}
                        onClick={() => void act({ action: "shield.ban", hash: a.ipHash, label: a.ipMasked, minutes: 24 * 60, reason: "manual (busiest addresses)" }, "ban")}>Ban 24 h</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SectionShell>

      <SectionShell title="Events" note="Newest first; the last 200 are shown and rows older than 7 days are pruned automatically.">
        <div className="mt-3 flex flex-wrap gap-2">
          {(["all", "blocked", "monitored", "suspicious", "login"] as Filter[]).map((f) => (
            <button key={f} type="button" onClick={() => { setFilter(f); paged.setPage(1); }}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? "bg-accent text-white" : "bg-canvas text-ink-mute hover:text-ink"}`}>
              {f === "login" ? "sign-ins" : f}
            </button>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
              <th className="px-4 py-3">When</th><th className="px-4 py-3">Verdict</th><th className="px-4 py-3">Rule</th><th className="px-4 py-3">Request</th><th className="px-4 py-3">Address</th><th className="px-4 py-3">Action</th>
            </tr></thead>
            <tbody>
              {paged.pageItems.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-ink-mute">No events match this filter.</td></tr>}
              {paged.pageItems.map((e: EventRow) => (
                <tr key={e.id} className="border-b border-line/60 last:border-0 align-top">
                  <td className="px-4 py-3 text-xs whitespace-nowrap"><LocalDateTime value={e.at} /></td>
                  <td className="px-4 py-3"><Verdict v={e.verdict} /><p className="mt-1 text-[11px] text-ink-mute">{e.mode}</p></td>
                  <td className="px-4 py-3 text-xs">
                    <p className="font-mono font-semibold">{e.rule}</p>
                    {e.matches.length > 0 && <p className="mt-0.5 max-w-52 text-[11px] text-ink-mute">{e.matches.map((m) => `${m.family}/${m.rule}`).slice(0, 4).join(", ")}{e.score ? ` · score ${e.score}` : ""}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p className="max-w-80 break-all font-mono" title={e.path}>{e.method} {e.path.length > 90 ? `${e.path.slice(0, 90)}…` : e.path}</p>
                    {e.userAgent && <p className="mt-0.5 max-w-80 truncate text-[11px] text-ink-mute" title={e.userAgent}>{e.userAgent}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs"><span className="font-mono">{e.ipMasked}</span>{e.country && <span className="ml-1 text-ink-mute">{e.country}</span>}</td>
                  <td className="px-4 py-3">
                    {e.ipHash !== me.hash && !e.verdict.startsWith("login") && (
                      <button type="button" className="button-secondary !min-h-8 !px-2.5 !py-1 text-xs" disabled={busy !== null}
                        onClick={() => void act({ action: "shield.ban", hash: e.ipHash, label: e.ipMasked, minutes: 24 * 60, reason: `manual (${e.rule})` }, "ban")}>Ban 24 h</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={paged.page} totalPages={paged.totalPages} total={paged.total} onPage={paged.setPage} />
      </SectionShell>

      <SectionShell title="Bans" note="Automatic bans follow the ladder below; manual bans use the duration you choose. Account locks come from failed sign-ins. Unbanning takes effect at the edge within ~10 seconds.">
        <div className="form-panel mt-4">
          <p className="text-sm font-bold">Ban an address manually</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="w-56"><label htmlFor="ban-ip" className="form-label">IP address</label><input id="ban-ip" className="form-control mt-1.5 font-mono" value={banIp} onChange={(e) => setBanIp(e.target.value)} placeholder="203.0.113.7" /></div>
            <div className="w-32"><label htmlFor="ban-min" className="form-label">Minutes</label><input id="ban-min" type="number" min={1} className="form-control mt-1.5" value={banMinutes} onChange={(e) => setBanMinutes(e.target.value)} /></div>
            <div className="w-56"><label htmlFor="ban-reason" className="form-label">Reason</label><input id="ban-reason" className="form-control mt-1.5" value={banReason} onChange={(e) => setBanReason(e.target.value)} maxLength={80} /></div>
            <button type="button" className="button-primary" disabled={busy !== null || !banIp.trim()}
              onClick={() => void act({ action: "shield.ban", ip: banIp.trim(), minutes: Number(banMinutes), reason: banReason }, "ban")}>
              {busy === "ban" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null} Ban
            </button>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
              <th className="px-4 py-3">Who</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Level · hits</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">By</th><th className="px-4 py-3">Action</th>
            </tr></thead>
            <tbody>
              {bans.pageItems.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-ink-mute">No active bans.</td></tr>}
              {bans.pageItems.map((b) => (
                <tr key={b.key} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3"><span className="font-mono text-xs font-semibold">{b.label}</span><p className="text-[11px] text-ink-mute">{b.kind === "account" ? "account lock" : "address ban"}</p></td>
                  <td className="px-4 py-3 text-xs">{b.reason}</td>
                  <td className="px-4 py-3 text-xs">L{b.level} · {b.hits}</td>
                  <td className="px-4 py-3 text-xs"><LocalDateTime value={b.expiresAt} /></td>
                  <td className="px-4 py-3 text-xs">{b.createdBy}</td>
                  <td className="px-4 py-3">
                    <button type="button" className="button-secondary !min-h-8 !px-2.5 !py-1 text-xs" disabled={busy !== null}
                      onClick={() => void act({ action: "shield.unban", key: b.key }, "unban")}>{b.kind === "account" ? "Unlock" : "Unban"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={bans.page} totalPages={bans.totalPages} total={bans.total} onPage={bans.setPage} />
      </SectionShell>

      <SectionShell title="How the rules work" note="Plain-language catalogue of what Shield looks at. Request bodies are validated by each API route; Shield inspects the request line, query string and User-Agent.">
        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute"><th className="px-4 py-3">Rule</th><th className="px-4 py-3">What it catches</th><th className="px-4 py-3">Enforced</th></tr></thead>
              <tbody>
                {overview.catalogue.map((r) => (
                  <tr key={r.family} className="border-b border-line/60 last:border-0 align-top">
                    <td className="px-4 py-3"><p className="font-semibold">{r.title}</p><p className="font-mono text-[11px] text-ink-mute">{r.family}</p></td>
                    <td className="px-4 py-3 text-xs leading-relaxed text-ink-soft">{r.what}</td>
                    <td className="px-4 py-3 text-xs">{r.enforced === "always" ? <span className="rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-bad">always</span> : <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-warn">enforce modes</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
              <p className="font-bold">Ban ladder (per address, rolling 24 h)</p>
              <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                {overview.ladder.map((l) => <li key={l.level}>{l.blocks}+ blocks → banned for <span className="font-semibold">{l.label}</span></li>)}
                <li>Honeypot or null byte → straight to 24 hours.</li>
                <li>Attack-tool User-Agent → straight to 1 hour.</li>
                <li>Floods (429s) are judged separately: ~5 min of sustained flooding → 15 min, ~20 min → 1 hour.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
              <p className="font-bold">Rate limits (per address)</p>
              <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                <li>Sign-in, register, password reset: 30 per 10 min</li>
                <li>Public scan & waitlist: 40 per 10 min</li>
                <li>API: 400 per minute · Pages: 300 per minute</li>
                <li>Under attack: all limits ÷ 4</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
              <p className="font-bold">Sign-in lockouts</p>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">5 failed passwords in 15 minutes locks the account for 15 minutes, 10 for an hour; 20 failures from one address across any accounts bans the address for an hour. Unlock from the Bans list if a real customer is stuck.</p>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
              <p className="font-bold">Honest limits</p>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">Shield raises the cost of automated attacks and gives you visibility; no firewall makes a site “un-hackable”. Rate counters live per edge region, so a distributed flood is slowed rather than stopped — Under attack mode plus bans is the answer there. Researchers can reach us via /.well-known/security.txt.</p>
            </div>
          </div>
        </div>
      </SectionShell>
    </div>
  );
}

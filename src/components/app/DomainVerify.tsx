"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { useToast } from "@/components/Toast";

interface VerificationRow {
  id: string; domain: string; recordName: string; status: string;
  expiresAt: string; verifiedAt: string | null;
}
interface Issued { id: string; domain: string; recordName: string; recordValue: string; expiresAt: string }

function domainOf(input: string): string {
  try {
    const host = new URL(input.includes("://") ? input : `https://${input}`).hostname.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Domain ownership verification for deep scans. Opens a modal explaining
 * why proof is needed; "Verify now" issues a one-time DNS TXT token
 * (only its hash is stored server-side) and checks it server-side;
 * "Later" closes without changing anything. A domain is only ever
 * unlocked by the server-side DNS check — never by this UI.
 */
export default function DomainVerify({ targetUrl }: { targetUrl: string }) {
  const { toast } = useToast();
  const domain = domainOf(targetUrl);
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState<"issue" | "check" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/domain-verifications");
    const json = await res.json().catch(() => null);
    if (res.ok) setRows(json.verifications as VerificationRow[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const mine = rows.find((r) => r.domain === domain);
  const verified = mine?.status === "verified";

  async function issue() {
    setBusy("issue");
    setMessage(null);
    try {
      const res = await fetch("/api/domain-verifications", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't create a verification code.");
      setIssued(json.verification as Issued);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't create a verification code.");
    } finally {
      setBusy(null);
    }
  }

  async function check(id?: string) {
    const verificationId = id ?? issued?.id;
    if (!verificationId) return;
    setBusy("check");
    setMessage(null);
    try {
      const res = await fetch(`/api/domain-verifications/${verificationId}/check`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Record not found yet.");
      toast("success", "Domain verified", `${domain} can now be deep-scanned.`);
      setOpen(false);
      setIssued(null);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Record not found yet — DNS can take a few minutes.");
    } finally {
      setBusy(null);
    }
  }

  if (!domain) return null;

  return (
    <div className="mt-4 rounded-2xl border border-line bg-canvas/70 p-4">
      {verified ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-good">
          <ShieldCheck size={16} aria-hidden /> {domain} is verified for deep scans.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-ink-soft">
            Deep scans need proof you control <strong className="text-ink">{domain}</strong>.
            {mine?.status === "pending" ? " A verification is pending for this domain." : mine?.status === "expired" ? " The previous verification expired." : ""}
          </p>
          <button type="button" className="button-secondary" onClick={() => { setOpen(true); setMessage(null); }}>
            <ShieldCheck size={15} aria-hidden /> Verify this domain
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-slate-950/50" role="presentation" onClick={() => setOpen(false)}>
          <div className="flex min-h-full w-full items-center justify-center p-4 py-[max(1rem,env(safe-area-inset-top))]">
          <div role="dialog" aria-modal="true" aria-labelledby="dv-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 id="dv-title" className="text-lg font-bold">Verify you control {domain}</h2>
              <button type="button" aria-label="Close" className="rounded-lg p-1.5 text-ink-mute hover:bg-canvas hover:text-ink" onClick={() => setOpen(false)}>
                <X size={18} aria-hidden />
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              A deep scan reads your whole site, so we ask for one quick proof first: a DNS TXT
              record only someone who controls the domain can add. It takes about two minutes and
              you only do it once per domain. Your scan safety limits stay exactly the same either way.
            </p>

            {!issued && mine?.status === "pending" ? (
              <div className="mt-5 space-y-4">
                <p className="rounded-xl bg-canvas px-3.5 py-2.5 text-sm leading-relaxed text-ink-soft">
                  A verification code is already pending for this domain (added at <strong className="text-ink">{mine.recordName}</strong>).
                  If you&apos;ve added the TXT record with the code you copied earlier, just check — don&apos;t issue a new code,
                  because a new code replaces the old one and would orphan the record you added.
                </p>
                {message && <p role="alert" className="form-error">{message}</p>}
                <div className="flex flex-wrap gap-3">
                  <button type="button" className="button-primary" disabled={busy !== null} onClick={() => void check(mine.id)}>
                    {busy === "check" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <Check size={15} aria-hidden />} I&apos;ve added it — check now
                  </button>
                  <button type="button" className="button-secondary" disabled={busy !== null} onClick={() => void issue()}>
                    {busy === "issue" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : null} Issue a new code instead
                  </button>
                  <button type="button" className="button-secondary" onClick={() => setOpen(false)}>Later</button>
                </div>
              </div>
            ) : !issued ? (
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" className="button-primary" disabled={busy !== null} onClick={() => void issue()}>
                  {busy === "issue" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <ShieldCheck size={15} aria-hidden />} Verify now
                </button>
                <button type="button" className="button-secondary" onClick={() => setOpen(false)}>Later</button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-ink-soft">
                  <li>Open your DNS provider (where the domain was registered or is hosted) and add a <strong className="text-ink">TXT</strong> record.</li>
                  <li>Use this exact name and value:
                    <div className="mt-2 space-y-2">
                      <CopyRow label="Name / host" value={issued.recordName} />
                      <CopyRow label="Value" value={issued.recordValue} />
                    </div>
                  </li>
                  <li>Save, wait a couple of minutes for DNS to update, then check.</li>
                </ol>
                {message && <p role="alert" className="form-error">{message}</p>}
                <div className="flex flex-wrap gap-3">
                  <button type="button" className="button-primary" disabled={busy !== null} onClick={() => void check()}>
                    {busy === "check" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <Check size={15} aria-hidden />} I&apos;ve added it — check now
                  </button>
                  <button type="button" className="button-secondary" onClick={() => setOpen(false)}>Later</button>
                </div>
                <div className="rounded-xl border border-line bg-canvas px-3.5 py-3">
                  <p className="text-sm font-semibold">No DNS access? Use a meta tag instead</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-mute">
                    Some platforms (like *.vercel.app subdomains) don&apos;t let you add DNS records at all. Paste this line into your
                    site&apos;s &lt;head&gt;, deploy, then press check — our server looks for it on your homepage. Same code, same proof.
                  </p>
                  <div className="mt-2"><CopyRow label="Meta tag (paste in <head>)" value={`<meta name="clyvro-verification" content="${issued.recordValue}" />`} /></div>
                </div>
                <p className="text-xs text-ink-mute">The code expires in 7 days. Verification is confirmed on our server (public DNS or your homepage) — nothing you click here can fake it.</p>
              </div>
            )}
            {message && !issued && <p role="alert" className="form-error mt-3">{message}</p>}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-mute">{label}</p>
        <p className="truncate font-mono text-xs" title={value}>{value}</p>
      </div>
      <button type="button" className="button-secondary !min-h-9 shrink-0 !px-2.5 !py-1.5 text-xs"
        onClick={() => { void navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useToast } from "@/components/Toast";

interface Info { email: string; blockingOrgs: string[]; soleOwnerOrgs: string[]; memberOrgs: string[] }

/** Danger zone: permanent account deletion with typed-email confirmation. */
export default function DeleteAccount() {
  const { toast } = useToast();
  const [info, setInfo] = useState<Info | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/account");
      if (res.ok) setInfo((await res.json()) as Info);
    })();
  }, []);

  const matches = info ? confirmation.trim().toLowerCase() === info.email.toLowerCase() : false;
  const blocked = (info?.blockingOrgs.length ?? 0) > 0;

  async function destroy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmation }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "The account couldn't be deleted.");
      toast("success", "Account deleted", "Your data has been removed. Thanks for trying Clyvro.");
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The account couldn't be deleted.");
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="delete-account-heading" className="mt-6 rounded-2xl border border-bad/40 bg-surface p-6">
      <h2 id="delete-account-heading" className="flex items-center gap-2 font-semibold text-bad">
        <TriangleAlert size={17} aria-hidden /> Delete account
      </h2>
      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-soft">
        Permanently delete your Clyvro account. Workspaces only you own are deleted with everything in them
        (websites, reports, schedules, cron jobs). In shared workspaces you simply leave, and your work there
        is handed to the workspace owner. This can&apos;t be undone.
      </p>
      {blocked && info && (
        <p role="alert" className="form-error mt-3">
          You own {info.blockingOrgs.join(", ")}, which still has other members. Remove the team from the Team page first — then come back here.
        </p>
      )}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} disabled={!info || blocked}
          className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-bad px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad/50 disabled:opacity-50">
          Delete my account
        </button>
      ) : (
        <div className="mt-4">
          {info && (
            <ul className="mb-3 list-inside list-disc space-y-1 text-sm text-ink-soft">
              {info.soleOwnerOrgs.map((n) => <li key={n}>Workspace <strong className="text-ink">{n}</strong> and all its data will be deleted.</li>)}
              {info.memberOrgs.map((n) => <li key={n}>You&apos;ll leave <strong className="text-ink">{n}</strong>; your work there stays with its owner.</li>)}
            </ul>
          )}
          <label htmlFor="del-confirm" className="form-label">Type your email ({info?.email}) to confirm</label>
          <input id="del-confirm" type="email" autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)}
            placeholder={info?.email} className="form-control mt-1.5 max-w-md" />
          {error && <p role="alert" className="form-error mt-3">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={!matches || busy} onClick={() => void destroy()}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-bad px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad/50 disabled:opacity-50">
              {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
              {busy ? "Deleting…" : "Permanently delete"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setConfirmation(""); }} className="button-secondary">Keep my account</button>
          </div>
        </div>
      )}
    </section>
  );
}

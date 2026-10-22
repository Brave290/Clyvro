"use client";

import { useState } from "react";
import { MailCheck, Send } from "lucide-react";

interface Status {
  configured: boolean;
  transport: "SMTP_URL" | "SMTP_HOST" | "none";
  missing: string[];
  fromConfigured: boolean;
  authenticationConfigured: boolean;
}

export default function AdminEmailTest({ initialStatus }: { initialStatus: Status }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState(initialStatus);

  async function runTest() {
    setBusy(true);
    setMessage(null);
    setError(false);
    try {
      const response = await fetch("/api/admin/test-email", { method: "POST" });
      const json = await response.json() as { sent?: boolean; to?: string; status?: Status; message?: string; reason?: string };
      if (json.status) setStatus(json.status);
      if (!response.ok || !json.sent) {
        setError(true);
        setMessage(json.reason === "not-configured"
          ? `Email isn't ready on this deployment. Check: ${(json.status?.missing ?? status.missing).join(", ") || "SMTP settings"}.`
          : json.message ?? "The SMTP provider did not accept this message. Check the deployment logs for a redacted transport error code.");
      } else {
        setMessage(`${json.message} Sent to ${json.to ?? "your signed-in admin address"}.`);
      }
    } catch {
      setError(true);
      setMessage("The email check could not reach the app. Try again or inspect the Vercel deployment logs.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${status.configured ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>
            <MailCheck size={20} aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold">Transactional email</h2>
            <p className="mt-1 text-sm text-ink-mute">
              {status.configured ? `Transport is configured through ${status.transport}.` : "SMTP is not ready on this deployment."}
            </p>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-canvas p-3"><dt className="text-xs text-ink-mute">SMTP transport</dt><dd className="mt-1 font-semibold">{status.configured ? "Ready" : "Not ready"}</dd></div>
          <div className="rounded-xl border border-line bg-canvas p-3"><dt className="text-xs text-ink-mute">Authentication</dt><dd className="mt-1 font-semibold">{status.authenticationConfigured ? "Credentials present" : "No authenticated credentials detected"}</dd></div>
          <div className="rounded-xl border border-line bg-canvas p-3"><dt className="text-xs text-ink-mute">Sender identity</dt><dd className="mt-1 font-semibold">{status.fromConfigured ? "EMAIL_FROM set" : "Using app default"}</dd></div>
        </dl>
        {status.missing.length > 0 && (
          <p className="mt-4 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm" role="status">
            Check these Vercel variable names: <strong>{status.missing.join(", ")}</strong>. Add or correct them, then redeploy.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">Send a delivery check</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-mute">
          Sends one Clyvro-branded test message only to the administrator currently signed in. A successful result means the SMTP provider accepted the message; check your inbox and spam folder, because that alone does not guarantee inbox placement.
        </p>
        <button type="button" onClick={() => void runTest()} disabled={busy || !status.configured} className="button-primary mt-4 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
          <Send size={16} aria-hidden />{busy ? "Sending…" : "Send test to my admin email"}
        </button>
        {message && <p className={`mt-4 rounded-xl border px-4 py-3 text-sm ${error ? "border-bad/25 bg-bad-soft text-bad" : "border-good/25 bg-good-soft text-good"}`} role="status">{message}</p>}
      </section>
    </div>
  );
}

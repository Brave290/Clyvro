"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";
import { useToast } from "@/components/Toast";

export default function CreateClientForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, contactName, contactEmail, notes }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't add the client.");
      toast("success", "Client added", `${data.client.name} is ready — add their website next.`);
      router.push(`/app/clients/${data.client.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the client.");
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition hover:border-accent/50 focus:border-accent focus:ring-2 focus:ring-accent/25";

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="flex items-center gap-2 font-semibold"><Plus size={17} className="text-accent" aria-hidden /> New client</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        Group a customer&apos;s websites, checks, and reports under their name.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-bad/25 bg-bad-soft p-3 text-sm text-bad">{error}</p>
      )}
      <label htmlFor="cc-name" className="mt-4 block text-sm font-medium">Client / business name</label>
      <input id="cc-name" type="text" required value={name} onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Acme Plumbing Ltd" className={inputCls} />
      <label htmlFor="cc-contact" className="mt-4 block text-sm font-medium">
        Contact person <span className="font-normal text-ink-mute">(optional)</span>
      </label>
      <input id="cc-contact" type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputCls} />
      <label htmlFor="cc-email" className="mt-4 block text-sm font-medium">
        Contact email <span className="font-normal text-ink-mute">(optional)</span>
      </label>
      <input id="cc-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
      <label htmlFor="cc-notes" className="mt-4 block text-sm font-medium">
        Internal notes <span className="font-normal text-ink-mute">(optional, never shown to clients)</span>
      </label>
      <textarea id="cc-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
      <button type="submit" disabled={busy}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-md active:translate-y-0 disabled:opacity-60">
        {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
        {busy ? "Adding…" : "Add client"}
      </button>
    </form>
  );
}

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

  return (
    <form onSubmit={submit} aria-busy={busy} className="form-panel">
      <h2 className="flex items-center gap-2 font-semibold"><Plus size={17} className="text-accent" aria-hidden /> New client</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        Group a customer&apos;s websites, checks, and reports under their name.
      </p>
      {error && (
        <p role="alert" className="form-error mt-4">{error}</p>
      )}
      <label htmlFor="cc-name" className="form-label mt-5">Client / business name <span className="text-bad" aria-hidden="true">*</span></label>
      <input id="cc-name" type="text" required value={name} onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Acme Plumbing Ltd" className="form-control mt-1.5" />
      <label htmlFor="cc-contact" className="form-label mt-4">
        Contact person <span className="font-normal text-ink-mute">(optional)</span>
      </label>
      <input id="cc-contact" type="text" autoComplete="name" value={contactName} onChange={(e) => setContactName(e.target.value)} className="form-control mt-1.5" />
      <label htmlFor="cc-email" className="form-label mt-4">
        Contact email <span className="font-normal text-ink-mute">(optional)</span>
      </label>
      <input id="cc-email" type="email" autoComplete="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="form-control mt-1.5" />
      <label htmlFor="cc-notes" className="form-label mt-4">
        Internal notes <span className="font-normal text-ink-mute">(optional, never shown to clients)</span>
      </label>
      <textarea id="cc-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="form-control mt-1.5" />
      <button type="submit" disabled={busy}
        className="button-primary mt-5">
        {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
        {busy ? "Adding…" : "Add client"}
      </button>
    </form>
  );
}

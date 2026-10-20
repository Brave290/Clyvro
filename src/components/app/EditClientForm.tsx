"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/Dialog";

interface EditClientFormProps {
  client: { id: string; name: string; contactName: string | null; contactEmail: string | null; notes: string | null };
}

export default function EditClientForm({ client }: EditClientFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(client.name);
  const [contactName, setContactName] = useState(client.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(client.contactEmail ?? "");
  const [notes, setNotes] = useState(client.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, contactName, contactEmail, notes }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't save changes.");
      toast("success", "Client updated");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    const res = await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
    setConfirmArchive(false);
    if (res.ok) {
      toast("success", "Client archived", "Their websites stay in your workspace, unassigned.");
      router.push("/app/clients");
      router.refresh();
    } else {
      toast("error", "Couldn't archive the client");
    }
  }

  const inputCls =
    "mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition hover:border-accent/50 focus:border-accent focus:ring-2 focus:ring-accent/25";

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-semibold">Client details</h2>
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-bad/25 bg-bad-soft p-3 text-sm text-bad">{error}</p>
      )}
      <label htmlFor="ec-name" className="mt-4 block text-sm font-medium">Client / business name</label>
      <input id="ec-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      <label htmlFor="ec-contact" className="mt-4 block text-sm font-medium">Contact person</label>
      <input id="ec-contact" type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputCls} />
      <label htmlFor="ec-email" className="mt-4 block text-sm font-medium">Contact email</label>
      <input id="ec-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
      <label htmlFor="ec-notes" className="mt-4 block text-sm font-medium">
        Internal notes <span className="font-normal text-ink-mute">(never shown to clients)</span>
      </label>
      <textarea id="ec-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="submit" disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover hover:shadow-md disabled:opacity-60">
          {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
          Save changes
        </button>
        <button type="button" onClick={() => setConfirmArchive(true)}
          className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-bad transition hover:border-bad/40">
          Archive client
        </button>
      </div>
      <ConfirmDialog
        open={confirmArchive}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => void archive()}
        title="Archive this client?"
        message="The client disappears from your lists. Their websites and past reports stay in your workspace, just unassigned."
        confirmLabel="Archive client"
        cancelLabel="Keep client"
        destructive
      />
    </form>
  );
}

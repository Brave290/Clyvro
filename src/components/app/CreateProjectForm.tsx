"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, LoaderCircle, Plus } from "lucide-react";
import { useToast } from "@/components/Toast";
import { BrandSelect } from "@/components/ui";

export default function CreateProjectForm({ defaultClientId }: { defaultClientId?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [clientId, setClientId] = useState(defaultClientId ?? "none");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/clients")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.clients) setClients(d.clients.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, siteUrl, clientId: clientId === "none" ? null : clientId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't add the website.");
      toast("success", "Website added", `${data.project.name} is ready for its first check.`);
      router.push(`/app/projects/${data.project.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the website.");
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition hover:border-accent/50 focus:border-accent focus:ring-2 focus:ring-accent/25";

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="flex items-center gap-2 font-semibold"><Plus size={17} className="text-accent" aria-hidden /> New website</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        One website you&apos;ll check over time — yours, or a client&apos;s you&apos;re allowed to assess.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-bad/25 bg-bad-soft p-3 text-sm text-bad">{error}</p>
      )}
      <label htmlFor="cp-name" className="mt-4 block text-sm font-medium">Name</label>
      <input id="cp-name" type="text" required value={name} onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Acme Plumbing — main site" className={inputCls} />
      <label htmlFor="cp-url" className="mt-4 block text-sm font-medium">Website address</label>
      <div className="relative">
        <Globe size={16} className="pointer-events-none absolute left-3.5 top-[calc(50%+3px)] -translate-y-1/2 text-ink-mute" aria-hidden />
        <input id="cp-url" type="text" inputMode="url" required value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)}
          placeholder="example.com" className={`${inputCls} pl-10`} />
      </div>
      {clients.length > 0 && (
        <>
          <label htmlFor="cp-client" className="mt-4 block text-sm font-medium">
            Client <span className="font-normal text-ink-mute">(optional)</span>
          </label>
          <div className="mt-1.5">
            <BrandSelect
              id="cp-client"
              value={clientId}
              onChange={setClientId}
              options={[{ value: "none", label: "No client — just us" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
        </>
      )}
      <button type="submit" disabled={busy}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-md active:translate-y-0 disabled:opacity-60">
        {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
        {busy ? "Adding…" : "Add website"}
      </button>
    </form>
  );
}

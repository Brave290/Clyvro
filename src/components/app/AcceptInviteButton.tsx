"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useToast } from "@/components/Toast";

export default function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't accept the invitation.");
      toast("success", "Welcome aboard", `You've joined ${json.organizationName}.`);
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't accept the invitation.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-bad/25 bg-bad-soft p-3 text-sm text-bad">{error}</p>
      )}
      <button onClick={() => void accept()} disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover hover:shadow-md disabled:opacity-60">
        {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden />}
        {busy ? "Joining…" : "Accept invitation"}
      </button>
    </div>
  );
}

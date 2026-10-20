"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandSelect } from "@/components/ui";
import { useToast } from "@/components/Toast";

export default function AssignClientSelect({
  projectId,
  currentClientId,
}: {
  projectId: string;
  currentClientId: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [clients, setClients] = useState<{ id: string; name: string }[] | null>(null);
  const [value, setValue] = useState(currentClientId ?? "none");

  useEffect(() => {
    void fetch("/api/clients")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setClients(d?.clients?.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) ?? []))
      .catch(() => setClients([]));
  }, []);

  if (clients === null || clients.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="assign-client" className="text-xs font-medium text-ink-mute">Client</label>
      <div className="w-48">
        <BrandSelect
          id="assign-client"
          value={value}
          onChange={(v) => {
            setValue(v);
            void fetch(`/api/projects/${projectId}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ clientId: v === "none" ? null : v }),
            }).then((res) => {
              if (res.ok) { toast("success", "Client updated"); router.refresh(); }
              else { toast("error", "Couldn't update the client"); setValue(currentClientId ?? "none"); }
            });
          }}
          options={[{ value: "none", label: "No client" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
        />
      </div>
    </div>
  );
}

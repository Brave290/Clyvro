"use client";
import { useRouter } from "next/navigation";
import { BrandSelect } from "@/components/ui";

export default function OrgSwitcher({
  orgs,
  activeId,
}: {
  orgs: { organizationId: string; name: string }[];
  activeId: string;
}) {
  const router = useRouter();
  if (orgs.length <= 1) return null;
  return (
    <div className="w-44">
      <label className="sr-only" htmlFor="org-switcher">Switch workspace</label>
      <BrandSelect
        id="org-switcher"
        value={activeId}
        onChange={(v) => {
          void fetch("/api/org/switch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ organizationId: v }),
          }).then(() => router.refresh());
        }}
        options={orgs.map((o) => ({ value: o.organizationId, label: o.name }))}
      />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { PageSkeleton } from "@/components/Skeleton";
import OrgApiKeys from "@/components/app/OrgApiKeys";

interface SettingsData {
  organization: { planId: string };
  myRole: string;
}

export default function ApiKeysPage() {
  const [data, setData] = useState<SettingsData | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/org/settings");
    if (!res.ok) return;
    setData((await res.json()) as SettingsData);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <PageSkeleton />;

  const canManage = data.myRole === "owner" || data.myRole === "admin";

  return (
    <div className="mt-8 pb-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            <KeyRound size={14} aria-hidden /> Pro &amp; Agency
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">API &amp; keys</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            One Bearer key for two jobs: start a Full Scan from your own code, or put Site Guard in front of a site you own.
            Unlimited on Pro and Agency. This is a strict scanner and a site guard — not a pentest product.
          </p>
        </div>
        <Link href="/docs/api" className="button-secondary">Open full docs</Link>
      </header>
      <div className="mt-8">
        <OrgApiKeys planId={data.organization.planId} canManage={canManage} />
      </div>
    </div>
  );
}

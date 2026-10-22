"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft, CalendarClock, DatabaseBackup, FileText, History, LayoutDashboard, Lightbulb, ShieldCheck, Sparkles, ScanSearch, Users, Building2, Wrench, Mail,
} from "lucide-react";

const ITEMS = [
  { label: "Overview", href: "/admin", Icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", Icon: Users },
  { label: "Workspaces & plans", href: "/admin/workspaces", Icon: Building2 },
  { label: "Scan jobs", href: "/admin/jobs", Icon: ScanSearch },
  { label: "Feature requests", href: "/admin/feature-requests", Icon: Lightbulb },
  { label: "Cron", href: "/admin/cron", Icon: CalendarClock },
  { label: "Backup & Restore", href: "/admin/backups", Icon: DatabaseBackup },
  { label: "Security", href: "/admin/security", Icon: ShieldCheck },
  { label: "Maintenance", href: "/admin/maintenance", Icon: Wrench },
  { label: "Email delivery", href: "/admin/email", Icon: Mail },
  { label: "Legal pages", href: "/admin/legal", Icon: FileText },
  { label: "Changelog", href: "/admin/changelog", Icon: Sparkles },
  { label: "Audit log", href: "/admin/audit-log", Icon: History },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-line px-5">
          <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight text-ink">
            <img src="/clyvro-icon.png" alt="Clyvro" width={36} height={36} className="h-9 w-9 rounded-xl object-contain" />
            <span className="text-lg">Clyvro Admin</span>
          </Link>
        </div>
        <nav aria-label="Admin sections" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {ITEMS.map(({ label, href, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  active ? "bg-accent-soft font-semibold text-accent-deep" : "font-medium text-ink-soft hover:bg-canvas hover:text-ink"
                }`}>
                <Icon size={18} className={active ? "text-accent" : "text-ink-mute"} aria-hidden />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line px-3 py-3">
          <p className="truncate px-3 text-xs text-ink-mute" title={email}>{email}</p>
          <Link href="/app/scan" className="mt-1 flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-soft transition hover:bg-canvas hover:text-ink">
            <ArrowLeft size={17} aria-hidden /> Back to workspace
          </Link>
        </div>
      </aside>

      {/* Mobile top bar + horizontal section nav */}
      <div className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <img src="/clyvro-icon.png" alt="Clyvro" width={32} height={32} className="h-8 w-8 rounded-lg object-contain" />
          <span className="font-semibold">Clyvro Admin</span>
          <Link href="/app/scan" className="ml-auto text-sm font-semibold text-accent">Workspace</Link>
        </div>
        <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto px-3 pb-2">
          {ITEMS.map(({ label, href, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  active ? "bg-accent-soft text-accent-deep" : "text-ink-soft hover:bg-canvas"
                }`}>
                <Icon size={13} aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}

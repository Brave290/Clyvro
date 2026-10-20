"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  BarChart3,
  Building2,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanSearch,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import OrgSwitcher from "@/components/app/OrgSwitcher";
import ThemeToggle from "@/components/ThemeToggle";

const NAV_MAIN = [
  { label: "Overview", href: "/app", Icon: LayoutDashboard },
  { label: "Clients", href: "/app/clients", Icon: Building2 },
  { label: "Schedules", href: "/app/schedules", Icon: CalendarClock },
  { label: "Team", href: "/app/team", Icon: Users },
] as const;

const NAV_ACCOUNT = [
  { label: "Settings", href: "/app/settings", Icon: Settings },
  { label: "Plans & pricing", href: "/pricing", Icon: BarChart3 },
] as const;

type WorkspaceSidebarProps = {
  orgName: string;
  orgs: { organizationId: string; name: string }[];
  activeId: string;
  email: string;
  roleLabel: string;
  planName: string;
  scansUsed: number;
  scansLimit: number;
  signOutAction: () => Promise<void>;
};

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/" className="group flex min-w-0 items-center gap-2 font-semibold tracking-tight text-ink">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-white shadow-sm transition duration-200 group-hover:bg-accent-hover">
        <ScanSearch size={18} aria-hidden />
      </span>
      <span className="truncate text-lg">Clyvro</span>
    </Link>
  );
}

function NavSection({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: readonly { label: string; href: string; Icon: typeof LayoutDashboard }[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label={title}>
      <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-mute">{title}</p>
      <ul className="space-y-1">
        {items.map(({ label, href, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  active
                    ? "bg-accent-soft font-semibold text-accent-deep shadow-sm"
                    : "font-medium text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
              >
                <Icon size={18} className={`shrink-0 ${active ? "text-accent" : "text-ink-mute group-hover:text-accent"}`} aria-hidden />
                <span className="min-w-0 truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function WorkspaceCard({
  orgName,
  planName,
  orgs,
  activeId,
}: Pick<WorkspaceSidebarProps, "orgName" | "planName" | "orgs" | "activeId">) {
  const initial = orgName.trim().charAt(0).toUpperCase() || "W";
  return (
    <section className="rounded-2xl border border-line bg-canvas/70 p-3.5" aria-label="Current workspace">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-sm font-bold text-white" aria-hidden>
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={orgName}>{orgName}</p>
          <p className="truncate text-xs text-ink-mute">{planName} plan</p>
        </div>
      </div>
      {orgs.length > 1 && (
        <div className="mt-3 border-t border-line pt-3">
          <OrgSwitcher orgs={orgs} activeId={activeId} />
        </div>
      )}
    </section>
  );
}

function UsageCard({ planName, scansUsed, scansLimit }: Pick<WorkspaceSidebarProps, "planName" | "scansUsed" | "scansLimit">) {
  const percent = scansLimit > 0 ? Math.min(100, Math.round((scansUsed / scansLimit) * 100)) : 0;
  const remaining = Math.max(0, scansLimit - scansUsed);
  return (
    <section className="rounded-2xl border border-line bg-canvas/70 p-3.5" aria-label="Plan and scan usage">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck size={15} className="shrink-0 text-accent" aria-hidden />
          <p className="truncate text-sm font-semibold">{planName} plan</p>
        </div>
        <Link href="/pricing" className="shrink-0 text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
          Manage
        </Link>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-soft">
        <span>Monthly scans</span>
        <span className="font-semibold text-ink">{scansUsed} / {scansLimit}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Monthly scan usage" aria-valuemin={0} aria-valuemax={scansLimit} aria-valuenow={Math.min(scansUsed, scansLimit)}>
        <div className={`h-full rounded-full transition-all ${percent >= 90 ? "bg-warn" : "bg-accent"}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-ink-mute">{remaining} scan{remaining === 1 ? "" : "s"} left this month</p>
    </section>
  );
}

function SignOut({ signOutAction }: { signOutAction: () => Promise<void> }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-ink-soft transition hover:bg-bad-soft hover:text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <LogOut size={17} className="shrink-0" aria-hidden />
        Sign out
      </button>
    </form>
  );
}

/** The sidebar body, shared by the desktop column and the mobile drawer. */
function SidebarBody(props: WorkspaceSidebarProps & { pathname: string; onNavigate?: () => void }) {
  const { pathname, onNavigate } = props;
  const emailInitial = props.email.trim().charAt(0).toUpperCase() || "U";
  return (
    <>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <WorkspaceCard orgName={props.orgName} planName={props.planName} orgs={props.orgs} activeId={props.activeId} />
        <NavSection title="Workspace" items={NAV_MAIN} pathname={pathname} onNavigate={onNavigate} />
        <NavSection title="Account" items={NAV_ACCOUNT} pathname={pathname} onNavigate={onNavigate} />
        <UsageCard planName={props.planName} scansUsed={props.scansUsed} scansLimit={props.scansLimit} />
      </div>
      <div className="space-y-2 border-t border-line px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex min-w-0 items-center gap-3 px-3 py-1">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent" aria-hidden>
            {emailInitial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" title={props.email}>{props.email}</p>
            <p className="truncate text-xs text-ink-mute">{props.roleLabel}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-3">
          <span className="text-xs font-medium text-ink-soft">Theme</span>
          <ThemeToggle />
        </div>
        <SignOut signOutAction={props.signOutAction} />
      </div>
    </>
  );
}

export default function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  // A route change closes the drawer even when navigation came from browser controls.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock the page behind the drawer, support Escape, focus the first control, and restore focus.
  useEffect(() => {
    if (!open) return;
    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("a[href], button")?.focus();

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButton?.focus();
    };
  }, [open, close]);

  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      drawerRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex=\"0\"]") ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const drawer = open && typeof document !== "undefined"
    ? createPortal(
        <div className="fixed inset-0 z-[60] lg:hidden" role="presentation">
          <button
            type="button"
            aria-label="Close workspace navigation"
            onClick={close}
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80"
          />
          <aside
            ref={drawerRef}
            id="workspace-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            onKeyDown={trapFocus}
            className="absolute inset-y-0 left-0 flex w-[85vw] max-w-80 flex-col border-r border-line bg-surface shadow-[20px_0_60px_rgba(2,6,23,0.22)] outline-none"
          >
            <div className="flex h-14 items-center justify-between gap-3 border-b border-line px-4">
              <Brand />
              <button
                type="button"
                onClick={close}
                aria-label="Close workspace navigation"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-soft transition hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            <SidebarBody {...props} pathname={pathname} onNavigate={close} />
          </aside>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-line px-5">
          <Brand />
        </div>
        <SidebarBody {...props} pathname={pathname} />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open workspace navigation"
          aria-expanded={open}
          aria-controls="workspace-mobile-drawer"
          className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-soft transition hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Menu size={21} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <Brand />
        </div>
        <ThemeToggle />
      </div>
      {drawer}
    </>
  );
}

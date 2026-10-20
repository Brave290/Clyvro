"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ScanSearch, Menu, X, ArrowRight, Radar } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  ["Scan a site", "/scan"],
  ["How it works", "/how-it-works"],
  ["Pricing", "/pricing"],
] as const;

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2 font-semibold tracking-tight text-ink">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white transition duration-300 group-hover:rotate-6 group-hover:bg-accent-hover">
        <ScanSearch size={17} aria-hidden />
      </span>
      <span className="text-lg">Clyvro</span>
    </Link>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false); // keeps the drawer mounted during the close animation
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Mount/unmount with exit animation.
  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }
    const id = setTimeout(() => setRendered(false), 320);
    return () => clearTimeout(id);
  }, [open]);

  // Scroll lock, Escape, initial focus, focus restoration.
  useEffect(() => {
    if (!open) return;
    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("a[href], button")?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButton?.focus();
    };
  }, [open, close]);

  // Signed-in routes render their own workspace shell, so the public landing
  // navigation never appears in the app. (Placed below every hook — hooks
  // must run unconditionally.)
  if (pathname === "/app" || pathname.startsWith("/app/")) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm font-medium text-ink-soft lg:flex" aria-label="Main">
          {LINKS.map(([l, h]) => (
            <Link
              key={h}
              href={h}
              className="relative transition duration-200 after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:rounded-full after:bg-accent after:transition-all after:duration-200 hover:text-ink hover:after:w-full"
            >
              {l}
            </Link>
          ))}
          <Link
            href="/sign-in"
            className="relative transition duration-200 after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:rounded-full after:bg-accent after:transition-all after:duration-200 hover:text-ink hover:after:w-full"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-white shadow-sm transition duration-200 hover:bg-accent-hover hover:shadow-md"
          >
            Get started free <ArrowRight size={15} aria-hidden />
          </Link>
          <ThemeToggle />
        </nav>
        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle />
          <button
            ref={menuButtonRef}
            className="rounded-lg p-2 transition hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-drawer"
            onClick={() => setOpen(!open)}
          >
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
        </div>
      </div>

      {/* Full-height slide-in drawer from the right (mobile/tablet).
          Rendered through a portal on <body>: the sticky header's
          `backdrop-blur` (backdrop-filter) would otherwise become the
          containing block for `position: fixed`, trapping the drawer
          inside the 64px header bar instead of the viewport. */}
      {rendered && createPortal(
        <div className="fixed inset-0 z-[60] lg:hidden" role="presentation">
          <button
            aria-label="Close menu"
            onClick={close}
            className={`absolute inset-0 cursor-default bg-slate-950/50 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
          />
          <aside
            ref={drawerRef}
            id="mobile-drawer"
            aria-label="Mobile navigation"
            className={`absolute right-0 top-0 flex h-full w-[64vw] max-w-[264px] flex-col border-l border-line bg-surface shadow-[-24px_0_64px_rgba(2,6,23,0.25)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              open ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <Logo />
              <button
                onClick={close}
                aria-label="Close menu"
                className="rounded-lg p-2 transition hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <X aria-hidden />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3.5 py-4" aria-label="Mobile">
              <ul className="space-y-1">
                {LINKS.map(([l, h], i) => (
                  <li
                    key={h}
                    style={{ transitionDelay: open ? `${80 + i * 60}ms` : "0ms" }}
                    className={`transition-all duration-300 ${open ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"}`}
                  >
                    <Link
                      href={h}
                      onClick={close}
                      className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold transition hover:bg-accent-soft hover:text-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                    >
                      {l}
                      <ArrowRight size={14} className="text-ink-mute" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>

              <Link
                href="/scan"
                onClick={close}
                style={{ transitionDelay: open ? "280ms" : "0ms" }}
                className={`mt-4 flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  open ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
                }`}
              >
                <Radar size={15} aria-hidden /> Run a free scan
              </Link>
              <Link
                href="/sign-up"
                onClick={close}
                style={{ transitionDelay: open ? "340ms" : "0ms" }}
                className={`mt-2 flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold transition-all duration-300 hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  open ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
                }`}
              >
                Create free account <ArrowRight size={14} aria-hidden />
              </Link>
              <Link
                href="/sign-in"
                onClick={close}
                style={{ transitionDelay: open ? "400ms" : "0ms" }}
                className={`mt-2 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-300 hover:bg-accent-soft hover:text-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  open ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
                }`}
              >
                Sign in
              </Link>
            </nav>

            <div className="border-t border-line px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-soft">Theme</span>
                <ThemeToggle />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-mute">
                Find the friction. Fix the conversion. Evidence-first audits — no invented revenue claims.
              </p>
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </header>
  );
}

"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AlertTriangle, ShieldCheck, X } from "lucide-react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type DialogTone = "default" | "danger";

/** Shared, accessible Clyvro modal with focus management and scroll locking. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  describedById,
  eyebrow = "Clyvro workspace",
  tone = "default",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  describedById?: string;
  eyebrow?: string;
  tone?: DialogTone;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const isDanger = tone === "danger";
  const BrandIcon = isDanger ? AlertTriangle : ShieldCheck;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="animate-modal-in absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role={isDanger ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedById}
        tabIndex={-1}
        className="animate-modal-in relative w-full max-w-lg overflow-hidden rounded-t-[1.75rem] border border-line bg-elevated shadow-[0_24px_72px_rgba(2,6,23,0.3)] outline-none sm:rounded-[1.75rem]"
      >
        <div className={`h-1 w-full ${isDanger ? "bg-bad" : "bg-accent"}`} aria-hidden="true" />
        <div className="p-5 sm:p-7">
          <div className="flex items-start gap-3.5">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${isDanger ? "bg-bad-soft text-bad" : "bg-accent-soft text-accent"}`}>
              <BrandIcon size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={`text-[0.68rem] font-bold uppercase tracking-[0.16em] ${isDanger ? "text-bad" : "text-accent"}`}>
                {eyebrow}
              </p>
              <h2 id={titleId} className="mt-1 text-lg font-bold tracking-tight text-ink sm:text-xl">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-mute transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}) {
  const descId = useId();
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      describedById={descId}
      eyebrow={destructive ? "Clyvro · permanent action" : "Clyvro · confirm action"}
      tone={destructive ? "danger" : "default"}
    >
      <p id={descId} className="text-sm leading-relaxed text-ink-soft">{message}</p>
      <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="button-secondary">{cancelLabel}</button>
        <button type="button" onClick={onConfirm} className={destructive ? "button-danger" : "button-primary"}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

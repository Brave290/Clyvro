"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Accessible branded modal dialog: focus trap, Escape to close,
 * backdrop click to dismiss, focus restoration to the opener,
 * body scroll lock. ConfirmDialog builds on it for consequential
 * actions (the confirm() replacement).
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  children,
  describedById,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  describedById?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Initial focus: first focusable element, else the panel itself.
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
        aria-label="Close dialog"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 cursor-default bg-slate-950/50 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedById}
        tabIndex={-1}
        className="animate-scale-in relative w-full max-w-md rounded-3xl border border-line bg-elevated p-6 shadow-[0_24px_64px_rgba(2,6,23,0.28)] outline-none"
      >
        <div className="flex items-start gap-3">
          <h2 id={titleId} className="flex-1 text-lg font-semibold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-ink-mute transition hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <X size={17} aria-hidden />
          </button>
        </div>
        {children}
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
    <Dialog open={open} onClose={onCancel} title={title} describedById={descId}>
      <p id={descId} className="mt-2 text-sm leading-relaxed text-ink-soft">{message}</p>
      <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button
          onClick={onCancel}
          className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition duration-200 hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
            destructive ? "bg-red-600 hover:bg-red-500 dark:bg-red-600 dark:hover:bg-red-500" : "bg-accent hover:bg-accent-hover"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

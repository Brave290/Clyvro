"use client";
import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { CircleCheck, CircleAlert, Info, X } from "lucide-react";

/**
 * Branded toast notifications — the replacement for any alert()-style
 * feedback. Polite live region; errors use role="alert". Auto-dismisses;
 * pause-free by design (short messages only). Reduced motion is honored
 * by the global CSS.
 */

type ToastKind = "success" | "error" | "info";
interface ToastItem { id: number; kind: ToastKind; title: string; message?: string }

const ToastContext = createContext<{ toast: (kind: ToastKind, title: string, message?: string) => void }>({
  toast: () => undefined,
});

export const useToast = () => useContext(ToastContext);

const KIND_STYLES: Record<ToastKind, { Icon: typeof Info; cls: string; iconCls: string }> = {
  success: { Icon: CircleCheck, cls: "border-good/30", iconCls: "text-good" },
  error: { Icon: CircleAlert, cls: "border-bad/30", iconCls: "text-bad" },
  info: { Icon: Info, cls: "border-line", iconCls: "text-accent" },
};

const DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = ++idRef.current;
      setToasts((list) => [...list.slice(-3), { id, kind, title, message }]);
      timers.current.set(id, setTimeout(() => dismiss(id), DISMISS_MS));
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[90] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:items-end" aria-live="polite">
        {toasts.map((t) => {
          const { Icon, cls, iconCls } = KIND_STYLES[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === "error" ? "alert" : "status"}
              className={`animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border ${cls} bg-elevated p-4 shadow-[0_12px_32px_rgba(2,6,23,0.18)]`}
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${iconCls}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.message && <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{t.message}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded-md p-1 text-ink-mute transition hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <X size={15} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

"use client";
import {
  useEffect, useId, useRef, useState,
} from "react";
import type { Severity, ConfidenceBasis } from "@/lib/types";
import { confidenceLabel } from "@/lib/types";
import { CircleAlert, TriangleAlert, Info, CircleCheck, ChevronDown, Check } from "lucide-react";

const SEV: Record<Severity, { cls: string; Icon: typeof Info; label: string }> = {
  critical: { cls: "bg-bad-soft text-bad", Icon: CircleAlert, label: "Critical" },
  high: { cls: "bg-warn-soft text-warn", Icon: TriangleAlert, label: "High" },
  medium: { cls: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300", Icon: TriangleAlert, label: "Medium" },
  low: { cls: "bg-slate-100 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300", Icon: Info, label: "Low" },
};
export function SeverityBadge({ s }: { s: Severity }) {
  const { cls, Icon, label } = SEV[s];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}><Icon size={13} aria-hidden />{label}</span>;
}
export function ConfidenceBadge({ b }: { b: ConfidenceBasis }) {
  const Icon = b === "heuristic" ? Info : CircleCheck;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${b === "heuristic" ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300" : "border-line bg-canvas text-ink-soft"}`} title="How this finding was detected"><Icon size={13} aria-hidden />{confidenceLabel(b)}</span>;
}

/* ------------------------------------------------------------------ */
/* BrandSelect — Clyvro's accessible dropdown picker (listbox pattern).
   Full keyboard support: arrows/home/end, enter/space to choose,
   Escape/tab to close, letter typeahead. Focus stays on the trigger
   (aria-activedescendant tracks the highlighted option).              */
/* ------------------------------------------------------------------ */

export interface BrandSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function BrandSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  className = "",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: BrandSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [openUpward, setOpenUpward] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const uid = useId();
  const listId = `${id}-listbox-${uid.replace(/[^a-zA-Z0-9]/g, "")}`;

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options.find((o) => o.value === value);

  const openList = () => {
    if (disabled) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setOpenUpward(window.innerHeight - rect.bottom < 280 && rect.top > 280);
    setHighlighted(selectedIndex);
    setOpen(true);
  };
  const closeList = () => setOpen(false);

  const choose = (index: number) => {
    const opt = options[index];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    closeList();
    buttonRef.current?.focus();
  };

  // Focus enters the listbox while open (button pattern); the highlighted
  // option is exposed via aria-activedescendant on the listbox itself.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open ]);

  const moveHighlight = (delta: number) => {
    setHighlighted((h) => {
      let next = h;
      for (let step = 0; step < options.length; step++) {
        next = (next + delta + options.length) % options.length;
        if (!options[next]?.disabled) break;
      }
      return next;
    });
  };

  // Click-outside & scroll the highlighted option into view.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeList();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${highlighted}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); moveHighlight(1); break;
      case "ArrowUp": e.preventDefault(); moveHighlight(-1); break;
      case "Home": e.preventDefault(); setHighlighted(options.findIndex((o) => !o.disabled)); break;
      case "End": e.preventDefault(); setHighlighted(options.length - 1 - [...options].reverse().findIndex((o) => !o.disabled)); break;
      case "Enter":
      case " ": e.preventDefault(); choose(highlighted); break;
      case "Escape": e.preventDefault(); closeList(); buttonRef.current?.focus(); break;
      case "Tab": closeList(); break;
      default: {
        if (e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
          const now = Date.now();
          const text = now - typeahead.current.at > 600 ? e.key : typeahead.current.text + e.key;
          typeahead.current = { text, at: now };
          const idx = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(text.toLowerCase()));
          if (idx >= 0) setHighlighted(idx);
        }
      }
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? closeList() : openList())}
        className="group flex w-full items-center gap-2 rounded-lg border border-line bg-surface py-2.5 pl-3.5 pr-3 text-left text-sm font-medium text-ink shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition duration-200 hover:border-accent/50 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-ink-mute"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={`shrink-0 text-ink-mute transition duration-200 group-hover:text-accent ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={id}
          aria-activedescendant={`${listId}-${highlighted}`}
          className={`animate-pop-in absolute left-0 z-50 max-h-64 w-full min-w-full overflow-auto rounded-xl border border-line bg-elevated p-1.5 shadow-[0_16px_40px_rgba(2,6,23,0.18)] outline-none ${
            openUpward ? "bottom-full mb-2 origin-bottom" : "top-full mt-2 origin-top"
          }`}
        >
          {options.length === 0 ? (
            <li role="option" aria-selected={false} aria-disabled="true" className="px-3 py-2.5 text-sm text-ink-mute">No options available</li>
          ) : (
            options.map((opt, i) => {
              const isSelected = opt.value === value;
              const isHighlighted = i === highlighted;
              return (
                <li
                  key={opt.value}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled || undefined}
                  onMouseEnter={() => !opt.disabled && setHighlighted(i)}
                  onClick={() => choose(i)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors duration-100 ${
                    opt.disabled
                      ? "cursor-not-allowed opacity-40"
                      : isHighlighted
                        ? "bg-accent-soft text-ink"
                        : "text-ink-soft"
                  } ${isSelected ? "font-semibold text-ink" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {isSelected && <Check size={15} className="shrink-0 text-accent" aria-hidden />}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ScoreRing({ score, size = 132 }: { score: number; size?: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(score);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 1200;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * score));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const off = c * (1 - display / 100);
  const color = score >= 80 ? "var(--good)" : score >= 55 ? "var(--warn)" : "var(--bad)";
  return (<div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`Audit score ${score} out of 100`}>
    <svg width={size} height={size} viewBox="0 0 120 120" className="-rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" style={{ stroke: "var(--line)" }} />
      <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ stroke: color }} />
    </svg>
    <div className="absolute text-center"><div className="text-4xl font-bold tracking-tight" aria-hidden>{display}</div><div className="text-[11px] font-medium text-ink-mute">/ 100 AUDIT SCORE</div></div>
  </div>);
}

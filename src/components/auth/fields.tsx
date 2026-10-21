"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";

/**
 * Auth form primitives: a labelled field with a leading icon, and a
 * password field with show/hide plus an honest strength meter. They sit
 * on the shared `.form-*` classes so the look stays consistent with the
 * rest of the product.
 */

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id"> {
  id?: string;
  label: ReactNode;
  icon?: LucideIcon;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  trailing?: ReactNode;
}

export function TextField({ id, label, icon: Icon, hint, error, optional, trailing, ...input }: FieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={fieldId} className="form-label">
          {label}
          {optional && <span className="ml-1 font-normal text-ink-mute">(optional)</span>}
        </label>
        {trailing}
      </div>
      <div className="relative mt-1.5">
        {Icon && <Icon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute" aria-hidden />}
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          className={`form-control ${Icon ? "form-control-icon" : ""}`}
          {...input}
        />
      </div>
      {hint && <p id={hintId} className="form-hint">{hint}</p>}
      {error && <p id={errorId} className="mt-1.5 text-xs font-medium text-bad">{error}</p>}
    </div>
  );
}

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; tips: string[] };

/** Plain-language strength estimate — length first, variety second, obvious patterns penalised. */
export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: "", tips: [] };
  const tips: string[] = [];
  let points = 0;
  if (pw.length >= 10) points += 1; else tips.push("Use at least 10 characters");
  if (pw.length >= 14) points += 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes >= 3) points += 1; else tips.push("Mix letters, numbers and symbols");
  if (/^(.)\1+$/.test(pw) || /^(0123|1234|abcd|qwer|pass|letme|admin)/i.test(pw) || /^(\d+)$/.test(pw)) {
    points = Math.max(0, points - 2);
    tips.push("Avoid common patterns and sequences");
  }
  if (pw.length >= 18 && classes >= 2) points = Math.min(4, points + 1);
  const score = Math.min(4, points) as Strength["score"];
  const label = ["Too short", "Weak", "Okay", "Strong", "Excellent"][score] ?? "";
  return { score, label, tips: tips.slice(0, 2) };
}

interface PasswordProps extends Omit<FieldProps, "type" | "icon"> {
  icon?: LucideIcon;
  /** Show the live strength meter (sign-up / reset). */
  meter?: boolean;
}

export function PasswordField({ meter, value, hint, ...rest }: PasswordProps) {
  const [visible, setVisible] = useState(false);
  const pw = typeof value === "string" ? value : "";
  const strength = meter ? passwordStrength(pw) : null;
  const colours = ["bg-line", "bg-bad", "bg-warn", "bg-good", "bg-good"];
  return (
    <div>
      <div className="relative">
        <TextField
          {...rest}
          value={value}
          type={visible ? "text" : "password"}
          hint={undefined}
          trailing={
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-ink-mute transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              aria-pressed={visible}
            >
              {visible ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
              {visible ? "Hide" : "Show"}
            </button>
          }
        />
      </div>
      {strength && pw && (
        <div className="mt-2" aria-live="polite">
          <div className="grid grid-cols-4 gap-1" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={`h-1 rounded-full transition-colors ${n <= strength.score ? colours[strength.score] : "bg-line"}`} />
            ))}
          </div>
          <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-ink-mute">
            <span className={strength.score >= 3 ? "font-semibold text-good" : strength.score <= 1 ? "font-semibold text-bad" : "font-semibold text-warn"}>{strength.label}</span>
            {strength.tips[0] && <span>{strength.tips[0]}</span>}
          </p>
        </div>
      )}
      {hint && <p className="form-hint">{hint}</p>}
    </div>
  );
}

"use client";

import { RotateCcw } from "lucide-react";
import { BrandSelect } from "@/components/ui";

export const DEFAULT_BRAND_COLOR = "#2563eb";

const BRAND_COLORS = [
  { name: "Clyvro blue", hex: "#2563EB" },
  { name: "Royal blue", hex: "#1D4ED8" },
  { name: "Indigo blue", hex: "#1E40AF" },
  { name: "Navy blue", hex: "#1E3A8A" },
  { name: "Deep ocean", hex: "#1E3A5F" },
  { name: "Ocean navy", hex: "#1D3557" },
  { name: "Indigo", hex: "#4338CA" },
  { name: "Electric indigo", hex: "#4F46E5" },
  { name: "Amethyst", hex: "#5B21B6" },
  { name: "Violet", hex: "#6D28D9" },
  { name: "Purple", hex: "#7E22CE" },
  { name: "Orchid", hex: "#86198F" },
  { name: "Berry", hex: "#9D174D" },
  { name: "Rose", hex: "#BE123C" },
  { name: "Crimson", hex: "#B91C1C" },
  { name: "Brick red", hex: "#991B1B" },
  { name: "Burnt orange", hex: "#C2410C" },
  { name: "Sienna", hex: "#9A3412" },
  { name: "Cinnamon", hex: "#92400E" },
  { name: "Bronze", hex: "#854D0E" },
  { name: "Umber", hex: "#713F12" },
  { name: "Forest green", hex: "#166534" },
  { name: "Emerald", hex: "#15803D" },
  { name: "Jade", hex: "#047857" },
  { name: "Pine green", hex: "#065F46" },
  { name: "Deep teal", hex: "#115E59" },
  { name: "Teal", hex: "#0F766E" },
  { name: "Dark cyan", hex: "#134E4A" },
  { name: "Blue spruce", hex: "#155E75" },
  { name: "Petrol", hex: "#0E7490" },
  { name: "Midnight", hex: "#0F172A" },
  { name: "Graphite", hex: "#1F2937" },
  { name: "Slate", hex: "#334155" },
  { name: "Steel", hex: "#475569" },
  { name: "Moss", hex: "#3F6212" },
  { name: "Olive", hex: "#365314" },
] as const;

const CUSTOM = "__custom";
const HEX_COLOR = /^#[\da-f]{6}$/i;

export default function BrandColorPicker({
  value,
  onChange,
  onReset,
}: {
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const validValue = HEX_COLOR.test(value);
  const selected = BRAND_COLORS.find((color) => color.hex.toLowerCase() === value.toLowerCase());
  const selectValue = selected ? selected.hex.toLowerCase() : CUSTOM;

  return (
    <fieldset className="min-w-0">
      <legend className="form-label">Report accent colour</legend>
      <p className="form-hint mt-1">Pick a curated shade from the dropdown, or choose a custom colour. Curated shades meet 4.5:1 contrast with white text.</p>

      <div className="mt-3 flex items-center gap-3">
        <span
          className="h-10 w-10 shrink-0 rounded-xl border border-line shadow-inner"
          style={{ backgroundColor: validValue ? value : DEFAULT_BRAND_COLOR }}
          aria-hidden="true"
        />
        <BrandSelect
          id="brand-colour"
          value={selectValue}
          onChange={(v) => { if (v !== CUSTOM) onChange(v); }}
          options={[
            ...BRAND_COLORS.map((c) => ({ value: c.hex.toLowerCase(), label: `${c.name} · ${c.hex}` })),
            { value: CUSTOM, label: "Custom colour…" },
          ]}
          className="w-full max-w-sm"
        />
      </div>

      {selectValue === CUSTOM && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
          <label className="block">
            <span className="form-label">Custom colour</span>
            <input
              type="color"
              value={validValue ? value : DEFAULT_BRAND_COLOR}
              onChange={(e) => onChange(e.target.value.toLowerCase())}
              className="mt-1.5 h-12 w-full cursor-pointer rounded-xl border border-line bg-surface p-1 sm:w-20"
              aria-label="Choose any custom report colour"
            />
          </label>
          <label className="block">
            <span className="form-label">Hex value</span>
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={7}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="form-control mt-1.5 font-mono uppercase"
              aria-label="Custom report colour hex value"
              aria-invalid={value.length > 0 && !validValue}
              placeholder="#2563EB"
            />
          </label>
        </div>
      )}
      {selectValue === CUSTOM && !validValue && value.length > 0 && (
        <p className="form-hint mt-2 text-bad">Enter a valid hex colour like #2563EB.</p>
      )}

      <button type="button" onClick={onReset} className="button-secondary mt-4">
        <RotateCcw size={15} aria-hidden="true" /> Reset to Clyvro blue
      </button>
      <p className="form-hint">Reset changes the selection. Save branding to apply it to reports.</p>
    </fieldset>
  );
}

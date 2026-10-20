"use client";

import { Check, RotateCcw } from "lucide-react";

export const DEFAULT_BRAND_COLOR = "#2563eb";

const BRAND_COLORS = [
  { name: "Clyvro blue", hex: "#2563EB" },
  { name: "Royal blue", hex: "#1D4ED8" },
  { name: "Indigo blue", hex: "#1E40AF" },
  { name: "Navy blue", hex: "#1E3A8A" },
  { name: "Deep ocean", hex: "#1E3A5F" },
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
  { name: "Midnight", hex: "#0F172A" },
  { name: "Graphite", hex: "#1F2937" },
  { name: "Slate", hex: "#334155" },
  { name: "Steel", hex: "#475569" },
  { name: "Moss", hex: "#3F6212" },
  { name: "Olive", hex: "#365314" },
  { name: "Ocean navy", hex: "#1D3557" },
  { name: "Grape", hex: "#6B21A8" },
  { name: "Royal indigo", hex: "#3730A3" },
  { name: "Wine", hex: "#7F1D1D" },
  { name: "Blue spruce", hex: "#155E75" },
  { name: "Petrol", hex: "#0E7490" },
] as const;

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
  const selectedSwatch = BRAND_COLORS.find((color) => color.hex.toLowerCase() === value.toLowerCase());

  return (
    <fieldset className="min-w-0">
      <legend className="form-label">Report accent colour</legend>
      <p className="form-hint mt-1">Choose a curated shade or pick any custom colour. Swatches meet 4.5:1 contrast with white text.</p>

      <div role="group" aria-label="Curated report accent colours" className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-8">
        {BRAND_COLORS.map((color) => {
          const selected = color.hex.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={color.hex}
              type="button"
              title={`${color.name} · ${color.hex}`}
              aria-label={`${color.name}, ${color.hex}`}
              aria-pressed={selected}
              onClick={() => onChange(color.hex.toLowerCase())}
              className={`relative grid h-10 w-10 place-items-center rounded-xl border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${selected ? "border-accent" : "border-transparent hover:border-line"}`}
            >
              <span className="h-7 w-7 rounded-lg shadow-inner" style={{ backgroundColor: color.hex }} aria-hidden="true" />
              {selected && <Check size={14} className="absolute text-white drop-shadow" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-mute" aria-live="polite">
        Selected: <span className="font-semibold text-ink-soft">{selectedSwatch?.name ?? (validValue ? "Custom colour" : "Enter a valid hex colour")}</span>
        {validValue && <> · <span className="font-mono uppercase">{value}</span></>}
      </p>

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

      <button type="button" onClick={onReset} className="button-secondary mt-4">
        <RotateCcw size={15} aria-hidden="true" /> Reset to Clyvro blue
      </button>
      <p className="form-hint">Reset changes the selection. Save branding to apply it to reports.</p>
    </fieldset>
  );
}

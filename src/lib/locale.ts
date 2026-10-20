const MAX_LOCALE_LENGTH = 64;

/** Normalize one untrusted BCP-47 language tag for HTTP and persistence. */
export function normalizeLocale(input: unknown): string {
  if (typeof input !== "string") return "en";
  const value = input.trim();
  if (!value || value.length > MAX_LOCALE_LENGTH || /[\s,\u0000-\u001f\u007f]/.test(value)) return "en";
  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    return canonical ?? "en";
  } catch {
    return "en";
  }
}

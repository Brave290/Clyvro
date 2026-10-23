/**
 * Workspace sidebar rules. Pro/Agency tools are listed for everyone so
 * the product is visible, but they are not clickable on Free/Starter —
 * opening a lock screen is worse than a greyed-out row.
 */
export const PRO_NAV_HREFS = ["/app/full-scan", "/app/pentest", "/app/lab", "/app/api-keys"] as const;
export const BETA_NAV_HREFS = ["/app/scan", "/app/pentest", "/app/lab"] as const;

export function planIsPro(planId: string): boolean {
  return planId === "pro" || planId === "ultra-agency";
}

export function navItemLocked(href: string, planId: string): boolean {
  return (PRO_NAV_HREFS as readonly string[]).includes(href) && !planIsPro(planId);
}

export function navItemBeta(href: string): boolean {
  return (BETA_NAV_HREFS as readonly string[]).includes(href);
}

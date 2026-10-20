import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import {effectivePlanForOrg, } from "@/lib/plans";
import { ScanError } from "@/lib/scanner/types";

/** Organization settings & report branding (Phase 4). */

export async function getOrganization(organizationId: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw new ScanError("NOT_FOUND", "Workspace not found.");
  return org;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Contrast ratio against white; report headers use white text on this colour. */
function contrastOnWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return 1.05 / (lum + 0.05);
}

export async function updateBranding(
  organizationId: string,
  input: { brandName?: string; brandColor?: string; reportFooter?: string },
  dbOverride?: DB,
) {
  const db = dbOverride ?? (await getDb());
  await getOrganization(organizationId, db);

  const brandColor = input.brandColor?.trim() || null;
  if (brandColor) {
    if (!HEX_RE.test(brandColor)) throw new ScanError("VALIDATION", "Use a hex colour like #2563EB.");
    if (contrastOnWhite(brandColor) < 4.5) {
      throw new ScanError("VALIDATION", "Choose a shade with at least 4.5:1 contrast against white text.");
    }
  }
  const values = {
    brandName: input.brandName?.trim().slice(0, 80) || null,
    brandColor,
    reportFooter: input.reportFooter?.trim().slice(0, 200) || null,
  };
  await db.update(organizations).set(values).where(eq(organizations.id, organizationId));
  return getOrganization(organizationId, db);
}

export interface AppliedBranding {
  /** Name shown on the client-facing report. */
  name: string;
  /** Accent applied to the shared report (null = default Clyvro blue). */
  color: string | null;
  footer: string | null;
  /** True when the "via Clyvro" attribution must be shown (non white-label plans). */
  viaClyvro: boolean;
}

/**
 * Branding as actually rendered on public reports. Custom branding is a
 * white-label entitlement (Ultra Agency); other plans show
 * "Prepared by <workspace> via Clyvro" in the default style.
 */
export async function getAppliedBranding(organizationId: string, dbOverride?: DB): Promise<AppliedBranding> {
  const org = await getOrganization(organizationId, dbOverride);
  const plan = effectivePlanForOrg(org);
  if (plan.whiteLabel) {
    return {
      name: org.brandName?.trim() || org.name,
      color: org.brandColor,
      footer: org.reportFooter,
      viaClyvro: false,
    };
  }
  return { name: org.name, color: null, footer: null, viaClyvro: true };
}

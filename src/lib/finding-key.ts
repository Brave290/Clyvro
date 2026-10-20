import type { Finding } from "@/lib/types";

/**
 * Stable identity for a finding issue across audits.
 * MUST match the server-side `findingKey` in services/audits.ts.
 */
export function findingKey(f: Pick<Finding, "ruleId" | "page" | "title">): string {
  return `${f.ruleId}|${f.page}|${f.title}`;
}

import { timingSafeEqual } from "node:crypto";
import { INTERNAL_HEADER } from "@/lib/shield/rules";
import { shieldToken } from "@/lib/services/shield";

/** True when the request carries the edge↔Node Shield token (derived from AUTH_SECRET). */
export async function hasInternalToken(req: Request): Promise<boolean> {
  const sent = req.headers.get(INTERNAL_HEADER);
  if (!sent) return false;
  const expected = await shieldToken();
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

import { NextRequest, NextResponse } from "next/server";
import { registerAccount } from "@/lib/services/accounts";
import { apiError, readJsonBody } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const result = await registerAccount({
      name: typeof body.name === "string" ? body.name : undefined,
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      organizationName: typeof body.organizationName === "string" ? body.organizationName : undefined,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

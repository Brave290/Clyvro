/**
 * Server boot. The Node-only implementation lives in
 * instrumentation.node.ts and is imported behind the runtime check so
 * database drivers never enter the Edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    await import("./instrumentation.node");
  }
}

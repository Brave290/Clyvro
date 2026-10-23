import { existsSync } from "node:fs";

/** Viewport JPEG for the live browser pane. Quality is stepped down until it fits. */
export const LIVE_PREVIEW_MAX_BYTES = 160_000;
export const PAGE_THUMB_MAX_BYTES = 90_000;

type ScreenshotPage = {
  screenshot: (opts: { type: "jpeg"; quality: number; fullPage: boolean }) => Promise<Buffer>;
};

export async function captureJpeg(
  page: ScreenshotPage,
  maxBytes = LIVE_PREVIEW_MAX_BYTES,
): Promise<string | undefined> {
  try {
    let quality = 42;
    let buf = await page.screenshot({ type: "jpeg", quality, fullPage: false });
    while (buf.length > maxBytes && quality > 16) {
      quality -= 8;
      buf = await page.screenshot({ type: "jpeg", quality, fullPage: false });
    }
    if (buf.length > maxBytes) return undefined;
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

const LOCAL_CHROMIUM_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];

/** Candidate system Chromium binaries — tried when the bundled one is missing. */
const SYSTEM_CHROMIUM_PATHS = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chrome",
];

function systemChromiumPath(): string | null {
  for (const p of SYSTEM_CHROMIUM_PATHS) {
    try { if (existsSync(p)) return p; } catch { /* ignore */ }
  }
  return null;
}

/**
 * Start Chromium. Prefer a hosted browser (PLAYWRIGHT_WS_ENDPOINT), then
 * the bundled serverless Chromium, then a local Playwright install, then
 * any system Chromium on PATH. Never fake a session.
 *
 * The bundled @sparticuz/chromium executablePath can point at a file that
 * does not exist on this host (it is built for a specific runtime). Trusting
 * it blindly made every Flow Scan fail with ENOENT, so verify the path first
 * and fall back instead of throwing.
 */
export async function launchBrowser() {
  const { chromium } = await import("playwright-core");
  const wsEndpoint = process.env.PLAYWRIGHT_WS_ENDPOINT?.trim();
  if (wsEndpoint) return chromium.connect(wsEndpoint);

  // 1. Bundled serverless Chromium — only if the executable it points at exists.
  try {
    const sparticuz = (await import("@sparticuz/chromium")).default;
    const executablePath = await sparticuz.executablePath();
    if (executablePath && existsSync(executablePath)) {
      return chromium.launch({ executablePath, args: sparticuz.args, headless: true });
    }
  } catch {
    // fall through
  }

  // 2. Local Playwright install (default browser search).
  try {
    return chromium.launch({ headless: true, args: LOCAL_CHROMIUM_ARGS });
  } catch {
    // fall through
  }

  // 3. Any system Chromium.
  const systemPath = systemChromiumPath();
  if (systemPath) {
    return chromium.launch({ executablePath: systemPath, headless: true, args: LOCAL_CHROMIUM_ARGS });
  }

  throw new Error(
    "Chromium could not start. Set PLAYWRIGHT_WS_ENDPOINT to a hosted browser, " +
      "or install it: npx playwright install chromium",
  );
}

export function browserSourceLabel(): string {
  if (process.env.PLAYWRIGHT_WS_ENDPOINT?.trim()) {
    return "Browser started on the external browser service — you are watching a real viewport, not a simulation.";
  }
  return "Browser started (Chromium) — JavaScript on, forms locked out. The picture above is the live page.";
}

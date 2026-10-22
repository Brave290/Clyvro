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

/**
 * Start Chromium. Prefer a hosted browser (PLAYWRIGHT_WS_ENDPOINT), then
 * serverless Chromium, then a local Playwright install. Never fake a session.
 */
export async function launchBrowser() {
  const { chromium } = await import("playwright-core");
  const wsEndpoint = process.env.PLAYWRIGHT_WS_ENDPOINT?.trim();
  if (wsEndpoint) return chromium.connect(wsEndpoint);
  try {
    const sparticuz = (await import("@sparticuz/chromium")).default;
    const executablePath = await sparticuz.executablePath();
    return chromium.launch({ executablePath, args: sparticuz.args, headless: true });
  } catch (bundled) {
    try {
      return chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      });
    } catch {
      throw bundled;
    }
  }
}

export function browserSourceLabel(): string {
  if (process.env.PLAYWRIGHT_WS_ENDPOINT?.trim()) {
    return "Browser started on the external browser service — you are watching a real viewport, not a simulation.";
  }
  return "Browser started (Chromium) — JavaScript on, forms locked out. The picture above is the live page.";
}

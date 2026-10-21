import { and, desc, eq } from "drizzle-orm";
import { getDb, newId, type DB } from "@/lib/db";
import { flowScans, organizations } from "@/lib/db/schema";
import { effectivePlanForOrg } from "@/lib/plans";
import { assertPublicUrl, isBlockedIp } from "@/lib/scanner/ssrf";
import { normalizeScanInput } from "@/lib/scanner/scan";
import { parsePage } from "@/lib/scanner/parse";
import { detectTechnology } from "@/lib/tech-detection";
import { ScanError } from "@/lib/scanner/types";
import {
  FLOW_LIMITATIONS,
  type FlowPageResult,
  type FlowReport,
  type FlowStep,
} from "@/lib/flow-scan-shared";

export type { FlowPageResult, FlowReport, FlowStep } from "@/lib/flow-scan-shared";
export { flowScanToAgentPrompt, flowScanToMarkdown } from "@/lib/flow-scan-shared";

/**
 * Rendered flow scanning (Playwright) — Pro / Ultra Agency.
 *
 * A real headless Chromium renders the target with JavaScript on,
 * walks a bounded sample of same-origin pages, and records a live
 * step log (persisted DURING the run, so the UI streams it): pages
 * rendered, links followed, menu probes, plus notes for everything
 * that goes wrong — console errors, page errors, failed requests,
 * blocked navigations. Safety contract mirrors the crawler:
 * public targets only (pre-validated with the scanner's SSRF checks
 * and re-checked on every navigation), forms are NEVER submitted,
 * and purchase/delete/sign-out actions are never clicked.
 *
 * Browser source: PLAYWRIGHT_WS_ENDPOINT (hosted browser) when set,
 * otherwise the bundled serverless Chromium (@sparticuz/chromium).
 * If no browser can start, the run fails honestly — never simulated.
 */

const MAX_PAGES = 5;
const MAX_STEPS = 80;
const RUN_BUDGET_MS = 75_000;
const NAV_TIMEOUT_MS = 15_000;

/** Why a navigation must not happen, or null when it may proceed. */
export function navigationBlockReason(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "Unparseable URL";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return `Blocked scheme ${url.protocol}`;
  const host = url.hostname.toLowerCase();
  if (!host) return "Missing host";
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) {
    return `Blocked local host ${host}`;
  }
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
  if (isIp && isBlockedIp(host)) return `Blocked non-public IP ${host}`;
  return null;
}

const DANGEROUS_RE = /(check\s?out|buy now|purchase|pay now|place order|delete|remove|sign ?out|log ?out|unsubscribe|confirm order|submit order)/i;

/** Actions/links the browser must never trigger. */
export function isDangerousAction(text: string, href: string): boolean {
  return DANGEROUS_RE.test(text) || DANGEROUS_RE.test(href);
}

/** Choose the bounded same-origin pages to visit after the start page. */
export function pickFlowLinks(
  links: { href: string; text: string }[],
  startUrl: string,
  cap: number,
): string[] {
  const origin = new URL(startUrl).origin;
  const seen = new Set<string>([startUrl]);
  const picked: string[] = [];
  for (const link of links) {
    if (picked.length >= cap) break;
    let abs: URL;
    try {
      abs = new URL(link.href, startUrl);
    } catch {
      continue;
    }
    if (abs.origin !== origin) continue;
    if (abs.hash && abs.pathname === new URL(startUrl).pathname) continue;
    abs.hash = "";
    const key = abs.href;
    if (seen.has(key)) continue;
    if (isDangerousAction(link.text, abs.href)) continue;
    if (/\.(pdf|zip|png|jpe?g|gif|svg|mp4|mp3|css|js|ico)$/i.test(abs.pathname)) continue;
    seen.add(key);
    picked.push(key);
  }
  return picked;
}

export interface FlowAccess {
  allowed: boolean;
  planName: string;
}

export async function flowScanAccess(organizationId: string, dbOverride?: DB): Promise<FlowAccess> {
  const db = dbOverride ?? (await getDb());
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) throw new ScanError("NOT_FOUND", "Workspace not found.");
  const plan = effectivePlanForOrg(org);
  return { allowed: plan.flowScan, planName: plan.name };
}

/** Create a queued run (no browser yet — the run call executes it; the UI polls the row live). */
export async function createFlowScan(
  organizationId: string, userId: string, rawUrl: string, dbOverride?: DB,
): Promise<{ id: string }> {
  const db = dbOverride ?? (await getDb());
  const access = await flowScanAccess(organizationId, db);
  if (!access.allowed) {
    throw new ScanError(
      "PLAN_LIMIT",
      `Rendered flow scanning is a Pro and Ultra Agency feature — your workspace is on the ${access.planName} plan. Upgrading unlocks it alongside the AI-Pattern detector and private deep scans.`,
    );
  }
  const normalized = normalizeScanInput(rawUrl.trim());
  const target = await assertPublicUrl(normalized);
  const id = newId();
  await db.insert(flowScans).values({
    id, organizationId, requestedBy: userId,
    targetUrl: target.url.href, status: "queued", steps: [],
  });
  return { id };
}

export async function getFlowScan(organizationId: string, id: string, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  const [row] = await db.select().from(flowScans)
    .where(and(eq(flowScans.id, id), eq(flowScans.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new ScanError("NOT_FOUND", "Flow scan not found.");
  return row;
}

export async function listFlowScans(organizationId: string, limit = 10, dbOverride?: DB) {
  const db = dbOverride ?? (await getDb());
  return db.select({
    id: flowScans.id, targetUrl: flowScans.targetUrl, status: flowScans.status,
    createdAt: flowScans.createdAt, finishedAt: flowScans.finishedAt,
  })
    .from(flowScans)
    .where(eq(flowScans.organizationId, organizationId))
    .orderBy(desc(flowScans.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
}

type PushStep = (label: string, level?: FlowStep["level"], detail?: string) => Promise<void>;

async function launchBrowser() {
  const { chromium } = await import("playwright-core");
  const wsEndpoint = process.env.PLAYWRIGHT_WS_ENDPOINT?.trim();
  if (wsEndpoint) return chromium.connect(wsEndpoint);
  const sparticuz = (await import("@sparticuz/chromium")).default;
  const executablePath = await sparticuz.executablePath();
  return chromium.launch({ executablePath, args: sparticuz.args, headless: true });
}

/** Executes a queued run. Updates the row (and its live step log) as it goes. */
export async function runFlowScan(organizationId: string, id: string, dbOverride?: DB): Promise<void> {
  const db = dbOverride ?? (await getDb());
  const row = await getFlowScan(organizationId, id, db);
  if (row.status !== "queued") return;

  const steps: FlowStep[] = [];
  const startedAt = new Date();
  const push: PushStep = async (label, level = "step", detail) => {
    if (steps.length >= MAX_STEPS) return;
    steps.push({ at: new Date().toISOString(), label, level, detail });
    await db.update(flowScans).set({ steps: [...steps] }).where(eq(flowScans.id, id));
  };
  await db.update(flowScans).set({ status: "running", steps: [] }).where(eq(flowScans.id, id));

  const consoleErrors: FlowReport["consoleErrors"] = [];
  const failedRequests: FlowReport["failedRequests"] = [];
  const pages: FlowPageResult[] = [];
  const notes: string[] = [];
  const note = async (text: string) => { notes.push(text); await push(text, "note"); };

  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    await push(`Starting a real browser session for ${row.targetUrl}…`);
    try {
      browser = await launchBrowser();
    } catch {
      throw new ScanError(
        "BROWSER_UNAVAILABLE",
        "The flow-scan browser couldn't start in this environment, so no scan was run. (Nothing was simulated — the run is marked failed.)",
      );
    }
    await push("Browser started — JavaScript rendering on, forms locked out (never submitted).");

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36 ClyvroFlowScan/1.0",
      viewport: { width: 1280, height: 800 },
    });
    // Re-check every navigation request: public, web-scheme destinations only.
    let blockedCount = 0;
    await context.route("**/*", async (route) => {
      const reqUrl = route.request().url();
      if (reqUrl.startsWith("data:") || reqUrl.startsWith("blob:") || reqUrl === "about:blank") return route.continue();
      const reason = navigationBlockReason(reqUrl);
      if (reason) {
        blockedCount++;
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    page.setDefaultTimeout(NAV_TIMEOUT_MS);
    let currentPageLabel = row.targetUrl;
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text().slice(0, 300);
        consoleErrors.push({ page: currentPageLabel, text });
        void push(`Console error on ${currentPageLabel}`, "error", text);
      }
    });
    page.on("pageerror", (err) => {
      const text = String(err).slice(0, 300);
      consoleErrors.push({ page: currentPageLabel, text: `Uncaught: ${text}` });
      void push(`Uncaught page error on ${currentPageLabel}`, "error", text);
    });
    page.on("requestfailed", (req) => {
      const failure = req.failure()?.errorText ?? "request failed";
      if (/blockedbyclient/i.test(failure)) return;
      failedRequests.push({ page: currentPageLabel, url: req.url().slice(0, 200), failure: failure.slice(0, 120) });
      void push(`Request failed: ${req.url().slice(0, 120)}`, "error", failure.slice(0, 120));
    });
    page.on("response", (res) => {
      if (res.status() >= 400 && res.request().isNavigationRequest()) {
        void push(`Navigation answered HTTP ${res.status()}`, "note", res.url().slice(0, 160));
      }
    });

    const deadline = Date.now() + RUN_BUDGET_MS;
    const visit = async (url: string, label: string): Promise<string | null> => {
      currentPageLabel = url;
      await push(`${label}: ${url}`);
      const blocked = navigationBlockReason(url);
      if (blocked) {
        await note(`Skipped ${url} — ${blocked}.`);
        return null;
      }
      try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200); // let client JS settle; facts follow from the rendered DOM
        const finalUrl = page.url();
        const html = await page.content();
        const parsed = parsePage({
          requestedUrl: url, finalUrl, status: response?.status() ?? 200,
          contentType: "text/html", isHtml: true, bodyText: html,
          bytes: html.length, truncated: false, durationMs: 0, redirectChain: [],
        });
        pages.push({
          url, finalUrl, status: response?.status() ?? null,
          title: parsed.title, renderedWords: parsed.wordCount ?? 0,
          forms: parsed.forms.length, buttons: parsed.actionTexts.length,
          internalLinks: parsed.links.filter((l) => {
            try { return new URL(l.href, finalUrl).origin === new URL(finalUrl).origin; } catch { return false; }
          }).length,
        });
        await push(
          `Rendered “${parsed.title ?? "no title"}”`,
          "step",
          `${parsed.wordCount ?? 0} words after JavaScript · ${parsed.forms.length} form(s) · ${parsed.links.length} link(s) discovered`,
        );
        return html;
      } catch (err) {
        await note(`Couldn't render ${url} — ${err instanceof Error ? err.message.split("\n")[0].slice(0, 160) : "navigation failed"}.`);
        return null;
      }
    };

    const startHtml = await visit(row.targetUrl, "Opening the start page");
    let visited = 1;

    if (startHtml && Date.now() < deadline) {
      // Menu probe: open at most two menu/nav toggles (never submit-type, never dangerous).
      try {
        const menuButtons = page.getByRole("button", { name: /menu|navigation|nav/i });
        const count = Math.min(await menuButtons.count(), 2);
        for (let i = 0; i < count; i++) {
          const btn = menuButtons.nth(i);
          const name = (await btn.getAttribute("aria-label").catch(() => null)) ?? "menu";
          const expandedBefore = await btn.getAttribute("aria-expanded").catch(() => null);
          await btn.click({ timeout: 2_500 }).catch(() => null);
          await page.waitForTimeout(500);
          const expandedAfter = await btn.getAttribute("aria-expanded").catch(() => null);
          await push(
            `Menu probe: clicked “${String(name).slice(0, 40)}”`,
            "step",
            expandedBefore !== expandedAfter
              ? `aria-expanded changed ${expandedBefore ?? "?"} → ${expandedAfter ?? "?"} (menu responds)`
              : "No visible state change recorded (may still open visually — check manually)",
          );
        }
        if (count === 0) await push("Menu probe: no button labelled as a menu/navigation toggle was found.", "note");
      } catch {
        await push("Menu probe couldn't run on this page.", "note");
      }

      // Follow a bounded sample of same-origin links, like a visitor would.
      const parsed = parsePage({
        requestedUrl: row.targetUrl, finalUrl: page.url(), status: 200,
        contentType: "text/html", isHtml: true, bodyText: startHtml,
        bytes: startHtml.length, truncated: false, durationMs: 0, redirectChain: [],
      });
      const nextLinks = pickFlowLinks(parsed.links, row.targetUrl, MAX_PAGES - 1);
      if (!nextLinks.length) await note("No further same-origin pages were offered by the start page's links.");
      for (const link of nextLinks) {
        if (Date.now() > deadline) {
          await note("Time budget reached — remaining links were not visited.");
          break;
        }
        visited++;
        await visit(link, `Following link ${visited - 1} of ${nextLinks.length}`);
      }
    }

    const allHtml = pages.length ? startHtml ?? "" : "";
    const tech = allHtml
      ? detectTechnology({ html: allHtml, url: row.targetUrl }).map((t) => t.name)
      : [];
    if (blockedCount > 0) notes.push(`${blockedCount} request(s) to non-public or non-web destinations were blocked by the navigation guard.`);
    if (!consoleErrors.length && pages.length) notes.push("No browser console errors were observed on the pages visited.");
    if (!failedRequests.length && pages.length) notes.push("No failed network requests were observed on the pages visited.");

    const report: FlowReport = {
      targetUrl: row.targetUrl,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      pages,
      consoleErrors: consoleErrors.slice(0, 30),
      failedRequests: failedRequests.slice(0, 30),
      notes,
      tech,
      limitations: FLOW_LIMITATIONS,
    };
    await push(`Flow scan complete — ${pages.length} page(s) rendered, ${consoleErrors.length} console error(s), ${failedRequests.length} failed request(s).`);
    await db.update(flowScans)
      .set({ status: "completed", report, steps: [...steps], finishedAt: new Date() })
      .where(eq(flowScans.id, id));
  } catch (err) {
    const message = err instanceof ScanError ? err.message : "The flow scan stopped unexpectedly. The step log above shows how far it got.";
    steps.push({ at: new Date().toISOString(), label: message, level: "error" });
    await db.update(flowScans)
      .set({ status: "failed", errorMessage: message, steps: [...steps], finishedAt: new Date() })
      .where(eq(flowScans.id, id));
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

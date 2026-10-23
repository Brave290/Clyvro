import { assertPublicUrl, type Resolver } from "@/lib/scanner/ssrf";
import { fetchPublic, type Transport } from "@/lib/scanner/fetcher";
import { normalizeScanInput } from "@/lib/scanner/scan";
import { ScanError } from "@/lib/scanner/types";

/**
 * SEO Visibility (New): checks whether search engines *can* see and
 * show a site, using only what crawlers themselves can fetch — index
 * directives, robots.txt, sitemap, titles/descriptions, canonical,
 * social cards and structured data. It deliberately does NOT claim to
 * know a site's actual position in Google results: that lives inside
 * Google Search Console / Bing Webmaster Tools, and the report says so
 * and gives the exact steps to verify and improve real visibility.
 */

export type SeoStatus = "pass" | "warn" | "fail" | "info";
export interface SeoCheck {
  id: string;
  group: string;
  label: string;
  status: SeoStatus;
  detail: string;
  fix?: string[];
}
export interface SeoReport {
  domain: string;
  finalUrl: string | null;
  checks: SeoCheck[];
  summary: { pass: number; warn: number; fail: number; total: number };
  /** What a search-results snippet would look like from the real meta tags. */
  preview: { title: string | null; url: string; description: string | null; logo: string | null; siteName: string | null };
  /** Google Search Console-style reasons a page may not be indexed. */
  indexing: { state: string; why: string }[];
  /** Ordered, plain-language steps to get (more) visible. Always honest about Search Console. */
  visibilitySteps: string[];
}

function meta(html: string, attr: string, value: string): string | null {
  const re = new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  return tag.match(/content=["']([^"']*)["']/i)?.[1]?.trim() || null;
}
function linkRel(html: string, rel: string): string | null {
  const tag = html.match(new RegExp(`<link[^>]+rel=["']${rel}["'][^>]*>`, "i"))?.[0]
    ?? html.match(new RegExp(`<link[^>]+rel=["'][^"']*\\b${rel}\\b[^"']*["'][^>]*>`, "i"))?.[0];
  return tag?.match(/href=["']([^"']*)["']/i)?.[1]?.trim() || null;
}

function absUrl(href: string | null, base: string): string | null {
  if (!href) return null;
  try { return new URL(href, base).href; } catch { return href; }
}

export async function runSeoVisibilityEngine(
  input: string,
  deps: { transport?: Transport; resolver?: Resolver } = {},
): Promise<SeoReport> {
  const normalized = normalizeScanInput(input.trim());
  const target = await assertPublicUrl(normalized, deps.resolver);
  const host = target.url.hostname;
  const apex = host.replace(/^www\./, "");
  const canonicalDomain = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://clyvro.vercel.app").replace(/\/+$/, "");
  const opts = { timeoutMs: 7000, transport: deps.transport, resolver: deps.resolver, userAgent: `Clyvro-Dev-SEO/1.0 (+${canonicalDomain})` };

  const [main, robotsRes, sitemapRes] = await Promise.all([
    fetchPublic(new URL(`https://${host}`), { ...opts, maxBytes: 600_000 }).catch(() => null),
    fetchPublic(new URL(`https://${host}/robots.txt`), { ...opts, maxBytes: 60_000, allowNonHtmlBody: true }).catch(() => null),
    fetchPublic(new URL(`https://${host}/sitemap.xml`), { ...opts, maxBytes: 200_000, allowNonHtmlBody: true }).catch(() => null),
  ]);

  if (!main || main.status < 200 || main.status >= 400) {
    throw new ScanError("FETCH_FAILED",
      main
        ? `The homepage answered HTTP ${main.status}, so search engines see an error page too. Fix that first, then re-run this check.`
        : "We couldn't reach that website over HTTPS, so search engines likely can't either. Check the address and try again.");
  }

  const checks: SeoCheck[] = [];
  const add = (id: string, group: string, label: string, status: SeoStatus, detail: string, fix?: string[]) =>
    checks.push({ id, group, label, status, detail, fix });
  const headers = main.headers ?? {};
  const html = main.bodyText ?? "";
  const robotsTxt = robotsRes?.bodyText ?? "";
  const sitemapBody = sitemapRes?.bodyText ?? "";

  // --- Can crawlers get in? ---
  const metaRobots = (meta(html, "name", "robots") ?? "").toLowerCase();
  const headerRobots = (headers["x-robots-tag"] ?? "").toLowerCase();
  const blockedByMeta = metaRobots.includes("noindex") || headerRobots.includes("noindex");
  add("indexable", "Getting indexed", "Homepage is allowed to be indexed",
    blockedByMeta ? "fail" : "pass",
    blockedByMeta
      ? `A noindex directive was found (${metaRobots ? `meta robots="${metaRobots}"` : `X-Robots-Tag: ${headerRobots}`}) — Google will keep this page out of results even if everything else is perfect.`
      : "No noindex directive on the homepage or in its response headers.",
    ["Remove `noindex` from the page's meta robots tag / X-Robots-Tag header (often left over from a staging setting).", "Re-run this check, then request indexing in Google Search Console (step list below)."]);
  const robotsBlocksAll = /user-agent:\s*\*\s*\n\s*disallow:\s*\/\s*($|\n)/i.test(robotsTxt);
  const robotsBlocksHome = robotsBlocksAll || /disallow:\s*\/\s*($|\n)/i.test(robotsTxt);
  add("robots-txt", "Getting indexed", "robots.txt lets crawlers in",
    !robotsRes || robotsRes.status >= 400 ? "info" : robotsBlocksHome ? "fail" : "pass",
    !robotsRes || robotsRes.status >= 400
      ? "No robots.txt was served. That's allowed — crawlers will simply crawl everything public — but adding one lets you point them at your sitemap."
      : robotsBlocksHome
        ? "robots.txt appears to disallow the homepage (or everything) for all crawlers — the site can't be discovered until this changes."
        : "robots.txt is served and doesn't block the homepage.",
    ["Edit robots.txt so it doesn't `Disallow: /` for `User-agent: *`.", "Add a line `Sitemap: https://${host}/sitemap.xml` at the bottom."]);
  const sitemapOk = Boolean(sitemapRes && sitemapRes.status >= 200 && sitemapRes.status < 300 && /<(urlset|sitemapindex)/i.test(sitemapBody));
  const sitemapUrls = (sitemapBody.match(/<loc>/gi) ?? []).length;
  add("sitemap", "Getting indexed", "XML sitemap present and readable",
    sitemapOk ? "pass" : "warn",
    sitemapOk
      ? `/sitemap.xml lists ${sitemapUrls} URL(s) — crawlers can discover pages without guessing.`
      : "/sitemap.xml is missing, erroring, or isn't valid sitemap XML, so crawlers must discover pages link by link.",
    ["Generate a sitemap.xml listing every public page (most frameworks/CMSs do this automatically).", "Reference it from robots.txt and submit it in Google Search Console and Bing Webmaster Tools.", "Keep it fresh — stale sitemaps with dead URLs waste crawl budget."]);
  if (/sitemap:/i.test(robotsTxt)) {
    add("robots-sitemap-ref", "Getting indexed", "robots.txt points to the sitemap", "pass",
      "A `Sitemap:` line is present in robots.txt.");
  }
  add("https-canonical-host", "Getting indexed", "One canonical HTTPS host",
    main.finalUrl.startsWith("https://") ? "pass" : "warn",
    `The homepage settles on ${main.finalUrl}. Search engines index one version — redirects should land every variant (http, www) here.`,
    ["Redirect http:// and the www/non-www variant to this single HTTPS host with 301s."]);

  // --- How it will be shown ---
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null;
  add("title", "Search appearance", "Page title",
    !title ? "fail" : title.length > 65 ? "warn" : "pass",
    !title
      ? "No <title> — Google will invent one from page text, usually badly."
      : `"${title.slice(0, 90)}" (${title.length} characters${title.length > 65 ? " — likely truncated in results" : ""}).`,
    ["Write a unique title per page: what it is + who it's for, under ~60 characters.", "Put the most important words first."]);
  const description = meta(html, "name", "description");
  add("meta-description", "Search appearance", "Meta description",
    !description ? "warn" : description.length < 70 || description.length > 170 ? "warn" : "pass",
    !description
      ? "Missing — Google will quote a random paragraph as your snippet."
      : `${description.length} characters: "${description.slice(0, 110)}${description.length > 110 ? "…" : ""}"`,
    ["Write 120–160 characters that read like an honest advert for this exact page.", "Never duplicate the same description across pages."]);
  const canonical = linkRel(html, "canonical");
  add("canonical", "Search appearance", "Canonical URL declared",
    canonical ? "pass" : "warn",
    canonical ? `Canonical: ${canonical}` : "No rel=canonical — duplicate URLs (tracking parameters, www variants) can split your ranking.",
    ["Add `<link rel=\"canonical\">` pointing at the one true URL of each page."]);
  const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
  add("h1", "Search appearance", "Exactly one clear H1 heading",
    h1Count === 1 ? "pass" : "warn",
    h1Count === 0 ? "No <h1> found — the page's main topic is unclear to crawlers." : h1Count === 1 ? "One <h1> — the page topic is unambiguous." : `${h1Count} <h1> elements — pick the one true headline and demote the rest.`,
    ["Use one <h1> that states what the page offers, in the words customers search for."]);
  const ogTitle = meta(html, "property", "og:title");
  const ogImage = meta(html, "property", "og:image");
  const siteName = meta(html, "property", "og:site_name") || title?.split(/[|–—-]/)[0]?.trim() || apex;
  const logoHref = linkRel(html, "apple-touch-icon") || linkRel(html, "icon") || linkRel(html, "shortcut icon") || ogImage;
  const logo = absUrl(logoHref, main.finalUrl);
  add("logo", "Search appearance", "Site logo / favicon crawlers can fetch",
    logo ? "pass" : "warn",
    logo
      ? `Logo/favicon at ${logo} — this is what Google shows next to your result.`
      : "No favicon, apple-touch-icon or og:image — Google will invent a letter-tile instead of your mark.",
    ["Add a 48×48+ favicon.ico and a 180×180 apple-touch-icon, plus an og:image (1200×630) so search and shares show your real logo."]);
  add("social-cards", "Search appearance", "Social / sharing cards (Open Graph)",
    ogTitle && ogImage ? "pass" : "warn",
    ogTitle && ogImage
      ? "og:title and og:image are set — links shared on WhatsApp, X, LinkedIn and Slack will show a proper card."
      : `Missing ${[!ogTitle && "og:title", !ogImage && "og:image"].filter(Boolean).join(" and ")} — shared links will look plain or broken. This doesn't affect Google directly, but it affects the clicks that build visibility.`,
    ["Add og:title, og:description and an og:image (1200×630) to every important page."]);
  const hasJsonLd = /application\/ld\+json/i.test(html);
  add("structured-data", "Search appearance", "Structured data (JSON-LD)",
    hasJsonLd ? "pass" : "info",
    hasJsonLd
      ? "JSON-LD structured data is present — eligible for rich results (stars, FAQs, prices) where Google supports them."
      : "No JSON-LD found. Not required to rank, but Organization/Product/FAQ markup unlocks richer result displays.",
    ["Add JSON-LD describing the business (Organization) and key offers (Product/Service) — validate it in Google's Rich Results Test."]);


  // ── AI search visibility (Google AI Overviews, Bing Chat, Perplexity, ChatGPT search) ──
  // These checks assess how LIKELY an LLM-backed search experience is to surface the page.
  // Clyvro never promises inclusion — only explains what makes content discoverable and useful.
  const headings = (html.match(/<h[1-6][^>]*>([^<]*)<\/h[1-6]>/gi) ?? []).length;
  add("ai-content-substance", "AI search visibility", "Page has substantive, useful content",
    html.length < 2000 ? "warn" : headings >= 2 ? "pass" : "warn",
    html.length < 2000
      ? "Page body is very short (" + html.length + " chars) — AI search models favour pages that answer the query fully, not thin stubs."
      : headings >= 2 ? "Page has " + headings + " heading(s) and " + html.length + " characters — reasonable structure for AI retrieval." : "Page has few headings — breaking content into clear sections helps both readers and AI summarizers.",
    ["Write content that fully answers the page\u2019s core question — not just a headline and CTA.", "Use \u201cmiddle head\u201d headings (H2/H3) that restate specific queries a user might ask an AI assistant."]);

  const orgMarkup = /"@type"\s*:\s*"Organization"/i.test(html) || /"@type"\s*:\s*"LocalBusiness"/i.test(html);
  add("ai-entity-consistency", "AI search visibility", "Entity / Organization markup is consistent",
    orgMarkup ? "pass" : "info",
    orgMarkup
      ? "Organization or LocalBusiness structured data found — helps search engines disambiguate your entity across the web."
      : "No Organization entity markup found — your business name, address and social profiles are not formally linked as an entity.",
    ["Add Organization JSON-LD with your legal name, logo, sameAs links (LinkedIn, etc.) and contact.", "Keep NAP (name/address/phone) identical across your site, GMB, and directories — AI models penalize contradictions."]);

  const internalLinks = (html.match(/<a\s+[^>]*href=["\'][^"\']*["\'][^>]*>/gi) ?? []).length;
  add("ai-internal-links", "AI search visibility", "Discoverable internal links",
    internalLinks >= 5 ? "pass" : internalLinks >= 2 ? "warn" : "fail",
    internalLinks + " internal link(s) found on this page — AI crawlers follow the same links as humans to build knowledge of your site.",
    ["Add internal links between related pages using descriptive anchor text (not \u201cclick here\u201d).", "Ensure important pages are within 3 clicks from the homepage — orphan pages are invisible to both humans and AI."]);

  const hasImages = /<img[^>]*>/i.test(html);
  const altAttrs = (html.match(/<img[^>]*alt=["\'][^"\']+["\'][^>]*>/gi) ?? []).length;
  const totalImgs = (html.match(/<img[^>]*>/gi) ?? []).length;
  if (hasImages) {
    add("ai-image-alt", "AI search visibility", "Images have descriptive alt text",
      totalImgs > 0 && altAttrs / totalImgs >= 0.8 ? "pass" : "warn",
      altAttrs + " of " + totalImgs + " image(s) have alt text" + (totalImgs > 0 && altAttrs / totalImgs < 0.8 ? " — missing alt hurts accessibility AND the training signal for AI understanding." : "."),
      ["Write alt text that describes what the image shows in the context of the page — not \u201cimage1.jpg\u201d."]);
  }

  const cleanHeadings = (html.match(/<h[1-6][^>]*>([^<]*)<\/h[1-6]>/gi) ?? []).map(h => h.replace(/<[^>]+>/g,'').trim());
  const hasUsefulHeadings = cleanHeadings.some(h => h.length >= 4 && h.length <= 100);
  add("ai-heading-quality", "AI search visibility", "Headings are descriptive and useful",
    hasUsefulHeadings ? "pass" : "warn",
    hasUsefulHeadings
      ? "Headings include specific, descriptive text — AI question-answering models match these to user queries."
      : "Headings are missing, generic, or extremely long/short — AI models struggle to extract clear answers from vague structure.",
    ["Make each H2/H3 a specific question or statement the page answers (e.g., \u201cHow long does delivery take?\u201d).", "Avoid vague headings like \u201cWelcome\u201d or \u201cOur services\u201d — they tell no one what you do."]);

  add("ai-crawlability", "AI search visibility", "Crawlable without JavaScript",
    html.length > 1000 ? "pass" : "warn",
    html.length > 1000
      ? "Substantial HTML was served directly — crawlers and LLM retrievers that don\u2019t run JavaScript can read this page."
      : "Very little static HTML — if this content is rendered by JavaScript only, many crawlers (and offline AI retrievers) will see nothing.",
    ["Ensure critical content is present in the raw HTML (view source), not injected by JS-only rendering.", "Use server-side rendering or pre-rendering for pages you want indexed and discoverable."]);

    const scored = checks.filter((c) => c.status !== "info");
  const failing = checks.filter((c) => c.status === "fail" || c.status === "warn");
  const visibilitySteps: string[] = [];
  if (blockedByMeta) visibilitySteps.push("FIRST: remove the noindex directive (see the fix above) — nothing else matters until crawlers are allowed in.");
  if (robotsBlocksHome) visibilitySteps.push("Fix robots.txt so it stops disallowing your pages, then re-run this check.");
  if (!sitemapOk) visibilitySteps.push("Publish a valid /sitemap.xml and add `Sitemap: https://${host}/sitemap.xml` to robots.txt.");
  visibilitySteps.push(
    "Verify the site in Google Search Console (search.google.com/search-console) with the DNS or HTML-tag method — this is the only place that shows your real Google impressions, clicks and average position. Clyvro can't see those numbers and won't guess them.",
    "In Search Console: submit your sitemap, then use URL Inspection → Request Indexing for the homepage and your most important pages.",
    "Do the same in Bing Webmaster Tools (bing.com/webmasters) — it also feeds DuckDuckGo and other alternative engines, and you can import your Search Console data in one click.",
    "Earn links from real sites in your niche (directories, partners, press) — links remain the strongest visibility signal after basic indexability.",
    "Re-run this check after fixes, and watch Search Console's Pages report weekly: 'Crawled — currently not indexed' pages need better content or internal links, not more submissions.",
  );
  if (failing.length === 0) {
    visibilitySteps.unshift("Good news: nothing technical is blocking you. Visibility from here is about Search Console data, content and links:");
  }

  const indexing: { state: string; why: string }[] = [];
  if (blockedByMeta) indexing.push({ state: "Excluded by ‘noindex’ tag", why: "A noindex directive tells Google not to show this URL. Remove it, then use URL Inspection → Request indexing." });
  if (robotsBlocksHome) indexing.push({ state: "Blocked by robots.txt", why: "robots.txt Disallow covers this URL, so Googlebot will not crawl it. Fix robots.txt first." });
  const norm = (u: string) => {
    try { const x = new URL(u); return `${x.origin}${x.pathname.replace(/\/$/, "") || "/"}`; } catch { return u.replace(/\/$/, ""); }
  };
  if (canonical && norm(canonical) !== norm(main.finalUrl)) {
    indexing.push({ state: "Alternate page with proper canonical tag", why: `Canonical points at ${canonical}. Google will prefer that URL over this one.` });
  }
  if ((html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).length) < 80) {
    indexing.push({ state: "Crawled — currently not indexed", why: "Very little text on the page. Search Console uses this status for thin or duplicate URLs — add unique, useful copy." });
  }
  if (!sitemapOk) indexing.push({ state: "Discovered — currently not indexed", why: "No valid sitemap, so Google may discover the URL late or not at all. Publish /sitemap.xml and submit it in Search Console." });
  if (indexing.length === 0) {
    indexing.push({ state: "URL is eligible to be indexed", why: "Nothing technical is blocking this homepage. Actual index status, impressions and clicks only exist in Google Search Console — Clyvro cannot see them and will not guess." });
  }

  return {
    domain: apex,
    finalUrl: main.finalUrl,
    checks,
    summary: {
      pass: scored.filter((c) => c.status === "pass").length,
      warn: scored.filter((c) => c.status === "warn").length,
      fail: scored.filter((c) => c.status === "fail").length,
      total: scored.length,
    },
    preview: { title, url: main.finalUrl, description, logo, siteName },
    indexing,
    visibilitySteps,
  };
}

import { parse, type HTMLElement } from "node-html-parser";
import type { FetchOutcome, ParsedForm, ParsedPage } from "./types";

/**
 * Extracts exactly the facts the rule set needs from raw HTML.
 * No JavaScript is executed — this is an HTTP-level view of the page,
 * which the report states as a limitation.
 */

const NON_LABELLED_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

function hasAncestorLabel(el: HTMLElement): boolean {
  let node: HTMLElement | null = el.parentNode as HTMLElement | null;
  for (let depth = 0; node && depth < 6; depth++) {
    if (node.tagName === "LABEL") return true;
    node = node.parentNode as HTMLElement | null;
  }
  return false;
}

function shortText(el: HTMLElement): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function parsePage(outcome: FetchOutcome): ParsedPage {
  const root = parse(outcome.bodyText ?? "");

  const titleEl = root.querySelector("title");
  const title = titleEl ? titleEl.textContent.replace(/\s+/g, " ").trim() || null : null;

  const metaDescription =
    root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() || null;
  const hasViewport = !!root.querySelector('meta[name="viewport"]');
  const lang = root.querySelector("html")?.getAttribute("lang")?.trim() || null;
  const h1Count = root.querySelectorAll("h1").length;

  const imgEls = root.querySelectorAll("img");
  const imagesMissingAlt: string[] = [];
  let imagesWithoutDimensions = 0;
  for (const img of imgEls) {
    // Missing alt ATTRIBUTE is the detectable problem; alt="" is the correct
    // way to mark decorative images and is not flagged.
    if (img.getAttribute("alt") === undefined) {
      const src = img.getAttribute("src") ?? "";
      imagesMissingAlt.push(src.startsWith("data:") ? "(inline data image)" : src || "(no src)");
    }
    // No width/height (and no aspect-ratio style) → layout can jump as images load.
    const style = img.getAttribute("style") ?? "";
    if (!img.getAttribute("width") && !img.getAttribute("height") && !/aspect-ratio/i.test(style)) imagesWithoutDimensions++;
  }

  // Ruleset 1.2 signals.
  const hasFavicon = !!root.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  const insecureSubresources: string[] = [];
  if (outcome.finalUrl.startsWith("https://")) {
    for (const el of root.querySelectorAll("img[src], script[src], link[href], iframe[src], source[src], video[src], audio[src]")) {
      const ref = el.getAttribute("src") ?? el.getAttribute("href") ?? "";
      if (/^http:\/\//i.test(ref)) insecureSubresources.push(ref);
    }
  }
  const externalBlankNoRel: string[] = [];
  for (const a of root.querySelectorAll('a[target="_blank"]')) {
    const href = a.getAttribute("href") ?? "";
    if (!/^https?:\/\//i.test(href)) continue;
    try {
      if (new URL(href).origin === new URL(outcome.finalUrl).origin) continue;
    } catch { continue; }
    const rel = (a.getAttribute("rel") ?? "").toLowerCase();
    if (!rel.includes("noopener")) externalBlankNoRel.push(href);
  }

  const links = root
    .querySelectorAll("a[href]")
    .map((a) => ({ href: a.getAttribute("href") ?? "", text: shortText(a) }))
    .filter((l) => l.href !== "");

  const actionTexts = [
    ...root.querySelectorAll("a").map(shortText),
    ...root.querySelectorAll("button").map(shortText),
    ...root
      .querySelectorAll('input[type="submit"], input[type="button"]')
      .map((i) => (i.getAttribute("value") ?? "").trim()),
  ].filter(Boolean);

  const labelFors = new Set(
    root
      .querySelectorAll("label[for]")
      .map((l) => l.getAttribute("for"))
      .filter((v): v is string => !!v),
  );

  const forms: ParsedForm[] = root.querySelectorAll("form").map((form) => {
    const fields = form.querySelectorAll("input, textarea, select");
    const unlabelledFields: string[] = [];
    let hasPassword = false;
    let hasEmail = false;
    for (const field of fields) {
      const type = (field.getAttribute("type") ?? (field.tagName === "INPUT" ? "text" : field.tagName.toLowerCase())).toLowerCase();
      if (type === "password") hasPassword = true;
      if (type === "email") hasEmail = true;
      if (field.tagName === "INPUT" && NON_LABELLED_INPUT_TYPES.has(type)) continue;
      const id = field.getAttribute("id");
      const labelled =
        (!!id && labelFors.has(id)) ||
        hasAncestorLabel(field) ||
        !!field.getAttribute("aria-label") ||
        !!field.getAttribute("aria-labelledby");
      if (!labelled) {
        const ident = id ? `#${id}` : field.getAttribute("name") ? `[name="${field.getAttribute("name")}"]` : `<${field.tagName.toLowerCase()} type="${type}">`;
        unlabelledFields.push(ident);
      }
    }
    return {
      action: form.getAttribute("action")?.trim() || null,
      method: (form.getAttribute("method") ?? "get").toLowerCase(),
      hasPassword,
      hasEmail,
      unlabelledFields,
    };
  });

  // Ruleset 3.0 signals.
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute("href")?.trim() || null;
  const ogProps = new Set(
    root.querySelectorAll('meta[property^="og:"]').map((m) => (m.getAttribute("property") ?? "").toLowerCase()),
  );
  const hasOgBasics = ogProps.has("og:title") && ogProps.has("og:description") && ogProps.has("og:image");
  const hasTwitterCard = !!root.querySelector('meta[name="twitter:card"]');
  const hasJsonLd = root.querySelectorAll('script[type="application/ld+json"]').length > 0;
  const generator = root.querySelector('meta[name="generator"]')?.getAttribute("content")?.trim() || null;
  let headingSkips = 0;
  {
    let prev = 0;
    for (const h of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      const level = Number(h.tagName.slice(1));
      if (prev > 0 && level > prev + 1) headingSkips++;
      if (level > 0) prev = level;
    }
  }
  const bodyText = (root.querySelector("body")?.textContent ?? root.textContent ?? "").replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").length : 0;
  const GENERIC_LINK = /^(click here|here|read more|learn more|more|link|this link|go)$/i;
  const genericLinkTexts = [
    ...new Set(
      links
        .map((l) => l.text.trim())
        .filter((t) => t.length > 0 && t.length <= 20 && GENERIC_LINK.test(t)),
    ),
  ].slice(0, 10);

  // Label assessment is page-wide, not just inside <form> elements some
  // sites build forms from bare inputs; ParsedForm only covers real forms,
  // so stray fields are surfaced through a synthetic check in rules via links/forms only.
  return {
    url: outcome.finalUrl,
    status: outcome.status,
    bytes: outcome.bytes,
    durationMs: outcome.durationMs,
    truncated: outcome.truncated,
    title,
    metaDescription,
    hasViewport,
    lang,
    h1Count,
    imagesMissingAlt,
    imagesTotal: imgEls.length,
    imagesWithoutDimensions,
    insecureSubresources: [...new Set(insecureSubresources)].slice(0, 20),
    hasFavicon,
    externalBlankNoRel: [...new Set(externalBlankNoRel)].slice(0, 20),
    canonical,
    hasOgBasics,
    hasTwitterCard,
    hasJsonLd,
    headingSkips,
    wordCount,
    generator,
    genericLinkTexts,
    links,
    forms,
    actionTexts,
  };
}

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
  const weakAlts: string[] = [];
  let imagesWithoutDimensions = 0;
  const WEAK_ALT = /^(image|photo|picture|img|untitled|icon|logo|screenshot|dsc\d+|img[-_]?\d+)(\.\w+)?$/i;
  const FILE_ALT = /\.(jpe?g|png|gif|webp|svg|bmp)$/i;
  for (const img of imgEls) {
    // Missing alt ATTRIBUTE is the detectable problem; alt="" is the correct
    // way to mark decorative images and is not flagged.
    const src = img.getAttribute("src") ?? "";
    const srcLabel = src.startsWith("data:") ? "(inline data image)" : src || "(no src)";
    const altAttr = img.getAttribute("alt");
    if (altAttr === undefined || altAttr === null) {
      imagesMissingAlt.push(srcLabel);
    } else {
      const alt = altAttr.trim();
      if (alt && (WEAK_ALT.test(alt) || FILE_ALT.test(alt))) weakAlts.push(`${alt} on ${srcLabel}`);
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

  /* ---- Ruleset 5.0 signals (one bounded pass each; all evidence-grade) ---- */
  const idCounts = new Map<string, number>();
  for (const el of root.querySelectorAll("[id]")) {
    const id = el.getAttribute("id")?.trim();
    if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }
  const referencedIds = new Set<string>();
  for (const l of root.querySelectorAll("label[for]")) {
    const f = l.getAttribute("for")?.trim();
    if (f) referencedIds.add(f);
  }
  for (const el of root.querySelectorAll("[aria-labelledby], [aria-describedby], [aria-controls], [aria-owns]")) {
    for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns"]) {
      for (const tok of (el.getAttribute(attr) ?? "").split(/\s+/)) if (tok) referencedIds.add(tok);
    }
  }
  const duplicateIdsReferenced = [...idCounts.entries()].filter(([id, n]) => n > 1 && referencedIds.has(id)).map(([id]) => id);
  const duplicateIdsPlain = [...idCounts.entries()].filter(([id, n]) => n > 1 && !referencedIds.has(id)).map(([id]) => id);
  const brokenIdRefs = [...referencedIds].filter((id) => !idCounts.has(id)).slice(0, 20);

  const emptyHeadings = root.querySelectorAll("h1, h2, h3, h4, h5, h6")
    .filter((h) => !(h.textContent ?? "").replace(/\s+/g, " ").trim()).length;
  const iframesMissingTitle = root.querySelectorAll("iframe")
    .filter((f) => !(f.getAttribute("title") ?? "").trim()).length;

  const viewportContent = (root.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "").toLowerCase();
  const viewportBlocksZoom = /user-scalable\s*=\s*no/.test(viewportContent)
    || (() => { const m = viewportContent.match(/maximum-scale\s*=\s*([0-9.]+)/); return !!m && Number(m[1]) < 2; })();

  const placeholderOnlyFields: string[] = [];
  const fieldsMissingAutocomplete: string[] = [];
  const fieldsMissingName: string[] = [];
  const PERSONAL_TYPES = new Set(["email", "tel", "text", "password"]);
  const AUTOCOMPLETE_HINT = /e-?mail|phone|tel|name|address|city|postcode|postal|zip|country/i;
  for (const field of root.querySelectorAll("input, textarea, select")) {
    const tag = field.tagName.toLowerCase();
    const type = (field.getAttribute("type") ?? (tag === "input" ? "text" : tag)).toLowerCase();
    if (tag === "input" && NON_LABELLED_INPUT_TYPES.has(type)) continue;
    const id = field.getAttribute("id");
    const ident = id ? `#${id}` : field.getAttribute("name") ? `[name="${field.getAttribute("name")}"]` : `<${tag} type="${type}">`;
    const labelled =
      (!!id && labelFors.has(id)) || hasAncestorLabel(field)
      || !!field.getAttribute("aria-label") || !!field.getAttribute("aria-labelledby");
    if (!labelled && (field.getAttribute("placeholder") ?? "").trim()) placeholderOnlyFields.push(ident);
    if (!field.getAttribute("name") && field.closest("form")) fieldsMissingName.push(ident);
    const hintsPersonal = type === "email" || type === "tel"
      || AUTOCOMPLETE_HINT.test(field.getAttribute("name") ?? "")
      || AUTOCOMPLETE_HINT.test(id ?? "");
    if (PERSONAL_TYPES.has(type) && hintsPersonal && !(field.getAttribute("autocomplete") ?? "").trim()) {
      fieldsMissingAutocomplete.push(`${ident} (${type})`);
    }
  }

  const emptyLinks = root.querySelectorAll("a[href]").filter((a) => {
    const text = (a.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) return false;
    if ((a.getAttribute("aria-label") ?? "").trim() || (a.getAttribute("title") ?? "").trim()) return false;
    const img = a.querySelector("img");
    return !(img && (img.getAttribute("alt") ?? "").trim());
  }).length;

  let jsonLdInvalid = 0;
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try { JSON.parse(s.textContent ?? ""); } catch { jsonLdInvalid++; }
  }

  const canonicalCount = root.querySelectorAll('link[rel="canonical"]').length;
  const ogImage = root.querySelector('meta[property="og:image"]')?.getAttribute("content")?.trim() || null;
  const twitterCard = root.querySelector('meta[name="twitter:card"]')?.getAttribute("content")?.trim().toLowerCase() || null;
  const hreflangLinks = root.querySelectorAll('link[rel="alternate"][hreflang]').map((l) => ({
    code: (l.getAttribute("hreflang") ?? "").toLowerCase(),
    href: l.getAttribute("href") ?? "",
  })).filter((h) => h.code).slice(0, 40);
  const metaRefresh = !!root.querySelector('meta[http-equiv="refresh"]');
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
    weakAlts: weakAlts.slice(0, 20),
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
    duplicateIdsReferenced: duplicateIdsReferenced.slice(0, 20),
    duplicateIdsPlain: duplicateIdsPlain.slice(0, 20),
    brokenIdRefs,
    emptyHeadings,
    iframesMissingTitle,
    viewportBlocksZoom,
    placeholderOnlyFields: placeholderOnlyFields.slice(0, 20),
    fieldsMissingAutocomplete: fieldsMissingAutocomplete.slice(0, 20),
    fieldsMissingName: fieldsMissingName.slice(0, 20),
    emptyLinks,
    jsonLdInvalid,
    canonicalCount,
    ogImage,
    twitterCard,
    hreflangLinks,
    metaRefresh,
    headers: outcome.headers,
    cookieFlags: outcome.cookieFlags,
    links,
    forms,
    actionTexts,
  };
}

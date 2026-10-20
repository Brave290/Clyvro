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
  for (const img of imgEls) {
    // Missing alt ATTRIBUTE is the detectable problem; alt="" is the correct
    // way to mark decorative images and is not flagged.
    if (img.getAttribute("alt") === undefined) {
      const src = img.getAttribute("src") ?? "";
      imagesMissingAlt.push(src.startsWith("data:") ? "(inline data image)" : src || "(no src)");
    }
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
    links,
    forms,
    actionTexts,
  };
}

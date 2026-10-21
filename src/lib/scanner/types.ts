import type { Finding } from "@/lib/types";
import type { DetectedTech } from "@/lib/tech-detection";

export type { DetectedTech };

/** Structured scanner errors — `code` is stable for API/UI mapping. */
export class ScanError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ScanError";
  }
}

export interface ValidatedTarget {
  url: URL;
  hostname: string;
  /** Resolved IPs that passed the public-address checks (empty when the host is one). */
  ips: string[];
  isIpLiteral: boolean;
}

export interface FetchOutcome {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  isHtml: boolean;
  bodyText: string | null;
  bytes: number;
  truncated: boolean;
  durationMs: number;
  redirectChain: string[];
  /** Allowlisted response headers (readiness/security checks). Not persisted in checkpoints. */
  headers?: Record<string, string>;
  /** Cookie names + safety flags only (values are never captured). */
  cookieFlags?: { name: string; secure: boolean; httpOnly: boolean; sameSite: string | null }[];
}

/** Fetch metadata safe to persist between serverless invocations. */
export interface FetchOutcomeSummary {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  isHtml: boolean;
  bytes: number;
  truncated: boolean;
  durationMs: number;
  redirectChain: string[];
}

export interface ParsedForm {
  action: string | null;
  method: string;
  hasPassword: boolean;
  hasEmail: boolean;
  unlabelledFields: string[];
}

export interface ParsedPage {
  url: string;
  status: number;
  bytes: number;
  durationMs: number;
  truncated: boolean;
  title: string | null;
  metaDescription: string | null;
  hasViewport: boolean;
  lang: string | null;
  h1Count: number;
  imagesMissingAlt: string[];
  imagesTotal: number;
  /** Ruleset 1.2 fields — optional so pre-1.2 checkpoints stay valid; rules skip when absent. */
  imagesWithoutDimensions?: number;
  insecureSubresources?: string[];
  hasFavicon?: boolean;
  externalBlankNoRel?: string[];
  /** Ruleset 3.0 fields — optional so pre-3.0 checkpoints stay valid; rules skip when absent. */
  canonical?: string | null;
  hasOgBasics?: boolean;
  hasTwitterCard?: boolean;
  hasJsonLd?: boolean;
  /** Heading-level jumps (e.g. h1 → h3) in document order. */
  headingSkips?: number;
  /** Approximate visible word count of the page body. */
  wordCount?: number;
  /** <meta name="generator"> content, when the CMS/framework announces itself. */
  generator?: string | null;
  /** Links whose entire anchor text is generic ("click here", "read more", …). */
  genericLinkTexts?: string[];
  /* ---- Ruleset 5.0 fields (optional; rules skip when absent) ---- */
  /** IDs used more than once AND referenced by a label/ARIA attribute (can mislabel controls). */
  duplicateIdsReferenced?: string[];
  /** IDs used more than once with no label/ARIA reference (markup smell, needs review). */
  duplicateIdsPlain?: string[];
  /** label-for / ARIA references pointing at IDs that don't exist on the page. */
  brokenIdRefs?: string[];
  /** Headings with no text content. */
  emptyHeadings?: number;
  /** <iframe> elements with no title attribute. */
  iframesMissingTitle?: number;
  /** Viewport disables or over-restricts zoom (user-scalable=no / maximum-scale < 2). */
  viewportBlocksZoom?: boolean;
  /** Fields whose only naming is their placeholder text. */
  placeholderOnlyFields?: string[];
  /** Personal-data fields (email/name/tel/…) with no autocomplete attribute. */
  fieldsMissingAutocomplete?: string[];
  /** Form fields with no name attribute (their values are never submitted). */
  fieldsMissingName?: string[];
  /** Links with no discernible text (no text, aria-label, title, or image alt). */
  emptyLinks?: number;
  /** JSON-LD blocks that fail to parse as JSON. */
  jsonLdInvalid?: number;
  /** Number of <link rel="canonical"> tags (more than one is a conflicting signal). */
  canonicalCount?: number;
  /** og:image content, when present. */
  ogImage?: string | null;
  /** twitter:card content, when present. */
  twitterCard?: string | null;
  /** hreflang alternates declared by the page. */
  hreflangLinks?: { code: string; href: string }[];
  /** <meta http-equiv="refresh"> present (timed redirect). */
  metaRefresh?: boolean;
  /** Allowlisted response headers captured by the fetcher (security-header rules). */
  headers?: Record<string, string>;
  links: { href: string; text: string }[];
  forms: ParsedForm[];
  actionTexts: string[];
}

export type FetchKind = "page" | "link-check" | "form-action" | "robots";

export interface FetchRecord {
  status: number;
  kind: FetchKind;
}

export interface Referrer {
  from: string;
  anchorText: string;
}

export interface Coverage {
  pagesFetched: number;
  pagesParsed: number;
  linksDiscovered: number;
  linksChecked: number;
  linksUnchecked: number;
  formDestinationsChecked: number;
  skippedByRobots: number;
  truncatedPages: number;
  maxPages: number;
  maxDepth: number;
  deadlineHit: boolean;
}

export interface PageSummary {
  url: string;
  status: number;
  bytes: number;
  durationMs: number;
  title: string | null;
}

export interface ScanReport {
  status: "completed" | "partial" | "failed";
  /** Selected audit types for this scan (Phase 3). Absent = generic/full ruleset. */
  auditTypes?: string[];
  target: string;
  finalUrl: string | null;
  startedAt: string;
  durationMs: number;
  rulesetVersion: string;
  score: number | null;
  findings: Finding[];
  /** Technologies visible in public HTML/assets/headers/domains. Optional for pre-existing saved reports. */
  tech?: DetectedTech[];
  pages: PageSummary[];
  coverage: Coverage;
  limitations: string[];
  error: { code: string; message: string } | null;
}

export interface ScanCheckpointQueueItem {
  url: string;
  depth: number;
}

export interface ScanCheckpointVerifyItem {
  url: string;
  kind: "form-action" | "link-check";
}

/**
 * Versioned, JSON-safe progress for a bounded scan slice.  Deliberately no
 * FetchOutcome.bodyText (or any other raw response body) is part of this
 * contract.
 */
export interface ScanCheckpoint {
  version: 2;
  locale: string;
  target: string;
  startedAt: string;
  /** Absolute hard expiry for the complete resumable scan, not one slice. */
  deadlineAt: number;
  limits: { maxPages: number; maxLinkChecks: number; maxDepth: number };
  auditTypes: string[];
  crawl: {
    phase: "crawl" | "verify";
    robotsFetched: boolean;
    /** Deep scans only: /sitemap.xml routes merged into the queue (optional for older checkpoints). */
    sitemapSeeded?: boolean;
    robots: { agents: string[]; disallow: string[]; allow: string[] }[];
    /** Aggregated public technology signals (metadata only; never response bodies). Optional for older checkpoints. */
    tech?: DetectedTech[];
    startOutcome: FetchOutcomeSummary;
    pages: ParsedPage[];
    queue: ScanCheckpointQueueItem[];
    visited: string[];
    discovered: string[];
    fetches: [string, FetchRecord][];
    referrers: [string, Referrer[]][];
    failures: CrawlFailureRecord[];
    coverage: Coverage;
    robotsSkipped: string[];
    verifyQueue: ScanCheckpointVerifyItem[];
    verifyIndex: number;
  };
}

export interface CrawlFailureRecord {
  url: string;
  message: string;
}

import type { Finding } from "@/lib/types";

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
  target: string;
  finalUrl: string | null;
  startedAt: string;
  durationMs: number;
  rulesetVersion: string;
  score: number | null;
  findings: Finding[];
  pages: PageSummary[];
  coverage: Coverage;
  limitations: string[];
  error: { code: string; message: string } | null;
}

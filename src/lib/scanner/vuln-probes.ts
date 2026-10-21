import { RULESET_VERSION } from "./config";
import type { FetchOutcome, ParsedPage } from "./types";
import type { Finding } from "@/lib/types";

/**
 * Deep-scan injection DETECTION probes (Phase 2).
 *
 * What this is: non-destructive, error/reflection-based detection on a
 * bounded sample of same-origin GET parameters — the class of checks
 * external "Deep" scanners advertise for SQLi / XSS / LFI / RCE.
 *
 * What this is NOT: exploitation. Payloads are a quote, a harmless
 * marker string, a traversal to a file that does not exist, and an
 * echo of a random marker. No data is extracted, no state is changed,
 * forms are never submitted, and XXE is deliberately not probed (it
 * needs XML POST bodies — the capability table says "Not tested").
 *
 * Guardrails: only runs on the resumable deep-crawl path (deep scans
 * are ownership-verified before they queue), same-origin URLs the
 * crawler already discovered, every probe URL re-validated public by
 * the caller's fetch wrapper, destructive-looking parameters skipped,
 * at most MAX_TARGETS parameters, and every finding is labelled
 * measured/heuristic with the observed server response as evidence.
 * A clean probe run means "no signal observed", never "secure".
 */

export interface ProbeTarget {
  /** Full URL whose parameter is probed. */
  url: string;
  param: string;
  value: string;
}

const MAX_TARGETS = 5;
const SKIP_PARAM = /^(action|do|op|cmd|mode)$/i;
const SKIP_URL = /(delete|remove|logout|sign[-_]?out|unsubscribe|cancel|destroy|purge|checkout|payment|pay|order|confirm)/i;

export function extractProbeTargets(pages: ParsedPage[]): ProbeTarget[] {
  const targets: ProbeTarget[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    let origin: string;
    try { origin = new URL(page.url).origin; } catch { continue; }
    const candidates = [page.url, ...page.links.map((l) => l.href)];
    for (const raw of candidates) {
      if (targets.length >= MAX_TARGETS) return targets;
      let u: URL;
      try { u = new URL(raw, page.url); } catch { continue; }
      if (u.origin !== origin) continue;
      if (SKIP_URL.test(u.pathname + u.search)) continue;
      for (const [param, value] of u.searchParams.entries()) {
        if (targets.length >= MAX_TARGETS) break;
        if (SKIP_PARAM.test(param)) continue;
        const key = `${u.origin}${u.pathname}?${param}`;
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push({ url: u.href, param, value });
      }
    }
  }
  return targets;
}

const SQL_ERRORS = /SQL syntax[^<]{0,80}MySQL|ORA-\d{4,5}|PostgreSQL[^<]{0,40}(ERROR|error)|SQLite3?::|SQLSTATE\[|ODBC SQL Server|Unclosed quotation mark|quoted string not properly terminated|Microsoft OLE DB Provider/i;
const INCLUDE_ERRORS = /failed to open stream|include_path|fopen\([^)]*No such file|require\([^)]*failed|No such file or directory in [^\s<]+ on line/i;
const XSS_MARKER = "clyvro9x7<q>\"";
const RCE_MARKER = "CLYVRO9X7ECHO";
const LFI_VALUE = "../../../../clyvro-nonexistent-9x7";

function withParam(target: ProbeTarget, newValue: string): string {
  const u = new URL(target.url);
  u.searchParams.set(target.param, newValue);
  return u.href;
}

export type ProbeFetch = (url: URL) => Promise<FetchOutcome | null>;

const pathOf = (u: string) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };

function finding(
  ruleId: string, severity: Finding["severity"], basis: Finding["confidenceBasis"],
  target: ProbeTarget, title: string, explanation: string, evidence: string, recommendation: string,
): Finding {
  return {
    ruleId, ruleVersion: RULESET_VERSION, category: "Reliability", severity, confidenceBasis: basis,
    effort: "Hours",
    page: pathOf(target.url),
    title, explanation, evidence: [evidence], recommendation,
    impactRationale: "Deep-scan detection probe (non-destructive): the payload was a quote, marker string, nonexistent-file traversal, or marker echo — no data was extracted and no state was changed. Verify with your own test before treating this as a confirmed vulnerability.",
  };
}

/** Run the bounded probe set. Returns findings + how many parameters were probed. */
export async function runVulnProbes(
  pages: ParsedPage[],
  fetchFn: ProbeFetch,
  opts: { shouldContinue?: () => boolean } = {},
): Promise<{ targets: number; findings: Finding[] }> {
  const targets = extractProbeTargets(pages);
  const findings: Finding[] = [];
  let probed = 0;

  for (const target of targets) {
    if (opts.shouldContinue && !opts.shouldContinue()) break;
    const baseline = await fetchFn(new URL(target.url)).catch(() => null);
    if (!baseline?.bodyText) continue;
    probed++;
    const base = baseline.bodyText;
    const get = async (value: string) => {
      const out = await fetchFn(new URL(withParam(target, value))).catch(() => null);
      return out?.bodyText ?? null;
    };

    // SQL injection — error-based: a lone quote should never make a
    // database confess. Baseline comparison keeps WAF/error pages
    // that always contain these strings from false-flagging.
    const sqlBody = await get(`${target.value}'`);
    if (sqlBody && SQL_ERRORS.test(sqlBody) && !SQL_ERRORS.test(base)) {
      const m = sqlBody.match(SQL_ERRORS);
      findings.push(finding(
        "CLY-201", "high", "measured", target,
        `Possible SQL injection in the "${target.param}" parameter`,
        "Appending a single quote to this parameter made the server return a database error that the normal request doesn't produce. That usually means the value reaches a SQL query without proper parameterisation — the classic SQL-injection shape.",
        `Probe: ${pathOf(withParam(target, `${target.value}'`))} → database error in response (“${(m?.[0] ?? "SQL error").slice(0, 120)}”); the unmodified URL does not produce it.`,
        "Use parameterised queries/prepared statements for this parameter everywhere it is used; never build SQL by string concatenation. Then re-run a deep scan to confirm the error is gone.",
      ));
      continue; // one strong signal per parameter is enough
    }

    // Reflected XSS — the marker contains < > " so verbatim reflection
    // means the value is written into HTML without encoding.
    const xssBody = await get(XSS_MARKER);
    if (xssBody && xssBody.includes(XSS_MARKER) && !base.includes(XSS_MARKER)) {
      findings.push(finding(
        "CLY-202", "high", "heuristic", target,
        `Possible reflected XSS via the "${target.param}" parameter`,
        "A harmless marker containing <, > and a quote was reflected back into the page exactly as sent. If an attacker-controlled value is written into HTML unencoded like this, a crafted link can run script in a visitor's browser. (Reflection alone doesn't prove a working exploit — context matters — so verify manually.)",
        `Probe marker reflected verbatim at ${pathOf(target.url)} (parameter "${target.param}").`,
        "HTML-encode this value on output (your framework's escaping), validate it on input, and keep the Content-Security-Policy strict as a second line of defence.",
      ));
      continue;
    }

    // File inclusion — traversal to a file that does not exist; a PHP
    // include/require warning in response (absent at baseline) means
    // the value steers file loading.
    const lfiBody = await get(LFI_VALUE);
    if (lfiBody && INCLUDE_ERRORS.test(lfiBody) && !INCLUDE_ERRORS.test(base)) {
      findings.push(finding(
        "CLY-203", "high", "heuristic", target,
        `Possible file-inclusion flaw in the "${target.param}" parameter`,
        "Pointing this parameter at a nonexistent path made the server emit a file-include warning the normal request doesn't produce — the value appears to steer which file the server loads, which is the shape of local/remote file inclusion.",
        `Probe: ${pathOf(withParam(target, LFI_VALUE))} → include warning in response; baseline is clean.`,
        "Never let request input choose files directly: map allowed values to a fixed allowlist of files server-side, and disable remote file inclusion (allow_url_include=Off).",
      ));
      continue;
    }

    // Command execution — echo marker: if the marker returns WITHOUT
    // the shell syntax that carried it, something executed the echo.
    const rcePayload = `;echo ${RCE_MARKER}`;
    const rceBody = await get(rcePayload);
    if (rceBody && rceBody.includes(RCE_MARKER) && !rceBody.includes(rcePayload) && !rceBody.includes(encodeURIComponent(rcePayload))) {
      findings.push(finding(
        "CLY-204", "critical", "measured", target,
        `Possible command execution via the "${target.param}" parameter`,
        "A probe asked the server to echo a random marker. The marker came back without the shell syntax that carried it — the signature of the value reaching a system shell. Treat this as urgent and verify immediately with your own controlled test.",
        `Probe parameter "${target.param}" at ${pathOf(target.url)} returned the bare marker ${RCE_MARKER}.`,
        "Remove shell invocation for this input entirely (no exec/system/passthru with request data); if a command is unavoidable, use an allowlist of fixed arguments with no shell interpolation, running least-privilege.",
      ));
    }
  }

  return { targets: probed, findings };
}

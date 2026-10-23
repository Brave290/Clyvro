#!/usr/bin/env node
/**
 * Clyvro CLI + MCP — login with your account (device code) or an API key.
 *   node clyvro.mjs login
 *   node clyvro.mjs scan https://example.com --consent
 *   node clyvro.mjs mcp
 */
import { homedir } from "node:os";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as stdinFd, stdout as stdoutFd } from "node:process";

const DEFAULT_BASE = "https://clyvro.vercel.app";
const DIR = join(homedir(), ".clyvro");
const FILE = join(DIR, "config.json");

function loadCfg() {
  try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return {}; }
}
function saveCfg(cfg) {
  mkdirSync(DIR, { mode: 0o700, recursive: true });
  writeFileSync(FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}
function flag(name) {
  return process.argv.includes(name);
}
function positional() {
  return process.argv.slice(3).filter((a) => !a.startsWith("-"));
}

function base() {
  return (arg("--base") || process.env.CLYVRO_BASE || loadCfg().base || DEFAULT_BASE).replace(/\/+$/, "");
}
function key() {
  return arg("--api-key") || process.env.CLYVRO_API_KEY || loadCfg().apiKey || "";
}

async function api(method, path, body) {
  const headers = { accept: "application/json" };
  const k = key();
  if (k) headers.authorization = `Bearer ${k}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${base()}${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message || json?.error?.code || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

function out(data) {
  if (flag("--pretty") && typeof data === "object") {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(JSON.stringify(data));
  }
}

async function login() {
  const pasted = arg("--api-key") || process.env.CLYVRO_API_KEY;
  if (pasted) {
    saveCfg({ ...loadCfg(), apiKey: pasted, base: base() });
    const me = await api("GET", "/api/v1/me");
    out({ ok: true, ...me });
    return;
  }
  const started = await fetch(`${base()}/api/v1/cli/device`, { method: "POST" }).then((r) => r.json());
  if (!started?.user_code) throw new Error(started?.error?.message || "Could not start login.");
  console.error(`Open ${started.verify_url} on your phone and enter: ${started.user_code}`);
  const until = Date.now() + (started.expires_in || 900) * 1000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, (started.interval || 5) * 1000));
    const polled = await fetch(`${base()}/api/v1/cli/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: started.device_code }),
    }).then((r) => r.json());
    if (polled?.token) {
      saveCfg({ ...loadCfg(), apiKey: polled.token, base: base() });
      out({ ok: true, expires_in: polled.expires_in });
      return;
    }
    if (polled?.error && polled.error.code !== "VALIDATION" && polled.status !== "pending") {
      throw new Error(polled.error.message || "Login failed.");
    }
  }
  throw new Error("Login timed out.");
}

function consentBody(url, extra = {}) {
  return { url, consent: true, ownsOrAuthorized: true, acceptLogs: true, noThirdPartyAttack: true, ...extra };
}

async function pollUntil(path, id) {
  for (let i = 0; i < 90; i += 1) {
    const row = await api("GET", `${path}/${id}`);
    if (row.status === "completed" || row.status === "failed") return row;
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Timed out waiting for the run.");
}

const TOOLS = [
  { name: "whoami", description: "Show the signed-in workspace." },
  { name: "scan", description: "Start a Full Scan. Args: url" },
  { name: "guard", description: "Ask Site Guard about a request. Args: path" },
  { name: "lab", description: "Send GET/HEAD/OPTIONS to a verified path. Args: url path" },
  { name: "lab_scan", description: "Discover and probe pages on a verified site. Args: url" },
  { name: "pentest", description: "Authorized pentest on a verified domain. Args: url" },
  { name: "flow", description: "Live walk-through. Args: url" },
  { name: "hack", description: "Hack Protection check. Args: url" },
  { name: "seo", description: "SEO visibility check. Args: url" },
];

async function runTool(name, args) {
  const url = args.url || args[0];
  if (name === "whoami") return api("GET", "/api/v1/me");
  if (name === "scan") {
    const created = await api("POST", "/api/v1/scans", consentBody(url));
    if (created.id && created.status === "queued") return pollUntil("/api/v1/scans", created.id);
    return created;
  }
  if (name === "guard") {
    return api("POST", "/api/v1/guard", {
      method: args.method || "GET",
      path: args.path || args[0] || "/",
      search: args.search || "",
      userAgent: args.userAgent || "clyvro-cli",
    });
  }
  if (name === "lab") {
    return api("POST", "/api/v1/lab", consentBody(url, { path: args.path || args[1] || "/", method: args.method || "GET" }));
  }
  if (name === "lab_scan") return api("POST", "/api/v1/lab/scan", consentBody(url));
  if (name === "pentest") {
    const created = await api("POST", "/api/v1/pentests", consentBody(url, { typedConfirmation: "I AUTHORIZE THIS PENTEST" }));
    if (created.id && created.status === "queued") return pollUntil("/api/v1/pentests", created.id);
    return created;
  }
  if (name === "flow") {
    const created = await api("POST", "/api/v1/flow-scans", consentBody(url));
    if (created.id && created.status === "queued") return pollUntil("/api/v1/flow-scans", created.id);
    return created;
  }
  if (name === "hack") return api("POST", "/api/v1/hack-protection", consentBody(url));
  if (name === "seo") return api("POST", "/api/v1/seo", consentBody(url));
  throw new Error(`Unknown tool ${name}`);
}

async function mcp() {
  const rl = createInterface({ input: stdinFd, crlfDelay: Infinity });
  const send = (msg) => stdoutFd.write(JSON.stringify(msg) + "\n");
  for await (const line of rl) {
    if (!line.trim()) continue;
    let req;
    try { req = JSON.parse(line); } catch { continue; }
    const id = req.id;
    try {
      if (req.method === "initialize") {
        send({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "clyvro", version: "0.2.0" } } });
      } else if (req.method === "notifications/initialized") {
        /* ack not required */
      } else if (req.method === "tools/list") {
        send({
          jsonrpc: "2.0", id,
          result: {
            tools: TOOLS.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: { type: "object", properties: { url: { type: "string" }, path: { type: "string" }, method: { type: "string" } } },
            })),
          },
        });
      } else if (req.method === "tools/call") {
        const name = req.params?.name;
        const args = req.params?.arguments ?? {};
        const result = await runTool(name, args);
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result) }] } });
      } else {
        send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown method" } });
      }
    } catch (err) {
      send({ jsonrpc: "2.0", id, error: { code: -32000, message: err instanceof Error ? err.message : "error" } });
    }
  }
}

function help() {
  console.log(`Clyvro CLI

  clyvro login                 Sign in from your phone (device code)
  clyvro login --api-key cly_  Save a key from API & keys
  clyvro logout
  clyvro whoami
  clyvro scan <url> --consent
  clyvro guard --path /
  clyvro lab <url> --path /
  clyvro lab-scan <url> --consent
  clyvro pentest <url> --consent
  clyvro flow <url> --consent
  clyvro hack <url> --consent
  clyvro seo <url> --consent
  clyvro mcp                   MCP server on stdin/stdout

Env: CLYVRO_API_KEY  CLYVRO_BASE
Config: ~/.clyvro/config.json
`);
}

const cmd = process.argv[2] || "help";

try {
  if (cmd === "help" || cmd === "--help" || cmd === "-h") help();
  else if (cmd === "login") await login();
  else if (cmd === "logout") {
    if (existsSync(FILE)) rmSync(FILE);
    out({ ok: true });
  } else if (cmd === "mcp") await mcp();
  else if (cmd === "whoami") out(await runTool("whoami", {}));
  else if (cmd === "scan") out(await runTool("scan", { url: positional()[0] }));
  else if (cmd === "guard") out(await runTool("guard", { path: arg("--path", "/"), method: arg("--method", "GET") }));
  else if (cmd === "lab") out(await runTool("lab", { url: positional()[0], path: arg("--path", positional()[1] || "/"), method: arg("--method", "GET") }));
  else if (cmd === "lab-scan" || cmd === "lab_scan") out(await runTool("lab_scan", { url: positional()[0] }));
  else if (cmd === "pentest") out(await runTool("pentest", { url: positional()[0] }));
  else if (cmd === "flow") out(await runTool("flow", { url: positional()[0] }));
  else if (cmd === "hack") out(await runTool("hack", { url: positional()[0] }));
  else if (cmd === "seo") out(await runTool("seo", { url: positional()[0] }));
  else {
    help();
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}

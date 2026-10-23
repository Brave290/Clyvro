import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock, CopyButton } from "@/components/CopyCode";
import { SITE_API_BASE } from "@/lib/site-api-docs";

export const metadata: Metadata = {
  title: "Developers — API, CLI and MCP",
  description: "Install clyvro on Alpine, Arch, Windows, macOS. Drive every Clyvro tool from a terminal or an AI agent.",
  alternates: { canonical: "/developers" },
};

const CLI_UNIX = `curl -fsSL ${SITE_API_BASE}/install.sh | sh
clyvro help
clyvro login`;

const CLI_ALPINE = `apk add --no-cache nodejs
wget -qO- ${SITE_API_BASE}/install.sh | sh
clyvro help`;

const CLI_ARCH = `sudo pacman -S --needed nodejs
curl -fsSL ${SITE_API_BASE}/install.sh | sh
clyvro help`;

const CLI_WIN = `irm ${SITE_API_BASE}/install.ps1 | iex
clyvro help
clyvro login`;

const CLI_NPM = `npm i -g ${SITE_API_BASE}/cli/clyvro.tgz
clyvro help`;

const CLI_COMMANDS = `clyvro help
clyvro login
clyvro whoami
clyvro scan https://your-site.com --consent
clyvro pentest https://your-site.com --consent
clyvro flow https://your-site.com --consent
clyvro lab https://your-site.com --path / --consent
clyvro lab-scan https://your-site.com --consent
clyvro hack https://your-site.com --consent
clyvro seo https://your-site.com --consent
clyvro readiness https://your-site.com --consent
clyvro ai https://your-site.com --consent
clyvro ssl https://your-site.com --consent
clyvro dns https://your-site.com --consent
clyvro redirects https://your-site.com --consent
clyvro headers https://your-site.com --consent
clyvro robots https://your-site.com --path / --consent
clyvro review .
clyvro guard --path /
clyvro mcp`;

const MCP_JSON = `{
  "mcpServers": {
    "clyvro": {
      "command": "clyvro",
      "args": ["mcp"],
      "env": { "CLYVRO_API_KEY": "cly_YOUR_KEY" }
    }
  }
}`;

const WIDGET = `<script src="${SITE_API_BASE}/shield.js" data-sitekey="clys_YOUR_SITE_KEY"></script>`;

export default function DevelopersPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Pro &amp; Agency</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">Build with Clyvro</h1>
      <p className="mt-4 text-lg leading-relaxed text-ink-soft">
        The same tools as the website — Full Scan, pentest, Code Reviewer, SSL, DNS, and the rest — from a terminal or an agent. Works on Alpine, Arch, Debian, macOS, Windows, and WSL.
      </p>

      <div className="mt-8 grid gap-4">
        <Link href="#cli" className="card-sleek block">
          <p className="text-xs font-bold uppercase tracking-wide text-accent">1 · Any computer</p>
          <h2 className="mt-1 text-xl font-bold">CLI</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">Install <code className="font-mono">clyvro</code>, run <code className="font-mono">clyvro help</code>, then every command.</p>
        </Link>
        <Link href="#mcp" className="card-sleek block">
          <p className="text-xs font-bold uppercase tracking-wide text-accent">2 · AI agents</p>
          <h2 className="mt-1 text-xl font-bold">MCP</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">Cursor, Claude and friends call the same commands as tools.</p>
        </Link>
        <Link href="#api" className="card-sleek block">
          <p className="text-xs font-bold uppercase tracking-wide text-accent">3 · Your server</p>
          <h2 className="mt-1 text-xl font-bold">API + Shield widget</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">Bearer keys for scans and Guard. A one-line script for a branded check on your site.</p>
        </Link>
      </div>

      <section id="cli" className="mt-14 scroll-mt-24 space-y-4">
        <h2 className="text-2xl font-bold">Install the command</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Needs Node.js 18+. Sign in on your phone at <Link href="/cli/device" className="font-semibold text-accent hover:underline">/cli/device</Link>.
        </p>
        <CodeBlock caption="Linux, macOS, WSL" code={CLI_UNIX} />
        <CodeBlock caption="Alpine" code={CLI_ALPINE} />
        <CodeBlock caption="Arch Linux" code={CLI_ARCH} />
        <CodeBlock caption="Windows (PowerShell)" code={CLI_WIN} />
        <CodeBlock caption="npm — any OS" code={CLI_NPM} />
        <h3 className="pt-4 text-lg font-bold">Every command</h3>
        <p className="text-sm text-ink-soft">
          Type <code className="font-mono text-ink">clyvro help</code> any time. <code className="font-mono">--consent</code> means you own the site or have permission.
        </p>
        <CodeBlock caption="clyvro help" code={CLI_COMMANDS} />
      </section>

      <section id="mcp" className="mt-14 scroll-mt-24 space-y-4">
        <h2 className="text-2xl font-bold">MCP</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Same command. Point your agent at <code className="font-mono text-ink">clyvro mcp</code>.
          Tools match the CLI: scan, pentest, flow, lab, review, ssl, dns, readiness, ai, and the rest.
        </p>
        <CodeBlock caption="MCP config" code={MCP_JSON} />
      </section>

      <section id="api" className="mt-14 scroll-mt-24 space-y-4">
        <h2 className="text-2xl font-bold">API and Shield</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Create a secret under <Link href="/app/api-keys" className="font-semibold text-accent hover:underline">API &amp; keys</Link>.
          Add hostnames to mint a site key for the widget. Guard answers allow, challenge, or block.
        </p>
        <CodeBlock caption="Drop-in Shield check" code={WIDGET} />
        <p className="text-sm">
          Full reference: <Link href="/docs/api" className="font-semibold text-accent hover:underline">/docs/api</Link>
        </p>
        <CopyButton text={`${SITE_API_BASE}/docs/api`} label="Copy docs URL" />
      </section>
    </div>
  );
}

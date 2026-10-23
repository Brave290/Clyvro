import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock, CopyButton } from "@/components/CopyCode";
import { SITE_API_BASE } from "@/lib/site-api-docs";

export const metadata: Metadata = {
  title: "Developers — API, CLI and MCP",
  description: "Drive Clyvro from your code, a terminal, or an AI agent. Site Guard, Full Scan, Lab, CLI login, MCP.",
  alternates: { canonical: "/developers" },
};

const CLI_INSTALL = `curl -fsSL ${SITE_API_BASE}/cli/clyvro.mjs -o clyvro
chmod +x clyvro
node clyvro login`;

const MCP_JSON = `{
  "mcpServers": {
    "clyvro": {
      "command": "node",
      "args": ["./clyvro"],
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
        Three ways in — pick the one that fits the device in your hand.
      </p>

      <div className="mt-8 grid gap-4">
        <Link href="#cli" className="card-sleek block">
          <p className="text-xs font-bold uppercase tracking-wide text-accent">1 · Phone or laptop</p>
          <h2 className="mt-1 text-xl font-bold">CLI</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">Sign in from this page with a short code, then run every tool from a terminal.</p>
        </Link>
        <Link href="#mcp" className="card-sleek block">
          <p className="text-xs font-bold uppercase tracking-wide text-accent">2 · AI agents</p>
          <h2 className="mt-1 text-xl font-bold">MCP</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">Cursor, Claude and friends call Clyvro as tools. Same login as the CLI.</p>
        </Link>
        <Link href="#api" className="card-sleek block">
          <p className="text-xs font-bold uppercase tracking-wide text-accent">3 · Your server</p>
          <h2 className="mt-1 text-xl font-bold">API + Shield widget</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">Bearer keys for scans and Guard. A one-line script for a branded check on your site.</p>
        </Link>
      </div>

      <section id="cli" className="mt-14 scroll-mt-24 space-y-4">
        <h2 className="text-2xl font-bold">CLI</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Download the script, then <code className="font-mono text-ink">node clyvro login</code>.
          Your phone opens <Link href="/cli/device" className="font-semibold text-accent hover:underline">/cli/device</Link> — type the code, approve, done.
        </p>
        <CodeBlock caption="Install + login" code={CLI_INSTALL} />
        <CodeBlock caption="Scan a site you own" code={`node clyvro scan https://your-site.com --consent`} />
        <p className="text-sm text-ink-mute">Also: guard, lab, lab-scan, pentest, flow, hack, seo, whoami. JSON out.</p>
      </section>

      <section id="mcp" className="mt-14 scroll-mt-24 space-y-4">
        <h2 className="text-2xl font-bold">MCP</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Same file. Point your agent at <code className="font-mono text-ink">node clyvro mcp</code>.
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

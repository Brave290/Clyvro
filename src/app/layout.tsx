import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import Nav from "@/components/Nav";
import SiteFooter from "@/components/SiteFooter";
import ScrollToTop from "@/components/ScrollToTop";
import { ToastProvider } from "@/components/Toast";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://clyvro.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Clyvro — Find the friction. Fix the conversion.", template: "%s · Clyvro" },
  description:
    "Run a real, bounded website scan and get evidence-backed findings you can fix — no invented revenue claims.",
  applicationName: "Clyvro",
  keywords: ["website audit", "conversion audit", "website scanner", "broken link checker", "SEO audit", "accessibility audit"],
  authors: [{ name: "Clyvro" }],
  openGraph: {
    type: "website",
    siteName: "Clyvro",
    title: "Clyvro — Find the friction. Fix the conversion.",
    description:
      "Run a real, bounded website scan and get deterministic, evidence-backed findings. No invented lost-revenue numbers.",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Clyvro — Find the friction. Fix the conversion.",
    description:
      "Evidence-first website audits. Real scans, clear evidence, prioritised fixes.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-request CSP nonce minted by the middleware (src/lib/csp.ts) —
  // this inline theme script is the one inline script we own, and the
  // nonce is what lets script-src drop 'unsafe-inline'.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="clyvro-verification" content="clyvro-verification=rzW4zmlTzXki_Jkg04PoaAx56bbO0iRj6D2Msd4iCmw" />
        {/* Applies the stored/system theme before first paint — no flicker. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">
        <ToastProvider>
          <ScrollToTop />
          <Nav />
          <main>{children}</main>
          <SiteFooter />
        </ToastProvider>
      </body>
    </html>
  );
}

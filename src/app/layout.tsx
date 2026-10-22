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
  title: { default: "Clyvro — Is your website losing you customers?", template: "%s · Clyvro" },
  description:
    "Paste your website address. Clyvro checks it the way a real customer would — every link, every form, every page on a phone — and tells you in plain English what's broken and how to fix it. First check is free, no account needed.",
  applicationName: "Clyvro",
  keywords: ["website health check", "website checker", "fix my website", "broken links", "website not working", "small business website"],
  authors: [{ name: "Clyvro" }],
  openGraph: {
    type: "website",
    siteName: "Clyvro",
    title: "Clyvro — Is your website losing you customers?",
    description:
      "We check your website like a real customer would and show you what's stopping people from buying, booking, or contacting you — in plain English.",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Clyvro — Is your website losing you customers?",
    description:
      "Paste your link. We click everything, test every form, check your Google listing — and tell you what's broken in words anyone can understand.",
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
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="clyvro-verification" content="clyvro-verification=rzW4zmlTzXki_Jkg04PoaAx56bbO0iRj6D2Msd4iCmw" />
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

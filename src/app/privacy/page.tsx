import type { Metadata } from "next";
import { getPublishedLegal } from "@/lib/services/legal";
import LegalPageView from "@/components/LegalPageView";
export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Clyvro handles your data: what we collect when you scan a website, what we never store, and your choices.",
  alternates: { canonical: "/privacy" },
};
export const dynamic = "force-dynamic";
export default async function Privacy() {
  const published = await getPublishedLegal("privacy");
  if (published.body) return <LegalPageView title={published.title} body={published.body} publishedAt={published.publishedAt} />;
  return (<div className="mx-auto max-w-3xl px-5 py-14">
  <h1 className="animate-fade-up text-4xl font-bold tracking-tight">Privacy policy</h1>
  <p className="mt-2 text-sm text-ink-mute">Last updated October 2026. This page will be replaced with a reviewed policy before any commercial launch.</p>
  <div className="mt-8 space-y-6 leading-relaxed text-ink-soft">
    <section><h2 className="text-lg font-semibold text-ink">Checking a website</h2>
      <p className="mt-2">When you submit a website address, our server visits that public website (and a limited set of pages and links on the same site) to produce your report. The website being checked receives ordinary visit requests identifying as <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs">ClyvroBot</code>; we never send it your details, and we never fill in or submit its forms. A free check without an account is shown to you and not saved to any account. Like most services, we keep brief technical records to run the service securely, limit misuse, and keep things fair for everyone.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">Your account</h2>
      <p className="mt-2">If you create an account, we store your name, email address, and a securely scrambled (hashed) version of your password — never the password itself. We also store what you save: your websites, clients, reports, and team invitations. If you create a shared report link, anyone who has that link can view that report until you switch the link off. Teammates you invite can see the workspaces they&apos;re invited to, according to the role you give them.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">Stored in your browser</h2>
      <p className="mt-2">We keep a few basics on your device: your light/dark theme choice, a cookie that keeps you signed in, and the workspace you&apos;ve most recently opened. If you join the waitlist, we store the email and role you entered so we can send your invite, and we email you a confirmation. There are no analytics trackers or advertising cookies on this site.</p></section>
    <section><h2 className="text-lg font-semibold text-ink">What we don&apos;t do</h2>
      <p className="mt-2">We don&apos;t sell personal data, and we don&apos;t share your reports with anyone except through links you create yourself. A fuller policy — covering data processors, retention periods, and your rights — will be published before any commercial launch.</p></section>
  </div></div>); }

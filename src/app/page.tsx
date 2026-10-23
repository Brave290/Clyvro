import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileSearch, ShieldCheck, Gauge, ListChecks, FlaskConical, ShoppingCart, MailWarning, SearchX, BadgeAlert, MegaphoneOff, UsersRound, Store, Briefcase, Laptop, ArrowLeftRight } from "lucide-react";
import Reveal from "@/components/Reveal";
import HeroScanForm from "@/components/HeroScanForm";
import PublicStats from "@/components/PublicStats";
import PricingSection from "@/components/PricingPlans";
import AuthCta from "@/components/AuthCta";

const PILLARS = [
  { Icon: FileSearch, t: "We show you, not just tell you", d: "Every problem comes with a screenshot of where we saw it — the broken link, the missing button, the exact page. If we can't show it, we don't say it." },
  { Icon: FlaskConical, t: "We say when we're guessing", d: "A broken link is a fact. 'Your homepage is confusing' is an opinion. We always tell you which is which — so you never fix the wrong thing." },
  { Icon: ListChecks, t: "You get a to-do list, not a scary report", d: "Every issue is sorted by how badly it hurts your sales, with fixes written so you (or your web person) can do it today." },
];

const LOSSES = [
  { Icon: ShoppingCart, t: "Lost sales you never knew about", d: "A customer was ready to pay — but the 'Buy' button didn't work on their phone, or the checkout link was broken. They didn't call to complain. They just left and bought from someone else." },
  { Icon: MailWarning, t: "Enquiries that never arrived", d: "Someone filled your contact form and hit Send — but it goes nowhere. They think you ignored them. You think no one contacted you. That lead is gone." },
  { Icon: SearchX, t: "Google can't find you", d: "If your page title is blank or your description is missing, Google shows a random mess — or skips you entirely. Customers searching for exactly what you sell find your competitor instead." },
  { Icon: BadgeAlert, t: "People don't trust what looks broken", d: "A link that says '404', a photo that doesn't load, a page that's a mess on mobile — visitors decide in 5 seconds if you're professional. A broken site feels risky. They back out." },
  { Icon: MegaphoneOff, t: "Ad money poured down the drain", d: "You paid for Instagram or Google ads to send people to your site — but the page they landed on had no clear 'Book now' or 'Buy' button. You paid for the click, got no sale." },
  { Icon: UsersRound, t: "Slowly losing to the shop next door", d: "It's rarely one big disaster. It's five small paper cuts that, week after week, send your customers to the business whose website just works." },
];

const HUMAN_CHECKS = [
  "Links and buttons that lead to 'Page not found' — we click every link ourselves",
  "Contact / booking forms that go nowhere (we never submit your forms, just check where they lead)",
  "Pages that tell Google nothing — so Google shows nothing and customers never find you",
  "Pages with no clear next step: visitor reads it and has no idea what to do next",
  "Photos with no description (so blind customers using screen readers hear nothing)",
  "Forms asking for phone numbers or cards without a secure connection",
  "Your site on a phone: tiny buttons you can't tap, text running off the screen, menus that won't open",
  "Titles that repeat, links with no words, forgotten files that tell hackers where to look — and gaps that make AI search skip you",
];

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Clyvro",
  url: "https://clyvro.vercel.app",
  description:
    "Clyvro checks your website the way a real customer would — every link, every form, every page on a phone — and tells you in plain words what's broken and how to fix it.",
};

export default function Home() {
  return (<>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }} />
    {/* HERO */}
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(640px_320px_at_18%_-6%,rgba(37,99,235,0.13),transparent_65%),radial-gradient(520px_260px_at_92%_8%,rgba(37,99,235,0.08),transparent_60%)]" />
      <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-16 sm:pt-24">
        <div className="max-w-3xl">
          <p className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft" role="status">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
            Trusted by shops, freelancers & agencies — first check free
          </p>
          <h1 className="animate-fade-up mt-5 text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">Is your website <br /><span className="text-accent">quietly losing</span> you customers?</h1>
          <p style={{ animationDelay: "90ms" }} className="animate-fade-up mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">
            Broken links, lost enquiries, and unclear pages cost trust. <strong className="text-ink">Clyvro checks your site like a real customer</strong> and gives you clear fixes.
          </p>
          <p style={{ animationDelay: "120ms" }} className="animate-fade-up mt-3 max-w-2xl text-sm leading-relaxed text-ink-mute">
            No hype or fake loss estimates — just evidence, page by page. Built with an AI website builder? Check what it missed.
          </p>

          <div style={{ animationDelay: "180ms" }} className="animate-fade-up mt-8 max-w-2xl">
            <HeroScanForm />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <AuthCta
                guestHref="/sign-up"
                guest={<>Create a free account <ArrowRight size={16} aria-hidden /></>}
                signedHref="/app/scan"
                signed={<>Open dashboard <ArrowRight size={16} aria-hidden /></>}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover hover:shadow-md"
              />
              <span className="text-xs text-ink-mute">Save reports, compare changes, and share findings.</span>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-mute">
              <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-good" aria-hidden /> First check is free — no account needed</span>
              <span>10 free checks every month</span>
              <span><Link href="/pricing" className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline">Plans from $19/month</Link></span>
              <span>Only check sites you own or have permission to check</span>
              <Link href="/how-it-works" className="inline-flex min-h-8 items-center font-semibold text-accent hover:underline">How it works</Link>
            </p>
          </div>
        </div>

        <Reveal className="mt-12">
          <PublicStats />
        </Reveal>
      </div>
    </section>

    {/* WHAT IS IT — SIMPLE */}
    <section className="border-y border-line bg-surface"><div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-3">
      {PILLARS.map(({ Icon, t, d }, i) => (<Reveal key={t} delay={i * 120}><div className="group"><span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-deep transition duration-300 group-hover:bg-accent group-hover:text-white"><Icon size={20} aria-hidden /></span>
        <h2 className="mt-4 text-lg font-semibold">{t}</h2><p className="mt-2 leading-relaxed text-ink-soft">{d}</p></div></Reveal>))}
    </div></section>

    {/* WHAT YOU LOSE WITHOUT IT */}
    <section className="mx-auto max-w-6xl px-5 py-16">
      <Reveal>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">The cost of not checking</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">What a broken website is already costing you</h2>
          <p className="mt-4 leading-relaxed text-ink-soft">It's not that customers complain. It's that they silently leave — and you never find out why. Here's what business owners tell us they lost before they started checking.</p>
        </div>
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {LOSSES.map(({ Icon, t, d }, i) => (
          <Reveal key={t} delay={i * 80}>
            <div className="group h-full rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition duration-200 hover:border-bad/20 hover:shadow-md">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-bad-soft text-bad transition duration-300 group-hover:bg-bad group-hover:text-white"><Icon size={18} aria-hidden /></span>
              <h3 className="mt-4 font-semibold leading-snug">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{d}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal>
        <p className="mx-auto mt-8 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm leading-relaxed text-amber-900">One owner told us: "I spent ₦80,000 on ads that sent people to a booking page whose form was broken for 2 months. Nobody told me."</p>
      </Reveal>
    </section>

    {/* BEFORE / AFTER — CASE STUDY */}
    <section className="border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">A real story</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Before Clyvro vs After Clyvro</h2>
            <p className="mt-3 leading-relaxed text-ink-soft">An illustrative example based on common findings — names changed, patterns real. This is what "check, fix, re-check" looks like for a typical small business.</p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-3xl border border-bad/20 bg-bad-soft/40 p-6 sm:p-7">
              <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-bad"><span className="h-2 w-2 rounded-full bg-bad" aria-hidden /> Before — Mama T's Cakes, Lagos</div>
              <p className="mt-2 text-sm italic leading-relaxed text-ink-soft">"I thought my site was fine. My cousin built it quickly." — Titi, bakery owner, takes orders on WhatsApp & website.</p>
              <ul className="mt-5 space-y-3 text-sm leading-relaxed">
                <li className="flex gap-2.5"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-bad" aria-hidden /><span><strong className="text-ink">Contact form went nowhere.</strong> Customers hit "Send" and got a blank page. She thought people weren't interested — actually 8 enquiries a week were vanishing.</span></li>
                <li className="flex gap-2.5"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-bad" aria-hidden /><span><strong className="text-ink">"Order on WhatsApp" button hidden on phones.</strong> 70% of her customers are on phones. The button was cut off the screen. They couldn't tap it.</span></li>
                <li className="flex gap-2.5"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-bad" aria-hidden /><span><strong className="text-ink">Google showed "Untitled" for her best cake.</strong> No page title, no description — so Google showed a random line and people skipped her.</span></li>
                <li className="flex gap-2.5"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-bad" aria-hidden /><span><strong className="text-ink">Instagram link was broken.</strong> The menu linked to instagram.com/mamatcakes (404). Her 2,000 followers couldn't get there from the site.</span></li>
              </ul>
              <div className="mt-6 rounded-xl bg-surface px-4 py-3 text-sm"><span className="font-semibold">Result:</span> Enquiries felt "slow for months", ad clicks wasted, customers told friends "the link doesn't work".</div>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="h-full rounded-3xl border border-good/20 bg-good-soft/60 p-6 sm:p-7">
              <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-good"><span className="h-2 w-2 rounded-full bg-good" aria-hidden /> After — same shop, 1 afternoon of fixes</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">Titi pasted her link into Clyvro (free, 2 minutes). Clyvro showed her each problem on the exact page with the fix in plain words. Her web person fixed 4 things that afternoon. She re-checked.</p>
              <ul className="mt-5 space-y-3 text-sm leading-relaxed">
                <li className="flex gap-2.5"><span className="mt-0.5 shrink-0 text-good" aria-hidden>✓</span><span><strong className="text-ink">Form now goes to her email.</strong> Next day: 3 new cake enquiries that would have been lost — now in her inbox.</span></li>
                <li className="flex gap-2.5"><span className="mt-0.5 shrink-0 text-good" aria-hidden>✓</span><span><strong className="text-ink">WhatsApp button fixed on phones.</strong> Customers can tap it with a thumb. "It was just a padding fix."</span></li>
                <li className="flex gap-2.5"><span className="mt-0.5 shrink-0 text-good" aria-hidden>✓</span><span><strong className="text-ink">Google listing now reads "Custom Cakes in Yaba — Order Today | Mama T's".</strong> Click-throughs from search went up.</span></li>
                <li className="flex gap-2.5"><span className="mt-0.5 shrink-0 text-good" aria-hidden>✓</span><span><strong className="text-ink">Instagram link corrected.</strong> Followers flow from site to social again.</span></li>
              </ul>
              <div className="mt-6 rounded-xl bg-surface px-4 py-3 text-sm"><span className="font-semibold">Clyvro score:</span> 61 → 92. Next check scheduled weekly — if something breaks again, she'll get an email. No more silent losses.</div>
            </div>
          </Reveal>
        </div>

        <Reveal>
          <div className="mx-auto mt-8 flex max-w-3xl items-start gap-2 rounded-xl border border-line bg-canvas px-4 py-3 text-xs leading-relaxed text-ink-mute">
            <span className="mt-0.5 shrink-0 text-accent">ⓘ</span>
            <span>Illustrative case study — names and shop are fictional, but every problem above is a real pattern Clyvro finds multiple times a week. Your report will show your site's real problems, on your real pages.</span>
          </div>
          <div className="mt-6 text-center">
            <Link href="/scan" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">See what Clyvro would find on your site <ArrowRight size={16} aria-hidden /></Link>
          </div>
        </Reveal>
      </div>
    </section>

    {/* WHO USES IT & WHAT FOR */}
    <section className="mx-auto max-w-6xl px-5 py-16">
      <Reveal>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Who it’s for</h2>
          <p className="mt-3 leading-relaxed text-ink-soft">For owners, freelancers, agencies, and anyone responsible for a website. Automatic checks, clear fixes.</p>
        </div>
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <Reveal>
          <div className="h-full rounded-2xl border border-line bg-surface p-6 transition hover:shadow-md">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-deep"><Store size={20} aria-hidden /></span>
            <h3 className="mt-4 font-semibold">Shop owners & small businesses</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">You built a site to get orders, bookings, or calls. Use Clyvro to make sure the "Buy", "Book", "Call" and "WhatsApp" buttons actually work — especially on phones, where most customers are.</p>
            <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-ink-mute">Use it: before you run ads, after you build or update your site, every Monday before the week starts.</p>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <div className="h-full rounded-2xl border border-line bg-surface p-6 transition hover:shadow-md">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-deep"><Briefcase size={20} aria-hidden /></span>
            <h3 className="mt-4 font-semibold">Freelancers & agencies</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">Stop clicking every page by hand before a client call. Add your clients, check their sites in minutes, invite your team, and send the client a clean report link they can understand — with your name on it.</p>
            <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-ink-mute">Use it: client handover checks, monthly retainer proof, "we fixed this" re-checks that prove the work worked.</p>
          </div>
        </Reveal>
        <Reveal delay={160}>
          <div className="h-full rounded-2xl border border-line bg-surface p-6 transition hover:shadow-md">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-deep"><Laptop size={20} aria-hidden /></span>
            <h3 className="mt-4 font-semibold">Anyone who used an AI builder</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">AI builders are fast — but they leave broken links, missing page info, and blind spots for Google. Clyvro catches what the AI missed while fixing is still cheap, before customers see it.</p>
            <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-ink-mute">Use it: right after the AI says "done", before you share the link, before you pay for ads.</p>
          </div>
        </Reveal>
      </div>
    </section>

    {/* WHAT WE CHECK — HUMAN */}
    <section className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2 md:items-start">
        <Reveal>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">What we check</h2>
            <p className="mt-4 leading-relaxed text-ink-soft">Clear checks, useful evidence, and fixes you can act on.</p>
            <ul className="mt-6 grid gap-y-2.5">{HUMAN_CHECKS.map(c => <li key={c} className="flex items-start gap-2.5 text-sm leading-relaxed"><Gauge size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden /><span>{c}</span></li>)}</ul>
            <Link href="/scan" className="mt-7 inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">Try it on your site — free <ArrowRight size={16} aria-hidden /></Link>
          </div>
        </Reveal>
        <Reveal delay={140}>
          <div className="rounded-3xl border border-line bg-canvas p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
            <h3 className="font-semibold">What Clyvro will never do</h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-soft">
              <li>✕ &nbsp;Make up a number like "you're losing $5,000 a month" — we don't know your sales, and we won't pretend.</li>
              <li>✕ &nbsp;Speak in tech code without explaining it.</li>
              <li>✕ &nbsp;Invent fake reviews, fake logos, or fake "10,000 happy customers." (That's why you don't see them here.)</li>
              <li>✓ &nbsp;<span className="text-ink">We show what we saw, on which page, and how to fix it — every time. If it's our opinion, we label it "opinion". If it's a fact, we label it "fact".</span></li>
            </ul>
            <div className="mt-6 rounded-xl bg-surface p-4 text-sm leading-relaxed text-ink-mute">
              <strong className="text-ink">58 checks behind the scenes — every finding includes proof you can verify.</strong>
            </div>
          </div>
        </Reveal>
      </div>
    </section>

    {/* BEFORE/AFTER MINI STRIP */}
    <section className="mx-auto max-w-6xl px-5 py-12">
      <Reveal>
        <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="flex items-center justify-center gap-2 text-center text-xl font-bold"><ArrowLeftRight size={18} className="text-accent" aria-hidden /> Life with Clyvro vs life without it</h2>
          <div className="mt-6 grid gap-4 text-sm leading-relaxed md:grid-cols-2">
            <div className="rounded-2xl bg-bad-soft/50 p-5">
              <h3 className="font-semibold text-bad">Without a checker</h3>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-ink-soft">
                <li>You find out something's broken because a customer (or your boss) tells you — embarrassed.</li>
                <li>You pay for ads that send people to pages that don't work.</li>
                <li>Google quietly pushes you down, and you assume "SEO is just hard".</li>
                <li>Every fix is a guess: "maybe this will help?"</li>
              </ul>
            </div>
            <div className="rounded-2xl bg-good-soft p-5">
              <h3 className="font-semibold text-good">With Clyvro</h3>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-ink-soft">
                <li>You find out first — in 2 minutes, in plain words, before customers do.</li>
                <li>You fix what actually loses sales, not what "looks nice to redesign".</li>
                <li>You re-check after fixing and see "fixed ✓" — proof for your client or yourself.</li>
                <li>You schedule a weekly auto-check — if something breaks, you get an email. No surprises.</li>
              </ul>
            </div>
          </div>
        </div>
      </Reveal>
    </section>

    <section className="scroll-mt-20 border-t border-line bg-surface"><div className="mx-auto max-w-3xl px-5 py-16 text-center">
      <Reveal>
        <h2 className="text-3xl font-bold tracking-tight">Want Clyvro to watch your site for you?</h2>
        <p className="mt-3 leading-relaxed text-ink-soft">Clyvro is live. Create a free account to save every check, see what changed since last time, and share report links your clients will actually read. Upgrade from Billing when it earns its keep — no waitlist.</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <AuthCta guestHref="/sign-up" guest="Create a free account" className="button-primary" />
          <Link href="/pricing" className="button-secondary">See pricing</Link>
        </div>
      </Reveal></div></section>

    <PricingSection />
  </>);
}

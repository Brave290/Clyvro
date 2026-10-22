import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How we keep your data safe",
  description: "How Clyvro protects your website checks and your account — and how to tell us if you spot a problem.",
  alternates: { canonical: "/security" },
};

const CONTACT = process.env.SECURITY_CONTACT_EMAIL || "admin.founda@gmail.com";

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="animate-fade-up text-4xl font-bold tracking-tight">How we keep you safe</h1>
      <p style={{ animationDelay: "90ms" }} className="animate-fade-up mt-4 leading-relaxed text-ink-soft">
        We check other people's websites for a living — so we take your safety seriously. Here's what we do behind the scenes to protect your account and your checks, in words anyone can understand.
      </p>

      <section className="mt-10 space-y-3 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">What protects you when you use Clyvro</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong className="text-ink">A guard at the door</strong> — every click on Clyvro passes our safety filter first. If someone tries common hacking tricks or pretends to be a robot army, they're blocked automatically. Repeat offenders are locked out for a while; guessing passwords gets you locked out faster.</li>
          <li><strong className="text-ink">We don't keep your address</strong> — when our guard notes an attack, it saves a scrambled version of the address, not the real one, and deletes it after 7 days. We couldn't hand it out even if asked.</li>
          <li><strong className="text-ink">We only visit public sites</strong> — when you ask us to check a website, we double-check it's a normal public site and not a private office computer. We never go where we shouldn't, and we say who we are honestly.</li>
          <li><strong className="text-ink">Locks on your account</strong> — your password is scrambled beyond recovery, your login stays in a locked cookie, and your connection is always encrypted (the little padlock in your browser).</li>
          <li><strong className="text-ink">We keep as little as possible</strong> — checks save what we found and where, not full copies of your site. Backups are locked by the storage company and only the founder can restore them.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-3 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">Found a problem in Clyvro? Tell us</h2>
        <p>If you think you've found a weak spot, email <a className="font-semibold text-accent hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> with what you did and what happened. We read every report, reply within 3 working days, and credit you if you want credit once we fix it. Please give us a little time to fix it before telling the world.</p>
        <p>Please don't run attack tools or try to overload clyvro.vercel.app to prove a point — our guard will block you, and it's not needed. Just show us what you found on your own account.</p>
        <p>The technical details machines read are at <a className="font-semibold text-accent hover:underline" href="/.well-known/security.txt">/.well-known/security.txt</a>.</p>
      </section>

      <section className="mt-10 space-y-3 text-sm leading-relaxed text-ink-soft">
        <h2 className="text-xl font-bold text-ink">Were you blocked by mistake?</h2>
        <p>Blocks lift themselves — after 15 minutes to a day, depending on what happened. If you keep seeing "Request blocked" while using Clyvro normally, send us the time and what page you were on at the address above. We'll clear it and teach our guard to be smarter.</p>
      </section>
    </div>
  );
}

"use client";
import Link from "next/link";
import { Bot, GitPullRequestArrow, ScanSearch, ShieldHalf } from "lucide-react";

/**
 * Code Reviewer (Coming Soon): a GitHub bot that reviews pull requests
 * for vulnerabilities and risky changes. Honest placeholder — the bot
 * is not installable yet, so there is deliberately no fake install
 * button; meanwhile the working scanners are one click away.
 */
export default function CodeReviewerPage() {
  return (
    <div className="mt-8">
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          Code Reviewer
          <span className="rounded-full bg-ink-mute px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Coming soon</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          A GitHub app you install on your repositories. It reviews every pull request for vulnerabilities,
          leaked secrets, unsafe patterns and risky dependency changes — and comments with evidence and a
          suggested fix, in the same evidence-first style as Clyvro&apos;s website scanner.
        </p>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { Icon: GitPullRequestArrow, title: "Pull-request reviews", body: "Checks each PR diff for injection risks, auth mistakes, exposed secrets and unsafe configuration before they merge." },
          { Icon: Bot, title: "Evidence, not noise", body: "Every comment quotes the exact lines and explains the risk and the fix — no generic warnings you learn to ignore." },
          { Icon: ShieldHalf, title: "Your code stays yours", body: "Reviews run on the diff only; nothing is trained on or retained beyond the review itself." },
        ].map(({ Icon, title, body }) => (
          <div key={title} className="rounded-2xl border border-line bg-surface p-5">
            <Icon size={20} className="text-accent" aria-hidden />
            <h2 className="mt-3 font-semibold">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{body}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">Not installable yet — here&apos;s what works today</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Code Reviewer is still in development, so there&apos;s no install button to click. While you wait,
          the website side is live: run a full website scan or the new Hack Protection check on your
          production site.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/app/scan" className="button-primary"><ScanSearch size={15} aria-hidden /> Scan a website</Link>
          <Link href="/app/hack-protection" className="button-secondary"><ShieldHalf size={15} aria-hidden /> Try Hack Protection (Beta)</Link>
        </div>
      </div>
    </div>
  );
}

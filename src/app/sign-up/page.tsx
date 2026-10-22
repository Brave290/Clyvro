import type { Metadata } from "next";
import SignUpClient from "./SignUpClient";

const PLAN_META: Record<string, { title: string; description: string }> = {
  basic: {
    title: "Create a Starter account",
    description: "Create a free Clyvro account aimed at the Starter plan. Try it on your real site first, then upgrade inside if it earns its keep.",
  },
  pro: {
    title: "Create a Pro account",
    description: "Create a free Clyvro account aimed at the Pro plan. Freelancers start free, then upgrade inside when they're ready.",
  },
  "ultra-agency": {
    title: "Create an Agency account",
    description: "Create a free Clyvro account aimed at the Agency plan. Agencies start free, then upgrade inside for client sites and white-label reports.",
  },
};

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ plan?: string }> },
): Promise<Metadata> {
  const { plan } = await searchParams;
  const extra = plan ? PLAN_META[plan] : undefined;
  return {
    title: extra?.title ?? "Create your free account",
    description: extra?.description
      ?? "Create a free Clyvro account to save website scans, compare results over time and share evidence-backed reports with clients.",
    alternates: { canonical: "/sign-up" },
  };
}

export default function SignUpPage() {
  return <SignUpClient />;
}

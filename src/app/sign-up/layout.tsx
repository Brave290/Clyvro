import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create your free account",
  description: "Create a free Clyvro account to save website scans, compare results over time and share evidence-backed reports with clients.",
  alternates: { canonical: "/sign-up" },
};

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return children;
}

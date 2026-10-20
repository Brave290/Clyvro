import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free website check",
  description: "Check any public website free: broken links, missing titles and descriptions, accessibility basics and unsafe forms — with evidence for every finding.",
  alternates: { canonical: "/scan" },
};

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return children;
}

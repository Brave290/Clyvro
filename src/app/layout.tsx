import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav"; import Footer from "@/components/Footer";
export const metadata: Metadata = {
  title: { default: "Clyvro — Find the friction. Fix the conversion.", template: "%s · Clyvro" },
  description: "Evidence-first website audits for agencies, freelancers and consultants. Verifiable findings, clear evidence, prioritised fixes — no invented revenue claims.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className="font-sans">
    <Nav /><main>{children}</main><Footer /></body></html>);
}

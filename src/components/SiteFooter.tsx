"use client";

import { usePathname } from "next/navigation";
import Footer from "@/components/Footer";

const FOOTERLESS_ROUTES = new Set(["/sign-in", "/sign-up", "/forgot-password", "/reset-password"]);

export default function SiteFooter() {
  const pathname = usePathname() ?? "/";
  const isPrivateAppRoute = pathname === "/app" || pathname.startsWith("/app/");

  if (isPrivateAppRoute || FOOTERLESS_ROUTES.has(pathname)) return null;
  return <Footer />;
}

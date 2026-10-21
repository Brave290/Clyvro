"use client";

import { usePathname } from "next/navigation";
import Footer from "@/components/Footer";

const FOOTERLESS_ROUTES = new Set(["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/emergency"]);

export default function SiteFooter() {
  const pathname = usePathname() ?? "/";
  const isPrivateAppRoute = pathname === "/app" || pathname.startsWith("/app/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isPrivateAppRoute || isAdminRoute || FOOTERLESS_ROUTES.has(pathname)) return null;
  return <Footer />;
}

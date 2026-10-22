import type { Metadata } from "next";
import { mailConfigured } from "@/lib/mail";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset your password",
  description:
    "Enter your email and we will send a one-time link to set a new Clyvro password — valid for one hour. The link is sent whether or not an account exists, to protect privacy.",
  alternates: { canonical: "/forgot-password" },
};

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  // Honest config banner: reveals whether mail can send at all — never
  // whether a given account exists (that's the API's generic answer).
  return <ForgotPasswordForm mailReady={mailConfigured()} />;
}

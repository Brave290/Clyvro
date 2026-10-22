import type { Metadata } from "next";
import SignInClient from "./SignInClient";

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ callbackUrl?: string; registered?: string; reset?: string }> },
): Promise<Metadata> {
  const { callbackUrl, registered, reset } = await searchParams;
  const toAdmin = !!callbackUrl && (callbackUrl === "/admin" || callbackUrl.startsWith("/admin/"));
  if (toAdmin) {
    return {
      title: "Sign in to the admin desk",
      description: "Sign in to Clyvro's admin desk. Same account as the main sign-in page; after you log in we take you to admin.",
      alternates: { canonical: "/sign-in" },
      robots: { index: false, follow: false },
    };
  }
  if (registered === "1") {
    return {
      title: "Account created — sign in",
      description: "Your Clyvro account is ready. Sign in with the email and password you just created to run your first saved scan.",
      alternates: { canonical: "/sign-in" },
    };
  }
  if (reset === "1") {
    return {
      title: "Password updated — sign in",
      description: "Your Clyvro password was updated. Sign in with your new password to get back to your workspace.",
      alternates: { canonical: "/sign-in" },
    };
  }
  return {
    title: "Sign in",
    description: "Sign in to your Clyvro workspace to run saved scans, track fixes and share client-ready reports.",
    alternates: { canonical: "/sign-in" },
  };
}

export default function SignInPage() {
  return <SignInClient />;
}

"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";

export function useSignedIn(): boolean {
  const { data, status } = useSession();
  return status === "authenticated" && Boolean(data?.user?.id);
}

/**
 * Guest vs signed-in link. Session cookie already persists; this only
 * swaps the label/destination so public pages stop pretending you're logged out.
 */
export default function AuthCta({
  guestHref,
  guest,
  signedHref = "/app/scan",
  signed = "Open dashboard",
  className,
  ariaLabel,
  onClick,
}: {
  guestHref: string;
  guest: ReactNode;
  signedHref?: string;
  signed?: ReactNode;
  className?: string;
  ariaLabel?: string;
  onClick?: () => void;
}) {
  const signedIn = useSignedIn();
  return (
    <Link
      href={signedIn ? signedHref : guestHref}
      className={className}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {signedIn ? signed : guest}
    </Link>
  );
}

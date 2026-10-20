/** Branded skeleton loaders — used instead of bare "Loading…" text. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-line/60 ${className}`} />;
}

export function SkeletonRows({ rows = 3, className = "h-16" }: { rows?: number; className?: string }) {
  return (
    <div aria-busy="true" role="status" aria-label="Loading" className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className={className} />)}
    </div>
  );
}

/** Full dashboard-page skeleton (header + cards + panel). */
export function PageSkeleton() {
  return (
    <div className="mt-8" aria-busy="true" role="status" aria-label="Loading page">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="mt-6 h-64" />
    </div>
  );
}

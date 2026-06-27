export default function Skeleton({ className = '' }) {
  return <div className={`shimmer-bg animate-shimmer rounded-xl ${className}`} style={{ background: 'var(--bg-tertiary)' }} />
}

export function LinkSkeleton() {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  )
}

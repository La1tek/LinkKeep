export function LinkSkeleton() {
  return (
    <div className="glass rounded-2xl p-4 overflow-hidden relative">
      <div className="shimmer absolute inset-0" />
      <div className="flex items-start gap-3 relative">
        <div className="h-10 w-10 rounded-xl shimmer-block" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 rounded shimmer-block w-3/4" />
          <div className="h-2.5 rounded shimmer-block w-full" />
          <div className="h-2.5 rounded shimmer-block w-1/2" />
        </div>
        <div className="h-7 w-7 rounded-lg shimmer-block" />
      </div>
    </div>
  )
}

export function TabSkeleton() {
  return (
    <div className="h-8 w-24 rounded-full shimmer-block" />
  )
}

import { StackSimple, Plus } from '@phosphor-icons/react'

export function LinkSkeleton({ index = 0 }) {
  return (
    <div className="glass rounded-2xl p-4 overflow-hidden relative skeleton-stagger" style={{ animationDelay: `${index * 100}ms` }}>
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

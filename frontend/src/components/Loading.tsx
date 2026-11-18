import { useEffect, useState } from 'react'
import { onNetworkActivity } from '../api/client'

// Shared loading indicators, so every page shows the same thing while it waits.

/** Small spinning circle in the current text colour (works on navy and white buttons). */
export function Spinner({ size = 14 }: { size?: number }) {
  return <span className="ld-spinner" style={{ width: size, height: size }} aria-hidden="true" />
}

/** Shimmering grey bar standing in for text or a number that is still loading. */
export function Skeleton({ width, height = 14 }: { width: number | string; height?: number }) {
  return <span className="vx-skel" style={{ width, height }} aria-hidden="true" />
}

/** A spinner with a short message, e.g. "Loading jobs…". */
export function LoadingNote({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`ld-note ${className}`.trim()} role="status">
      <Spinner />
      <span>{children}</span>
    </p>
  )
}

/** Placeholder rows shaped like a table, shown before a list arrives. */
export function SkeletonTable({ rows = 5, columns = 6, label }: { rows?: number; columns?: number; label: string }) {
  const widths = ['40%', '70%', '55%', '85%', '60%', '45%', '75%', '50%']
  return (
    <div className="ld-table" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="ld-table-head">
        {Array.from({ length: columns }, (_, i) => <Skeleton key={i} width={i === 0 ? 36 : '60%'} height={12} />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="ld-table-row" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, c) => <Skeleton key={c} width={c === 0 ? 20 : widths[(r + c) % widths.length]} height={13} />)}
        </div>
      ))}
    </div>
  )
}

/** Placeholder cards (two lines each), shown before a list of cards arrives. */
export function SkeletonCards({ count = 3, label }: { count?: number; label: string }) {
  return (
    <div className="ld-cards" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="vx-skel-row">
          <Skeleton width={i % 2 ? '45%' : '58%'} height={16} />
          <Skeleton width={i % 2 ? '30%' : '38%'} height={12} />
        </div>
      ))}
    </div>
  )
}

/** Thin moving bar at the very top of the window whenever the app is waiting for the server. */
export function TopLoadingBar() {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let timer = 0
    const unsubscribe = onNetworkActivity((count) => {
      window.clearTimeout(timer)
      // wait a moment before showing it, so very fast requests do not flicker
      if (count > 0) timer = window.setTimeout(() => setBusy(true), 150)
      else setBusy(false)
    })
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [])
  if (!busy) return null
  return (
    <div className="ld-topbar" role="progressbar" aria-label="Loading">
      <span />
    </div>
  )
}

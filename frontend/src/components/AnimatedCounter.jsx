import { useState, useEffect, useRef } from 'react'

export default function AnimatedCounter({ value, duration = 300 }) {
  const [display, setDisplay] = useState(value)
  const startRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    const from = startRef.current ?? value
    startRef.current = value

    if (from === value) return

    const startTime = performance.now()
    const diff = value - from

    const tick = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(from + diff * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, duration])

  return <>{display}</>
}

import { useEffect, useRef } from 'react'

// Glass light for buttons: when the mouse is over a button (or a menu link), one faint light spot
// is laid exactly over it and follows the cursor, like light moving across glass. Hidden while pressing.
// It is purely visual: it never takes clicks (pointer-events: none) and does nothing on touch screens.

// text-style buttons (links such as "Edit" or "Forgot password?") are left plain
// the dashboard's number boxes (Your Jobs, Active, …) are left plain too
const TARGETS = 'button:not(:disabled):not([class*="link"]):not(.vx-kpi), .sidebar nav a, .help-button, .fb-fab'

export function GlassHover() {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const light = ref.current
    if (!light || window.matchMedia?.('(hover: none)').matches) return
    let current: HTMLElement | null = null
    let frame = 0

    const place = (x: number, y: number) => {
      if (!current) return
      const r = current.getBoundingClientRect()
      const style = getComputedStyle(current)
      light.style.transform = `translate(${r.left}px, ${r.top}px)`
      light.style.width = `${r.width}px`
      light.style.height = `${r.height}px`
      light.style.borderRadius = style.borderRadius
      light.style.setProperty('--gx', `${x - r.left}px`)
      light.style.setProperty('--gy', `${y - r.top}px`)
    }
    const hide = () => {
      current = null
      light.classList.remove('gh-on')
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const target = (event.target as Element | null)?.closest?.(TARGETS) as HTMLElement | null
      if (target !== current) current = target
      light.classList.toggle('gh-on', Boolean(target) && event.buttons === 0)
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => place(event.clientX, event.clientY))
    }

    // no light while pressing, so a click never "pops"
    const onDown = () => light.classList.remove('gh-on')
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerdown', onDown, { passive: true })
    document.addEventListener('pointerleave', hide)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerleave', hide)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  return <div ref={ref} className="gh-light" aria-hidden="true" />
}

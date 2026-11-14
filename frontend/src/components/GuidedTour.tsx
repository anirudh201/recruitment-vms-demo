import { useEffect, useRef, useState } from 'react'
import type { TourPage, TourStep } from '../tourSteps'

type Box = { top: number; left: number; width: number; height: number }
const PAD = 8
const TIP_WIDTH = 360

function visibleBox(element: Element): Box {
  const r = element.getBoundingClientRect()
  const top = Math.max(r.top - PAD, 6)
  const left = Math.max(r.left - PAD, 6)
  const bottom = Math.min(r.bottom + PAD, window.innerHeight - 6)
  const right = Math.min(r.right + PAD, window.innerWidth - 6)
  return { top, left, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) }
}

// Where the explanation card goes: below, above, right, left of the part, or in the corner if the part fills the screen.
function placeTip(box: Box | null, tipHeight: number): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(TIP_WIDTH, vw - 24)
  const clampX = (x: number) => Math.min(Math.max(x, 12), vw - width - 12)
  const clampY = (y: number) => Math.min(Math.max(y, 12), vh - tipHeight - 12)
  if (!box) return { top: clampY(vh - tipHeight - 32), left: clampX((vw - width) / 2) }
  const gap = 14
  if (vh - (box.top + box.height) >= tipHeight + gap + 12) return { top: box.top + box.height + gap, left: clampX(box.left) }
  if (box.top >= tipHeight + gap + 12) return { top: box.top - tipHeight - gap, left: clampX(box.left) }
  if (vw - (box.left + box.width) >= width + gap + 12) return { top: clampY(box.top), left: box.left + box.width + gap }
  if (box.left >= width + gap + 12) return { top: clampY(box.top), left: box.left - width - gap }
  return { top: clampY(vh - tipHeight - 24), left: clampX(vw - width - 24) }
}

export default function GuidedTour({
  steps,
  currentPage,
  onNavigate,
  onClose,
}: {
  steps: TourStep[]
  currentPage: string
  onNavigate: (page: TourPage) => void
  onClose: () => void
}) {
  const [index, setIndex] = useState(0)
  const [found, setFound] = useState<{ index: number; box: Box | null } | null>(null)
  const [tipHeight, setTipHeight] = useState(230)
  const elementRef = useRef<Element | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const nextRef = useRef<HTMLButtonElement | null>(null)
  const step = steps[index]
  const ready = found?.index === index
  const box = ready ? found.box : null
  const last = index === steps.length - 1

  // go to the step's page, wait for its part to appear, bring it into view, then measure it
  useEffect(() => {
    if (step.page !== currentPage) {
      onNavigate(step.page)
      return
    }
    let cancelled = false
    let tries = 0
    let timer = 0
    const look = () => {
      if (cancelled) return
      const element = document.querySelector(step.target)
      if (element) {
        elementRef.current = element
        const tall = element.getBoundingClientRect().height > window.innerHeight * 0.7
        element.scrollIntoView?.({ block: tall ? 'start' : 'center', inline: 'nearest', behavior: 'smooth' })
        timer = window.setTimeout(() => !cancelled && setFound({ index, box: visibleBox(element) }), 420)
      } else if (tries++ < 40) {
        timer = window.setTimeout(look, 100)   // the page may still be loading
      } else {
        elementRef.current = null
        setFound({ index, box: null })          // not on screen (e.g. no data yet): explain without a spotlight
      }
    }
    timer = window.setTimeout(look, 60)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [index, step.page, step.target, currentPage, onNavigate])

  // keep the spotlight on the part while scrolling or resizing
  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (elementRef.current && elementRef.current.isConnected) setFound({ index, box: visibleBox(elementRef.current) })
      })
    }
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [index])

  // always place the card using its real height (it changes with each step's text)
  useEffect(() => {
    const tip = tipRef.current
    if (!tip || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setTipHeight(tip.offsetHeight))
    observer.observe(tip)
    return () => observer.disconnect()
  }, [])

  // put keyboard focus on Next once the step is shown
  useEffect(() => {
    if (!ready) return
    const frame = requestAnimationFrame(() => nextRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [ready, index])

  const go = (to: number) => {
    if (to < 0) return
    if (to >= steps.length) return onClose()
    elementRef.current = null
    setIndex(to)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (index === steps.length - 1) onClose()
        else {
          elementRef.current = null
          setIndex(index + 1)
        }
      } else if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault()
        elementRef.current = null
        setIndex(index - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, steps.length, onClose])

  const position = placeTip(box, tipHeight)
  return (
    <div className="gt-root">
      {/* blocks clicks on the page while the tour runs */}
      <div className="gt-blocker" aria-hidden="true" />
      {box ? (
        <div className="gt-spot" aria-hidden="true" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
      ) : (
        <div className="gt-dim" aria-hidden="true" />
      )}
      <div
        ref={tipRef}
        className={`gt-tip${ready ? '' : ' gt-tip-waiting'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gt-title"
        aria-describedby="gt-body"
        style={{ top: position.top, left: position.left, width: Math.min(TIP_WIDTH, window.innerWidth - 24) }}
      >
        <p className="gt-section">{step.section} · Step {index + 1} of {steps.length}</p>
        <div className="gt-progress" aria-hidden="true"><span style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
        <h2 id="gt-title" aria-live="polite">{step.title}</h2>
        <p id="gt-body">{step.body}</p>
        {ready && !box && <p className="gt-missing">This part isn’t on screen right now (for example, there is no data yet), so there is nothing to highlight.</p>}
        <div className="gt-actions">
          <button type="button" className="gt-end" onClick={onClose}>End tour</button>
          <span className="gt-nav">
            <button type="button" className="gt-back" disabled={index === 0} onClick={() => go(index - 1)}>Back</button>
            <button type="button" ref={nextRef} className="gt-next" onClick={() => go(index + 1)}>{last ? 'Finish' : 'Next'}</button>
          </span>
        </div>
        <p className="gt-keys">Tip: use ← → keys, Esc to leave.</p>
      </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'

// Interactive background for the light side of the sign-in page (behind the sign-in card).
// A fine grid of dots that reacts to the mouse: dots near the cursor grow, light up in DM&I blue
// and link to it like a network; a soft light follows the cursor, moving leaves a short trail of
// red and cyan sparks, and clicking sends out a ripple. With no mouse, a slow wave keeps it alive.
// Purely decorative: it never takes clicks and stays still for people who ask for reduced motion.

type Spark = { x: number; y: number; vx: number; vy: number; life: number; red: boolean }
type Ripple = { x: number; y: number; age: number }

const GAP = 30          // space between dots
const REACH = 170       // how far from the cursor dots react
const LINK = 105        // dots this close to the cursor link to it

export default function LoginBackdrop() {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    const area = canvas?.parentElement
    if (!canvas || !context || !area) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    let width = 0
    let height = 0
    let frame = 0
    // where the light is (eased towards the mouse) and how strongly it shows (0 = hidden)
    const mouse = { x: -9999, y: -9999, active: false }
    const light = { x: -9999, y: -9999, strength: 0 }
    let sparks: Spark[] = []
    let ripples: Ripple[] = []
    let lastSpark = 0

    const resize = () => {
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      if (still) draw(0)
    }

    const toLocal = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect()
      return { x: event.clientX - box.left, y: event.clientY - box.top }
    }
    const overCard = (event: PointerEvent) => Boolean((event.target as Element | null)?.closest?.('.lp-card'))

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const point = toLocal(event)
      mouse.x = point.x
      mouse.y = point.y
      mouse.active = !overCard(event)
      if (light.strength === 0) { light.x = point.x; light.y = point.y }
      const now = performance.now()
      if (mouse.active && now - lastSpark > 28 && sparks.length < 90) {
        lastSpark = now
        sparks.push({
          x: point.x, y: point.y,
          vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2 - 0.3,
          life: 1, red: Math.random() < 0.3,
        })
      }
    }
    const onLeave = () => { mouse.active = false }
    const onDown = (event: PointerEvent) => {
      if (overCard(event)) return
      const point = toLocal(event)
      ripples.push({ x: point.x, y: point.y, age: 0 })
    }

    function draw(time: number) {
      context!.clearRect(0, 0, width, height)
      // ease the light towards the mouse and fade it in/out
      light.x += (mouse.x - light.x) * 0.18
      light.y += (mouse.y - light.y) * 0.18
      light.strength += ((mouse.active ? 1 : 0) - light.strength) * 0.08
      const s = light.strength

      // soft light under the cursor
      if (s > 0.01) {
        const glow = context!.createRadialGradient(light.x, light.y, 0, light.x, light.y, REACH * 1.4)
        glow.addColorStop(0, `rgba(80, 150, 255, ${0.16 * s})`)
        glow.addColorStop(0.5, `rgba(80, 150, 255, ${0.06 * s})`)
        glow.addColorStop(1, 'rgba(80, 150, 255, 0)')
        context!.fillStyle = glow
        context!.fillRect(light.x - REACH * 1.4, light.y - REACH * 1.4, REACH * 2.8, REACH * 2.8)
      }

      // dot grid: a slow wave everywhere, brighter and bigger near the cursor
      const offset = (GAP / 2)
      for (let x = offset; x < width; x += GAP) {
        for (let y = offset; y < height; y += GAP) {
          const wave = still ? 0 : (Math.sin(x * 0.012 + time / 1400) + Math.cos(y * 0.014 + time / 1700)) * 0.25 + 0.5
          const distance = Math.hypot(x - light.x, y - light.y)
          const near = s * Math.max(0, 1 - distance / REACH)
          // gentle push away from the cursor
          const push = near * 6
          const angle = Math.atan2(y - light.y, x - light.x)
          const px = x + Math.cos(angle) * push
          const py = y + Math.sin(angle) * push
          if (near > 0 && distance < LINK) {
            context!.strokeStyle = `rgba(33, 99, 200, ${0.28 * near})`
            context!.lineWidth = 0.8
            context!.beginPath()
            context!.moveTo(light.x, light.y)
            context!.lineTo(px, py)
            context!.stroke()
          }
          const radius = 1 + wave * 0.5 + near * 2.2
          context!.fillStyle = near > 0.02
            ? `rgba(33, ${Math.round(99 + 90 * near)}, ${Math.round(200 + 40 * near)}, ${0.18 + 0.6 * near})`
            : `rgba(11, 42, 91, ${0.08 + wave * 0.07})`
          context!.beginPath()
          context!.arc(px, py, radius, 0, Math.PI * 2)
          context!.fill()
        }
      }

      // sparks left behind by the cursor
      sparks = sparks.filter((spark) => spark.life > 0)
      for (const spark of sparks) {
        spark.x += spark.vx
        spark.y += spark.vy
        spark.life -= 0.022
        context!.fillStyle = spark.red ? `rgba(230, 40, 60, ${0.7 * spark.life})` : `rgba(20, 190, 230, ${0.8 * spark.life})`
        context!.beginPath()
        context!.arc(spark.x, spark.y, 1.2 + spark.life * 1.6, 0, Math.PI * 2)
        context!.fill()
      }

      // ripples from clicks
      ripples = ripples.filter((ripple) => ripple.age < 1)
      for (const ripple of ripples) {
        ripple.age += 0.018
        context!.strokeStyle = `rgba(33, 99, 200, ${0.45 * (1 - ripple.age)})`
        context!.lineWidth = 2 * (1 - ripple.age) + 0.5
        context!.beginPath()
        context!.arc(ripple.x, ripple.y, 10 + ripple.age * 140, 0, Math.PI * 2)
        context!.stroke()
      }
    }

    const loop = (time: number) => {
      frame = requestAnimationFrame(loop)
      if (!document.hidden && width > 0) draw(time)
    }

    resize()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(canvas)
    if (!still) {
      area.addEventListener('pointermove', onMove, { passive: true })
      area.addEventListener('pointerleave', onLeave)
      area.addEventListener('pointerdown', onDown, { passive: true })
      frame = requestAnimationFrame(loop)
    }
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      area.removeEventListener('pointermove', onMove)
      area.removeEventListener('pointerleave', onLeave)
      area.removeEventListener('pointerdown', onDown)
    }
  }, [])

  return <canvas ref={ref} className="lp-backdrop" aria-hidden="true" />
}

import { useEffect, useRef } from 'react'
import wallpaper from '../assets/login-wallpaper.webp'

// Left side of the sign-in page: the DM&I wallpaper (logo, ribbons and the "Built with heart" badge
// are part of the picture). The two lines of text are real text placed over the picture.
//
// Live effects laid over the picture (all positions are % of the picture, so they stay on their spot):
//   - the logo breathes with a soft glow
//   - HEART. beats: a red glow pulses "lub-dub" like a heartbeat
//   - INTEGRITY. gets a steady cyan shine passing across it
//   - a light runs around the badge, turning from red (heart) to cyan (integrity)
//   - a heartbeat line (ECG) runs along the bottom, red on the left to cyan on the right
//   - small glowing particles drift upwards and link up like a network
// Everything stops for people who ask their system for reduced motion.

type Particle = { x: number; y: number; r: number; speed: number; drift: number; phase: number; red: boolean }

function ParticleField() {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let width = 0
    let height = 0
    let frame = 0
    let particles: Particle[] = []
    const ratio = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const count = Math.round(Math.min(70, (width * height) / 12000))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.6 + Math.random() * 1.8,
        speed: 0.12 + Math.random() * 0.35,
        drift: (Math.random() - 0.5) * 0.25,
        phase: Math.random() * Math.PI * 2,
        red: Math.random() < 0.22,
      }))
    }

    const draw = (time: number) => {
      frame = requestAnimationFrame(draw)
      if (document.hidden || width === 0) return
      context.clearRect(0, 0, width, height)
      for (const p of particles) {
        p.y -= p.speed
        p.x += p.drift
        if (p.y < -10) { p.y = height + 10; p.x = Math.random() * width }
        if (p.x < -10) p.x = width + 10
        if (p.x > width + 10) p.x = -10
      }
      // faint links between nearby particles
      context.lineWidth = 0.6
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i]
          const b = particles[j]
          const distance = Math.hypot(a.x - b.x, a.y - b.y)
          if (distance < 90) {
            context.strokeStyle = `rgba(120, 200, 255, ${0.16 * (1 - distance / 90)})`
            context.beginPath()
            context.moveTo(a.x, a.y)
            context.lineTo(b.x, b.y)
            context.stroke()
          }
        }
      }
      for (const p of particles) {
        const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(time / 900 + p.phase))
        context.fillStyle = p.red ? `rgba(255, 90, 100, ${0.75 * twinkle})` : `rgba(130, 220, 255, ${0.85 * twinkle})`
        context.shadowColor = p.red ? 'rgba(255, 60, 80, .9)' : 'rgba(80, 200, 255, .9)'
        context.shadowBlur = 8
        context.beginPath()
        context.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        context.fill()
      }
      context.shadowBlur = 0
    }

    resize()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(canvas)
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [])

  return <canvas ref={ref} className="lb-particles" aria-hidden="true" />
}

export default function LoginBrand() {
  return (
    <aside className="lb-panel" aria-label="DM&I Technologies" style={{ '--lb-wall': `url(${wallpaper})` } as React.CSSProperties}>
      <div className="lb-wall">
        <p className="sr-only">DM&I Technologies. Built with heart. Delivered with integrity.</p>
        <ParticleField />
        <span className="lb-fx lb-aura" aria-hidden="true" />
        <span className="lb-fx lb-badge-ring" aria-hidden="true" />
        <span className="lb-fx lb-heartbeat" aria-hidden="true" />
        <span className="lb-fx lb-shine" aria-hidden="true"><i /></span>
        <svg className="lb-fx lb-ecg" viewBox="0 0 600 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="lb-ecg-colour" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#ff3b4f" />
              <stop offset=".5" stopColor="#c46cff" />
              <stop offset="1" stopColor="#22e3f0" />
            </linearGradient>
          </defs>
          <path className="lb-ecg-base" d="M0 34 H170 L182 34 L190 22 L198 34 L212 34 L220 4 L230 56 L240 34 L256 34 L266 26 L276 34 H430 L440 34 L448 22 L456 34 L470 34 L478 4 L488 56 L498 34 L514 34 L524 26 L534 34 H600" />
          <path className="lb-ecg-pulse" pathLength={100} d="M0 34 H170 L182 34 L190 22 L198 34 L212 34 L220 4 L230 56 L240 34 L256 34 L266 26 L276 34 H430 L440 34 L448 22 L456 34 L470 34 L478 4 L488 56 L498 34 L514 34 L524 26 L534 34 H600" />
        </svg>
        <div className="lb-text">
          <p className="lb-headline">Empowering connection, driving innovation.</p>
          <p className="lb-sub">Welcome back. Log in to access your dashboard and manage your technology solutions.</p>
        </div>
      </div>
    </aside>
  )
}

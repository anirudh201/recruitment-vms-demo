import heroLogo from '../assets/dmi-logo-hero.webp'

// A fixed (seeded) scatter of network nodes, so the picture is the same on every load.
function seeded(seed: number) {
  let value = seed
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}
const random = seeded(42)
const NODES = Array.from({ length: 46 }, () => {
  // keep most nodes towards the left/right edges so the centre stays calm behind the logo
  const side = random() < 0.5 ? random() * 180 : 420 + random() * 180
  return { x: side, y: random() * 800, r: 1.2 + random() * 2.6, o: 0.35 + random() * 0.55 }
})
const LINKS: Array<[number, number]> = []
NODES.forEach((a, i) => {
  NODES.forEach((b, j) => {
    if (j > i && Math.hypot(a.x - b.x, a.y - b.y) < 95) LINKS.push([i, j])
  })
})
// flowing "light ribbons": many thin parallel curves
const ribbon = (offset: number, lift: number) =>
  `M -40 ${700 + offset} C 140 ${560 + offset - lift}, 260 ${380 + offset}, 420 ${250 + offset - lift} S 640 ${40 + offset}, 680 ${-20 + offset}`

export default function LoginBrand() {
  return (
    <aside className="lb-panel" aria-label="DM&I Technologies">
      <svg className="lb-art" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="lb-ribbon-blue" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#3aa0ff" stopOpacity="0" />
            <stop offset=".45" stopColor="#5cc8ff" stopOpacity=".55" />
            <stop offset="1" stopColor="#8fe3ff" stopOpacity=".15" />
          </linearGradient>
          <linearGradient id="lb-ribbon-cyan" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#1f8bff" stopOpacity=".1" />
            <stop offset=".5" stopColor="#5fd4ff" stopOpacity=".75" />
            <stop offset="1" stopColor="#a8ecff" stopOpacity=".2" />
          </linearGradient>
          <linearGradient id="lb-ribbon-red" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff5a4e" stopOpacity="0" />
            <stop offset=".6" stopColor="#ff6b4a" stopOpacity=".7" />
            <stop offset="1" stopColor="#ff8f5a" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="url(#lb-ribbon-blue)" strokeWidth=".8">
          {Array.from({ length: 26 }, (_, i) => <path key={`b${i}`} d={ribbon(i * 6, i * 3)} />)}
        </g>
        {/* bright blue ribbon sweeping up the right edge */}
        <g fill="none" stroke="url(#lb-ribbon-cyan)" strokeWidth=".9">
          {Array.from({ length: 24 }, (_, i) => (
            <path key={`c${i}`} d={`M ${640 - i * 5} 820 C ${420 - i * 3} 620, ${700 - i * 4} 420, ${470 + i * 2} 210 S ${520 - i * 3} -10, ${560 + i * 2} -40`} />
          ))}
        </g>
        <g fill="none" stroke="url(#lb-ribbon-red)" strokeWidth=".8">
          {Array.from({ length: 16 }, (_, i) => <path key={`r${i}`} d={`M ${-30 + i * 3} 820 C ${60 + i * 4} 640, ${-20 + i * 2} 460, ${50 + i * 3} 300`} />)}
          {Array.from({ length: 16 }, (_, i) => <path key={`r2${i}`} d={`M ${640 - i * 3} 120 C ${560 - i * 4} 260, ${650 - i * 2} 420, ${590 - i * 3} 560`} />)}
        </g>
        <g stroke="#7cc4ff" strokeOpacity=".22" strokeWidth=".6">
          {LINKS.map(([a, b]) => <line key={`${a}-${b}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} />)}
        </g>
        <g fill="#9fd8ff">
          {NODES.map((node, i) => <circle key={i} cx={node.x} cy={node.y} r={node.r} opacity={node.o} />)}
        </g>
      </svg>

      <div className="lb-content">
        <img className="lb-logo" src={heroLogo} alt="DM&I Technologies" width={680} height={665} />
        <div className="lb-badge">
          <p>
            <span>Built with</span>
            <strong className="lb-heart">Heart.</strong>
          </p>
          <span className="lb-divider" aria-hidden="true" />
          <p>
            <span>Delivered with</span>
            <strong className="lb-integrity">Integrity.</strong>
          </p>
        </div>
        <p className="lb-headline">Empowering connection, driving innovation.</p>
        <p className="lb-sub">Welcome back. Log in to access your dashboard and manage your technology solutions.</p>
      </div>
    </aside>
  )
}

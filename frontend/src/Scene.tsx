import type { CSSProperties, ReactNode } from 'react'

// Deterministic PRNG so the scene layout is stable across renders and reloads.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(42)
const between = (a: number, b: number) => a + rand() * (b - a)
// Non-multiple durations so no two leaves ever re-sync.
const DURATIONS = [7.3, 8.9, 9.1, 10.3, 11.7, 12.9]

type Plane = 'back' | 'mid' | 'front'
type Frond = { kind: 'leaf' | 'fern'; left: number; h: number; w: number; r: number; a: number; dur: number; delay: number; hang?: boolean }

function fronds(n: number, zones: [number, number, number, number][], hMin: number, hMax: number): Frond[] {
  return Array.from({ length: n }, (_, i) => {
    const [l0, l1, r0, r1] = zones[i % zones.length]
    const h = between(hMin, hMax)
    return {
      kind: rand() > 0.4 ? 'leaf' : 'fern',
      left: between(l0, l1),
      r: between(r0, r1),
      h,
      w: between(0.26, 0.38),
      // Small leaves move more than big ones.
      a: (between(3, 6) * 40) / h,
      dur: DURATIONS[i % DURATIONS.length],
      delay: -between(0, 12),
    }
  })
}

// [left min, left max, rotate min, rotate max] per zone: left edge leans in, right edge leans in, a few short ones along the floor.
const LEFT: [number, number, number, number] = [-6, 20, 6, 36]
const RIGHT: [number, number, number, number] = [80, 106, -36, -6]
const FLOOR: [number, number, number, number] = [22, 78, -14, 14]

// Canopy: leaves hanging from the top corners, so the upper half of the hero is not empty.
const CANOPY_L: [number, number, number, number] = [-4, 26, 158, 186]
const CANOPY_R: [number, number, number, number] = [74, 104, 174, 202]
const canopy = (n: number, hMin: number, hMax: number) => fronds(n, [CANOPY_L, CANOPY_R], hMin, hMax).map(f => ({ ...f, hang: true }))

const PLANES: { id: Plane; items: Frond[]; parallax: number; className: string }[] = [
  { id: 'back', items: [...fronds(12, [LEFT, RIGHT, LEFT, RIGHT, FLOOR], 34, 62), ...canopy(6, 22, 40)], parallax: 0.15, className: 'opacity-60' },
  { id: 'mid', items: [...fronds(12, [LEFT, RIGHT, FLOOR], 26, 52), ...canopy(4, 16, 28)], parallax: 0.4, className: '' },
  { id: 'front', items: fronds(9, [[-10, 8, 4, 26], [92, 110, -26, -4], [20, 80, -10, 10]], 30, 72), parallax: 0.8, className: '' },
]

const STEMS = [
  { left: 13, h: 30, petal: 'amber' },
  { left: 23, h: 20, petal: 'cream' },
  { left: 31, h: 13, petal: 'teal' },
  { left: 69, h: 16, petal: 'cream' },
  { left: 78, h: 33, petal: 'amber' },
  { left: 88, h: 22, petal: 'sand' },
].map((s, i) => ({ ...s, size: between(30, 44), dur: DURATIONS[(i + 2) % DURATIONS.length], delay: -between(0, 10), spin: between(60, 110) }))

const POLLEN = Array.from({ length: 18 }, () => ({
  left: between(2, 98),
  bottom: between(0, 40),
  size: between(2, 4.5),
  color: rand() > 0.35 ? '#F2A93B' : '#4FB3AC',
  dur: between(11, 19),
  delay: -between(0, 19),
  dx: between(-40, 40),
}))

// Shared gradients, referenced by every leaf/petal SVG in the document.
function SceneDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <linearGradient id="leaf-back" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#0f2a27" />
          <stop offset="1" stopColor="#24524c" />
        </linearGradient>
        <linearGradient id="leaf-mid" x1="0" y1="1" x2="0.3" y2="0">
          <stop offset="0" stopColor="#0c2522" />
          <stop offset="0.6" stopColor="#1f5650" />
          <stop offset="1" stopColor="#3f8a80" />
        </linearGradient>
        <linearGradient id="leaf-front" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#040b0a" />
          <stop offset="1" stopColor="#0d2421" />
        </linearGradient>
        <radialGradient id="petal-amber">
          <stop offset="0.2" stopColor="#b25c09" />
          <stop offset="1" stopColor="#F2A93B" />
        </radialGradient>
        <radialGradient id="petal-cream">
          <stop offset="0.2" stopColor="#e0be8e" />
          <stop offset="1" stopColor="#F4F1EA" />
        </radialGradient>
        <radialGradient id="petal-teal">
          <stop offset="0.2" stopColor="#2A4A46" />
          <stop offset="1" stopColor="#7aada8" />
        </radialGradient>
        <radialGradient id="petal-sand">
          <stop offset="0.2" stopColor="#a1682c" />
          <stop offset="1" stopColor="#e0be8e" />
        </radialGradient>
        <linearGradient id="ray" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2A93B" stopOpacity="0.5" />
          <stop offset="1" stopColor="#F2A93B" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const VEIN = { back: '#2c5a54', mid: '#5aa39a', front: '#4FB3AC' }

function LeafSvg({ plane }: { plane: Plane }) {
  const vein = VEIN[plane]
  return (
    <svg viewBox="0 0 100 300" preserveAspectRatio="none" className="w-full h-full overflow-visible">
      <path
        d="M50 300 C 8 225, -2 120, 50 0 C 102 120, 92 225, 50 300 Z"
        fill={`url(#leaf-${plane})`}
        stroke={plane === 'front' ? '#4FB3AC' : 'none'}
        strokeOpacity="0.22"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <g stroke={vein} fill="none" opacity={plane === 'back' ? 0.35 : 0.45} vectorEffect="non-scaling-stroke">
        <path d="M50 296 Q 52 150 50 10" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        {[50, 95, 140, 185, 230].map(y => (
          <path key={y} d={`M50 ${y + 30} Q 36 ${y + 14} 22 ${y + 2} M50 ${y + 30} Q 64 ${y + 14} 78 ${y + 2}`} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  )
}

function FernSvg({ plane }: { plane: Plane }) {
  return (
    <svg viewBox="0 0 100 300" preserveAspectRatio="none" className="w-full h-full overflow-visible">
      <path d="M50 300 Q 54 150 50 4" stroke={VEIN[plane]} strokeOpacity="0.6" strokeWidth="1.6" fill="none" vectorEffect="non-scaling-stroke" />
      <g fill={`url(#leaf-${plane})`}>
        {Array.from({ length: 12 }, (_, k) => {
          const y = 276 - k * 22
          const len = 46 - k * 3.2
          return (
            <g key={k}>
              <ellipse cx={50 - len / 2} cy={y - 8} rx={len / 2} ry={6} transform={`rotate(-26 ${50 - len / 2} ${y - 8})`} />
              <ellipse cx={50 + len / 2} cy={y - 8} rx={len / 2} ry={6} transform={`rotate(26 ${50 + len / 2} ${y - 8})`} />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

function FrondEl({ f, plane }: { f: Frond; plane: Plane }) {
  return (
    <div
      className={`sway absolute origin-bottom ${f.hang ? '' : 'bottom-[-3vh]'}`}
      style={
        {
          left: `${f.left}%`,
          // Hanging leaves: base sits on the top edge, rotated ~180deg around it.
          top: f.hang ? `${3 - f.h}vh` : undefined,
          height: `${f.h}vh`,
          width: `${f.h * f.w}vh`,
          marginLeft: `${(-f.h * f.w) / 2}vh`,
          '--r': `${f.r}deg`,
          '--a': `${f.a}deg`,
          animationDuration: `${f.dur}s`,
          animationDelay: `${f.delay}s`,
        } as CSSProperties
      }
    >
      {f.kind === 'leaf' ? <LeafSvg plane={plane} /> : <FernSvg plane={plane} />}
    </div>
  )
}

function FlowerStem({ s }: { s: (typeof STEMS)[number] }) {
  return (
    <div
      className="sway absolute bottom-[-2vh] origin-bottom w-[60px] -ml-[30px]"
      style={{ left: `${s.left}%`, height: `${s.h}vh`, '--r': '0deg', '--a': `${(4 * 30) / s.h}deg`, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` } as CSSProperties}
    >
      <svg viewBox="0 0 60 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
        <path d="M30 100 Q 24 60 30 0" stroke="#3f8a80" strokeWidth="1.6" fill="none" vectorEffect="non-scaling-stroke" />
        <path d="M29 62 Q 12 54 6 40 Q 22 44 29 62 Z" fill="url(#leaf-mid)" />
      </svg>
      <div className="absolute left-1/2 top-0" style={{ width: s.size, height: s.size, margin: `${-s.size / 2}px 0 0 ${-s.size / 2}px` }}>
        <svg viewBox="-50 -50 100 100" className="bloom w-full h-full" style={{ animationDuration: `${s.dur / 2}s, ${s.spin}s` }}>
          {[0, 60, 120, 180, 240, 300].map(a => (
            <ellipse key={a} cx="0" cy="-23" rx="12" ry="23" fill={`url(#petal-${s.petal})`} transform={`rotate(${a})`} />
          ))}
          <circle r="9" fill="#2a1a06" opacity="0.55" />
          <circle r="5" fill="#F2A93B" />
        </svg>
      </div>
    </div>
  )
}

// Circuit pattern revealed under the cursor, between the mid and front planes: "under the leaves, the chip".
function CircuitLayer() {
  return (
    <div className="spotlight absolute inset-0 pointer-events-none opacity-70" aria-hidden>
      <svg className="w-full h-full">
        <defs>
          <pattern id="circuit" width="240" height="200" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="#4FB3AC" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M0 36 H64 L92 64 V200" />
              <path d="M240 128 H176 L148 100 V0" />
              <path d="M30 200 V158 L58 130 H112" />
              <path d="M188 0 V34 L214 60 H240" />
              <path d="M120 0 V20 L134 34 H160 L176 50" />
              <path d="M200 200 V178 L222 156" />
            </g>
            <g fill="#0A1615" stroke="#4FB3AC" strokeWidth="1.2">
              <circle cx="64" cy="36" r="3.5" />
              <circle cx="112" cy="130" r="3.5" />
              <circle cx="148" cy="100" r="3.5" />
              <circle cx="176" cy="50" r="3" />
            </g>
            <circle cx="214" cy="60" r="3.5" fill="#F2A93B" />
            <circle cx="222" cy="156" r="3" fill="#F2A93B" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#circuit)" />
      </svg>
    </div>
  )
}

function Plane({ id, items, parallax, className, children }: (typeof PLANES)[number] & { children?: ReactNode }) {
  return (
    <div className={`plane plane-${id} absolute inset-0`} style={{ '--k': parallax } as CSSProperties}>
      <div className={`absolute inset-0 ${className}`}>
      {items.map((f, i) => (
        <FrondEl key={i} f={f} plane={id} />
      ))}
      {children}
      </div>
    </div>
  )
}

export function Greenery() {
  const [back, mid, front] = PLANES
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <SceneDefs />
      <div className="ambient absolute w-[60vmax] h-[60vmax] -left-[15vmax] top-[10vh] rounded-full" style={{ background: 'radial-gradient(circle, rgba(79,179,172,0.12), transparent 60%)' }} />
      <div
        className="ambient absolute w-[50vmax] h-[50vmax] -right-[10vmax] -top-[15vmax] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(242,169,59,0.10), transparent 60%)', animationDelay: '-9s' }}
      />
      <svg className="rays absolute right-0 top-0 w-[70vw] h-[90vh]" viewBox="0 0 700 900" preserveAspectRatio="none">
        <polygon points="700,0 620,0 250,900 420,900" fill="url(#ray)" opacity="0.10" />
        <polygon points="700,60 680,0 470,900 560,900" fill="url(#ray)" opacity="0.07" />
        <polygon points="560,0 520,0 60,900 150,900" fill="url(#ray)" opacity="0.05" />
      </svg>
      <Plane {...back} />
      <Plane {...mid}>
        {STEMS.map((s, i) => (
          <FlowerStem key={i} s={s} />
        ))}
      </Plane>
      <div className="circuit-wrap absolute inset-0">
        <CircuitLayer />
      </div>
      <Plane {...front} />
      <div className="plane plane-pollen absolute inset-0" style={{ '--k': 1 } as CSSProperties}>
      {POLLEN.map((p, i) => (
        <span
          key={i}
          className="drift absolute rounded-full"
          style={
            {
              left: `${p.left}%`,
              bottom: `${p.bottom}vh`,
              width: p.size,
              height: p.size,
              background: p.color,
              boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
              '--dx': `${p.dx}px`,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
            } as CSSProperties
          }
        />
      ))}
      </div>
    </div>
  )
}


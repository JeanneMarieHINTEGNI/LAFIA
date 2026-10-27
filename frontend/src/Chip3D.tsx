import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'
import { encode } from 'uqr'
import { Logo } from './Logo'

// La carte Lafia : l'objet que le patient porte sur lui. Elle remplace la puce 3D.
// Le QR dessiné ici est une ILLUSTRATION : il encode un texte d'exemple, pas une vraie carte de santé.

const QR = encode('Exemple Lafia, carte fictive')
const QR_PATH = QR.data
  .flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : '')))
  .join('')

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const seg = (v: number, a: number, b: number) => clamp01((v - a) / (b - a))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const mix = (a: number, b: number, t: number) => a + (b - a) * t

type Pose = { x: number; y: number; s: number; o: number }

// The chip travels with the whole page: rises in the forest clearing, settles beside the intro copy,
// sinks and recedes behind the content sections (turning with the scroll), then comes back over the closing section.
// One passive scroll listener, offsets cached on resize, one transform written per frame.
function useChipTravel(layer: RefObject<HTMLDivElement>, mover: RefObject<HTMLDivElement>, spinner: RefObject<HTMLDivElement>) {
  useEffect(() => {
    let anchors = { introEnd: 0, finalTop: 0 }
    const measure = () => {
      const intro = document.getElementById('top')
      const final = document.getElementById('final')
      const top = (el: HTMLElement) => el.getBoundingClientRect().top + window.scrollY
      if (intro) anchors.introEnd = top(intro) + intro.offsetHeight - window.innerHeight
      if (final) anchors.finalTop = top(final)
    }
    let raf = 0
    const update = () => {
      raf = 0
      const el = layer.current
      const m = mover.current
      if (!el || !m) return
      const vw = window.innerWidth / 100
      const vh = window.innerHeight / 100
      const desktop = window.innerWidth >= 768
      const y = window.scrollY
      const pIntro = clamp01(y / Math.max(1, anchors.introEnd))
      const emerge = ease(seg(pIntro, 0.24, 0.68))
      const settle = ease(seg(pIntro, 0.74, 0.92))
      const leave = ease(seg(y, anchors.introEnd, anchors.introEnd + 90 * vh))
      const back = ease(seg(y, anchors.finalTop - 110 * vh, anchors.finalTop - 10 * vh))

      const center: Pose = { x: 0, y: 0, s: 1, o: 1 }
      const aside: Pose = desktop ? { x: 21 * vw, y: 0, s: 0.94, o: 1 } : { x: 0, y: -20 * vh, s: 0.7, o: 1 }
      const away: Pose = desktop ? { x: 38 * vw, y: 32 * vh, s: 0.38, o: 0.26 } : { x: 32 * vw, y: 38 * vh, s: 0.3, o: 0.16 }
      const home: Pose = desktop ? { x: 0, y: -12 * vh, s: 0.68, o: 1 } : { x: 0, y: -18 * vh, s: 0.55, o: 1 }
      const lerp = (a: Pose, b: Pose, t: number): Pose => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), s: mix(a.s, b.s, t), o: mix(a.o, b.o, t) })
      let pose = lerp(lerp(lerp(center, aside, settle), away, leave), home, back)
      const past = Math.max(0, y - (anchors.finalTop - 10 * vh))
      pose = { ...pose, y: pose.y - past }

      m.style.transform = `translate3d(${pose.x.toFixed(1)}px, ${pose.y.toFixed(1)}px, 0) scale(${pose.s.toFixed(3)})`
      m.style.opacity = pose.o.toFixed(3)
      el.style.setProperty('--emerge', emerge.toFixed(4))
      el.style.setProperty('--settle', settle.toFixed(4))
      const spin = leave * (1 - back) * Math.max(0, y - anchors.introEnd) * 0.04
      if (spinner.current) spinner.current.style.transform = `rotateY(${spin.toFixed(2)}deg) rotateX(${(spin * 0.25).toFixed(2)}deg)`
      el.toggleAttribute('data-done', settle > 0.9)
    }
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(update)
    }
    const onResize = () => {
      measure()
      schedule()
    }
    measure()
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', onResize)
    // La hauteur de la page change après le montage (polices web, images, contenu chargé) sans événement `resize` :
    // on re-mesure les repères dès que le contenu change de taille, sinon la carte se décale par rapport aux sections.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    ro?.observe(document.body)
    let alive = true
    document.fonts?.ready.then(() => { if (alive) onResize() })
    return () => {
      alive = false
      ro?.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(raf)
    }
  }, [layer, mover, spinner])
}

// Pastilles autour de la carte. Les compartiments 1 et 2 ne sont pas encore construits : on le dit.
const BADGES = [
  { n: '0', text: 'Signé, lisible en urgence', color: '#F2A93B', at: 0.55, u: 130, v: 322, side: 'left' },
  { n: '1', text: 'Chiffré, ouverture tracée · prévu', color: '#4FB3AC', at: 0.72, u: 690, v: 478, side: 'right' },
  { n: '2', text: 'Dossier complet, sur serveur · prévu', color: '#98A9A6', at: 0.86, u: 458, v: 690, side: 'below' },
] as const

const BADGE_SHIFT = { left: 'translate(calc(-100% - 14px), -50%)', right: 'translate(14px, -50%)', below: 'translate(-50%, 16px)' }

// Carte en CSS pur, dans une couche fixe qui suit la page.
export function ChipLayer() {
  const layer = useRef<HTMLDivElement>(null)
  const mover = useRef<HTMLDivElement>(null)
  const spinner = useRef<HTMLDivElement>(null)
  useChipTravel(layer, mover, spinner)
  return (
    <div ref={layer} id="chip-layer" className="chip-layer fixed inset-0 z-[5] flex items-center justify-center pointer-events-none" aria-hidden>
      <div ref={mover} className="chip-mover">
        <div className="chip-area relative">
          <div className="chip-shadow absolute" />
          {BADGES.map(b => (
            <div
              key={b.n}
              className="chip-badge absolute whitespace-nowrap"
              style={
                {
                  left: `calc(50% + ${((b.u - 400) / 200).toFixed(3)} * var(--s))`,
                  top: `calc(50% + ${((b.v - 400) / 200).toFixed(3)} * var(--s))`,
                  transform: BADGE_SHIFT[b.side],
                  '--at': b.at,
                } as CSSProperties
              }
            >
              <span style={{ color: b.color }}>{b.n}</span> · {b.text}
            </div>
          ))}
          <div className="chip-float">
            <div ref={spinner} className="chip-spin">
              <div className="chip3d carte3d">
                <div className="carte-face">
                  <div className="carte-haut">
                    <Logo size={26} surFond="clair" />
                    <span className="carte-nom">lafia</span>
                  </div>
                  <div className="carte-qr">
                    <svg viewBox={`0 0 ${QR.size} ${QR.size}`} shapeRendering="crispEdges" className="w-full h-full">
                      <rect width={QR.size} height={QR.size} fill="#FFFFFF" />
                      <path d={QR_PATH} fill="#0F5C4D" />
                    </svg>
                  </div>
                  <div className="carte-bas">Carte d'exemple · fictive</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
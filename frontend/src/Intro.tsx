import { useEffect, useRef, type RefObject } from 'react'
import { ArrowRightIcon, CaretDownIcon, PlayIcon } from '@phosphor-icons/react'
import { Greenery } from './Scene'

const DIVE_DISTANCE = 2800

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// Lerps the cursor (factor 0.1) and writes CSS vars on `ref`: --mx/--my (spotlight), --gx/--gy (parallax px), --nx/--ny (-1..1, chip tilt).
// No React state, nothing written once the cursor settles, disabled on touch screens.
function useCursorVars(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return
    const raw = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const s = { ...raw, gx: 0, gy: 0 }
    const onMove = (e: MouseEvent) => {
      raw.x = e.clientX
      raw.y = e.clientY
    }
    let id = 0
    const tick = () => {
      const el = ref.current
      const dx = (raw.x - s.x) * 0.08
      const dy = (raw.y - s.y) * 0.08
      if (el && Math.abs(dx) + Math.abs(dy) > 0.05) {
        s.x += dx
        s.y += dy
        const nx = (s.x / window.innerWidth) * 2 - 1
        const ny = (s.y / window.innerHeight) * 2 - 1
        s.gx += (nx * 14 - s.gx) * 0.05
        s.gy += (ny * 14 - s.gy) * 0.05
        el.style.setProperty('--mx', `${s.x}px`)
        el.style.setProperty('--my', `${s.y}px`)
        el.style.setProperty('--gx', `${s.gx}px`)
        el.style.setProperty('--gy', `${s.gy}px`)
        const chip = document.getElementById('chip-layer')
        for (const t of [el, chip]) {
          t?.style.setProperty('--nx', nx.toFixed(3))
          t?.style.setProperty('--ny', ny.toFixed(3))
        }
      }
      id = 0
    }
    const schedule = () => {
      if (id) return
      id = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('mousemove', schedule, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('mousemove', schedule)
      cancelAnimationFrame(id)
    }
  }, [ref])
}

export default function Intro() {
  const rootRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  useCursorVars(stageRef)

  // Scroll progress through the intro drives four eased phases, written as CSS vars (no re-render):
  // --hero (copy fades), --dive (camera pushes into the forest), --emerge (chip rises in the clearing), --settle (chip slides aside, copy appears).
  useEffect(() => {
    let raf = 0
    let last = -1
    const update = () => {
      raf = 0
      const root = rootRef.current
      const stage = stageRef.current
      if (!root || !stage) return
      const r = root.getBoundingClientRect()
      const p = clamp01(-r.top / (r.height - window.innerHeight))
      stage.toggleAttribute('data-offscreen', r.bottom <= 0)
      if (p === last) return
      last = p
      const dive = ease(seg(p, 0, 0.5))
      stage.style.setProperty('--hero', seg(p, 0, 0.1).toFixed(4))
      stage.style.setProperty('--dive', dive.toFixed(4))
      stage.style.setProperty('--emerge', ease(seg(p, 0.24, 0.68)).toFixed(4))
      stage.style.setProperty('--settle', ease(seg(p, 0.74, 0.92)).toFixed(4))
      stage.toggleAttribute('data-done', p > 0.9)
      stage.toggleAttribute('data-deep', dive > 0.98)
    }
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <section ref={rootRef} id="top" className="relative" style={{ height: `calc(100vh + ${DIVE_DISTANCE}px)` }}>
      <div ref={stageRef} className="intro sticky top-0 z-0 h-screen w-full overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 50% 115%, #10302D 0%, #0A1615 60%), radial-gradient(circle at 85% 10%, rgba(242,169,59,0.08), transparent 40%)' }}
        />

        <div className="clearing absolute inset-0" aria-hidden />

        <div className="absolute inset-0 anim-fade" style={{ animationDelay: '0.1s' }}>
          <Greenery />
        </div>

        <div className="dive-vignette absolute inset-0 pointer-events-none" aria-hidden />

        <div className="hero-copy absolute bottom-0 left-0 right-0 z-50 px-6 sm:px-10 md:px-14 pb-12 sm:pb-16 md:pb-20">
          <div className="absolute bottom-0 left-0 right-0 h-80 -z-10 pointer-events-none bg-gradient-to-t from-[#0A1615] via-[#0A1615]/70 to-transparent" />
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-end">
            <div className="md:col-span-7 lg:col-span-8">
              <div className="anim-stagger flex items-center gap-3 mb-6" style={{ animationDelay: '0.3s' }}>
                <span className="w-2.5 h-2.5 rounded-full bg-[#F2A93B]" />
                <span className="text-sm sm:text-[15px] text-[#F4F1EA]/80 font-normal tracking-wide">Résumé de santé portable · Bénin · Togo</span>
              </div>
              <h1
                className="font-display anim-stagger whitespace-pre-line text-[clamp(2.2rem,6.5vw,5rem)] font-light text-[#F4F1EA] leading-[0.95] tracking-[-0.03em] mb-8 sm:mb-10"
                style={{ animationDelay: '0.5s' }}
              >
                {'Votre dossier de santé,\nmême sans réseau.'}
              </h1>
              <div className="anim-stagger flex flex-wrap items-center gap-3" style={{ animationDelay: '0.7s' }}>
                <a href="#compartiments" className="bg-[#F4F1EA] text-[#0A1615] text-sm font-medium px-6 sm:px-7 py-3 sm:py-3.5 rounded-full hover:bg-white transition-all">
                  Voir le principe
                </a>
                <a
                  href="#urgence"
                  className="lg lg-button flex items-center gap-2.5 text-[#F4F1EA]/90 text-sm font-medium px-6 sm:px-7 py-3 sm:py-3.5"
                >
                  <PlayIcon size={14} weight="fill" />
                  Voir la démo
                </a>
              </div>
            </div>
            <div className="md:col-span-5 lg:col-span-4 anim-stagger" style={{ animationDelay: '0.85s' }}>
              <p className="text-[15px] sm:text-base text-[#F4F1EA]/75 leading-relaxed font-normal">
                Lafia garde l'essentiel de votre santé sur une carte, un QR papier ou un téléphone. En urgence, un soignant le lit même sans
                connexion, et chaque lecture est inscrite dans un journal que vous consultez vous-même.
              </p>
            </div>
          </div>
          <div className="scroll-hint hidden md:flex absolute left-1/2 -translate-x-1/2 bottom-6 flex-col items-center gap-1 text-[11px] tracking-[0.2em] uppercase text-[#F4F1EA]/45">
            Entrer dans la forêt
            <CaretDownIcon size={16} weight="light" className="hint-bob" />
          </div>
        </div>

        <div className="chip-copy absolute inset-0 z-50 flex items-end md:items-center pointer-events-none">
          <div className="w-full md:w-[52%] px-5 sm:px-10 md:px-14 pb-10 md:pb-0">
            <p className="flex items-center gap-3 text-sm text-[#F4F1EA]/70 tracking-wide mb-5 md:mb-7">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4FB3AC]" />
              Trois niveaux, une seule carte
            </p>
            <h2 className="font-display text-[clamp(2rem,4.3vw,4.2rem)] font-light leading-[0.98] tracking-[-0.03em] mb-6 md:mb-8">
              <span className="block text-[#F4F1EA]">Lisible en urgence.</span>
              <span className="block text-[#F4F1EA]/45">Jamais en cachette.</span>
            </h2>
            <p className="max-w-md text-sm sm:text-[15px] md:text-base text-[#F4F1EA]/65 leading-relaxed mb-6 md:mb-8">
              Allergies, groupe sanguin et traitements essentiels sont signés, pas chiffrés : un soignant les lit sans réseau et peut vérifier
              qui a écrit la carte. Le reste du dossier sera chiffré, et chaque ouverture vous sera notifiée.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a href="#final" className="bg-[#F4F1EA] text-[#0A1615] text-sm font-medium px-5 sm:px-6 py-2.5 sm:py-3 rounded-full hover:bg-white transition-all">
                Rejoindre le pilote
              </a>
              <a
                href="#compartiments"
                className="lg lg-button flex items-center gap-2 text-[#F4F1EA]/85 text-sm font-medium px-5 py-2.5 sm:py-3"
              >
                Les trois niveaux
                <ArrowRightIcon size={15} weight="light" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
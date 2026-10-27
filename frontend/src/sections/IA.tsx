import { useRef } from 'react'
import { useReveal } from '../useReveal'
import { Label, Lines, useScrollProgress } from './ui'

// Principes de conception de la partie 2 (en préparation) : ce sont des engagements, pas encore des fonctions livrées.
const GUARANTEES = [
  { title: "Sur l'appareil.", text: "Le but : que les modèles tournent sur le téléphone du soignant, sans envoyer de donnée de santé dans un cloud." },
  { title: "Un brouillon, jusqu'à la signature.", text: "Rien de ce que propose le modèle n'entre au dossier sans la relecture et la signature d'un soignant." },
  { title: 'Le protocole décide.', text: "L'IA transcrit, lit et rédige. Elle ne pose pas de diagnostic et ne propose pas de posologie." },
]

// The paper booklet the patient already owns: a single drawn object, scanned once, drifting slightly with the scroll.
function Booklet() {
  return (
    <div className="booklet relative mx-auto w-[min(78vw,380px)] aspect-[3/4]">
      <svg viewBox="0 0 300 400" className="absolute inset-0 w-full h-full -rotate-3" aria-hidden>
        <rect x="6" y="6" width="288" height="388" rx="10" fill="#EFE8D8" />
        <rect x="6" y="6" width="288" height="56" rx="10" fill="#E2D6BC" />
        <text x="30" y="42" fill="#6b5a3a" fontSize="15" letterSpacing="3" fontFamily="Inter, sans-serif">
          CARNET DE SANTÉ
        </text>
        <line x1="44" y1="62" x2="44" y2="394" stroke="#d9a3a3" strokeWidth="1" />
        {[100, 140, 180, 220, 260, 300, 340].map(y => (
          <line key={y} x1="20" y1={y} x2="280" y2={y} stroke="#cbbfa6" strokeWidth="0.8" />
        ))}
        <g fill="none" stroke="#2f3f6b" strokeWidth="1.6" strokeLinecap="round" opacity="0.85">
          <path d="M58 92 q8 -10 16 0 t16 0 t16 0 q10 -8 20 2 M160 92 q10 -12 22 0 t22 0" />
          <path d="M58 132 q12 -10 24 0 t24 0 t24 0 t24 0" />
          <path d="M58 172 q8 -8 16 0 t16 0 M120 172 q14 -12 28 0 t28 0 t28 0" />
          <path d="M58 212 q10 -10 20 0 t20 0 t20 0" />
          <path d="M58 252 q12 -12 24 0 t24 0 t24 0 t24 0 t24 0" />
          <path d="M58 292 q8 -8 16 0 t16 0 t16 0" />
        </g>
        <circle cx="228" cy="320" r="34" fill="none" stroke="#7a4d8f" strokeWidth="2" opacity="0.5" />
        <circle cx="228" cy="320" r="27" fill="none" stroke="#7a4d8f" strokeWidth="1" opacity="0.4" />
      </svg>
      <div className="scan absolute inset-x-[4%] h-px bg-[#4FB3AC] -rotate-3" aria-hidden />
    </div>
  )
}

export default function IA() {
  const ref = useReveal<HTMLElement>()
  useScrollProgress(ref)
  return (
    <section ref={ref} id="ia" className="relative px-6 sm:px-10 md:px-14 py-32 md:py-44">
      <Label n="05">L'IA embarquée · en préparation</Label>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-16 md:gap-12 items-center">
        <div className="md:col-span-5 order-2 md:order-1">
          <div className="booklet-drift">
            <Booklet />
          </div>
        </div>
        <div className="md:col-span-6 md:col-start-7 order-1 md:order-2">
          <h2 className="font-display font-light leading-[0.98] tracking-[-0.03em] text-[clamp(2.2rem,4.4vw,4.2rem)] mb-8">
            <Lines lines={['Le dossier se remplira', 'à partir du carnet', 'papier.']} dim={[1, 2]} />
          </h2>
          <p className="r max-w-lg text-[15px] sm:text-base text-[#F4F1EA]/65 leading-relaxed mb-12" style={{ ['--i' as string]: 3 }}>
            Le soignant photographiera le carnet que le patient possède déjà. Le modèle lira la page et proposera un résumé structuré ; le soignant
            corrigera et signera. L'objectif est que cela marche sans réseau et en quelques minutes : ce délai reste à mesurer.
          </p>
          <ul className="border-t border-white/10">
            {GUARANTEES.map((g, i) => (
              <li key={g.title} className="r border-b border-white/10 py-6" style={{ ['--i' as string]: i + 4 }}>
                <p className="font-display text-xl md:text-2xl font-light text-[#F4F1EA] mb-1.5">{g.title}</p>
                <p className="text-[15px] text-[#F4F1EA]/55 leading-relaxed">{g.text}</p>
              </li>
            ))}
          </ul>
          <p className="r mt-6 text-sm text-[#F4F1EA]/35" style={{ ['--i' as string]: 7 }}>
            Modèles envisagés : QVAC MedPsy et VisionPsy-Nano, exécutés sur le téléphone.
          </p>
        </div>
      </div>
    </section>
  )
}
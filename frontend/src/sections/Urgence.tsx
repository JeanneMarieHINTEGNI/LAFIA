import { useRef, type CSSProperties } from 'react'
import { useReveal } from '../useReveal'
import { Label, Lines, useScrollProgress } from './ui'

// Scénario d'illustration : personnages fictifs. `prevu` signale une étape qui repose sur une fonction pas encore construite.
const STEPS: { t: string; place: string; text: string; urgent?: boolean; prevu?: string }[] = [
  {
    t: '11h20',
    place: 'Village, CS de Bassila',
    text: 'Un relais communautaire voit la patiente et repère un signe de danger : il la réfère. Il met à jour la carte, sans réseau.',
  },
  { t: '12h00', place: 'Route de Kara', text: "Elle perd connaissance pendant l'évacuation. Personne ne peut plus consentir pour elle. La carte voyage avec elle." },
  {
    t: '14h32',
    place: 'Hôpital de Kara',
    text: "Un médecin qu'elle n'a jamais vu lit sa carte hors ligne. La lecture est inscrite au journal avant tout affichage.",
    urgent: true,
    prevu: "Déclaration de l'urgence avec un motif",
  },
  {
    t: 'Plus tard',
    place: 'Son téléphone',
    text: 'Au retour du réseau, elle sait qui a ouvert son dossier, où, à quelle heure.',
    prevu: 'Notification par SMS',
  },
]

const GUARDS: { g: string; ok: boolean }[] = [
  { g: 'Carte signée, vérifiée hors ligne', ok: true },
  { g: 'Lecture inscrite au journal avant affichage', ok: true },
  { g: 'Périmètre borné', ok: false },
  { g: 'Motif obligatoire', ok: false },
  { g: 'Patient prévenu', ok: false },
  { g: "Revue par l'Ordre", ok: false },
]

// Frise verticale dont la ligne se remplit avec le défilement (scaleY depuis --sp).
export default function Urgence() {
  const ref = useReveal<HTMLElement>()
  const timeline = useRef<HTMLOListElement>(null)
  useScrollProgress(timeline)
  return (
    <section ref={ref} id="urgence" className="relative px-6 sm:px-10 md:px-14 py-32 md:py-44">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-14 md:gap-12">
        <div className="md:col-span-5">
          <div className="md:sticky md:top-36">
            <Label n="03">Le bris de glace</Label>
            <h2 className="font-display font-light leading-[0.98] tracking-[-0.03em] text-[clamp(2.2rem,4.4vw,4.2rem)] mb-8">
              <Lines lines={['Personne ne meurt', 'faute de formulaire.', 'Personne ne fouille', 'sans laisser de trace.']} dim={[2, 3]} />
            </h2>
            <p className="r max-w-sm text-[15px] text-[#F4F1EA]/60 leading-relaxed" style={{ ['--i' as string]: 4 }}>
              Une patiente inconsciente, un réseau coupé, un médecin inconnu. L'accès d'urgence n'est jamais bloqué, et jamais silencieux.
            </p>
          </div>
        </div>

        <div className="md:col-span-6 md:col-start-7">
          <p className="r mb-8 text-xs tracking-[0.12em] uppercase text-[#F2A93B]" style={{ ['--i' as string]: 0 }}>
            Scénario d'illustration · personnages fictifs
          </p>
          <ol ref={timeline} className="timeline relative pl-10 md:pl-14">
            <span className="tl-track absolute left-[5px] top-2 bottom-2 w-px bg-white/10" aria-hidden />
            <span className="tl-fill absolute left-[5px] top-2 bottom-2 w-px bg-[#4FB3AC] origin-top" aria-hidden />
            {STEPS.map((s, i) => (
              <li key={s.t} className="tl-step relative pb-16 last:pb-0" style={{ '--at': i / STEPS.length } as CSSProperties}>
                <span className={`tl-dot absolute -left-10 md:-left-14 top-2 w-[11px] h-[11px] rounded-full ${s.urgent ? 'bg-[#D9534A]' : 'bg-[#4FB3AC]'}`} aria-hidden />
                <p className="font-display font-light text-3xl md:text-[40px] leading-none text-[#F4F1EA] mb-3">{s.t}</p>
                <p className="text-sm tracking-[0.12em] uppercase text-[#F4F1EA]/40 mb-4">
                  {s.place}
                  {s.urgent && <span className="text-[#D9534A] ml-3">Urgence</span>}
                </p>
                <p className="text-[15px] md:text-base text-[#F4F1EA]/70 leading-relaxed max-w-md">{s.text}</p>
                {s.prevu && <p className="mt-3 text-sm text-[#F2A93B]">Prévu : {s.prevu.toLowerCase()}</p>}
              </li>
            ))}
          </ol>

          <ul className="mt-20 grid grid-cols-1 sm:grid-cols-2 gap-x-8 border-t border-white/10">
            {GUARDS.map((x, i) => (
              <li key={x.g} className="r flex items-baseline justify-between gap-4 border-b border-white/10 py-5 text-[15px] text-[#F4F1EA]/70" style={{ ['--i' as string]: i }}>
                <span>{x.g}</span>
                <span className={`text-xs tracking-[0.1em] uppercase ${x.ok ? 'text-[#4FB3AC]' : 'text-[#F2A93B]'}`}>{x.ok ? 'En place' : 'Prévu'}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
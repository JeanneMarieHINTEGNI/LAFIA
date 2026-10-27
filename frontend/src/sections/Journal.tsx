import { useReveal } from '../useReveal'
import { Label, Lines } from './ui'
import { useJournal } from '../journal/usejournal'
import { REGISTRY, FACILITIES } from '../ui/trust'
import { ROLE_LABEL } from '../ui/labels'
import type { Entree } from '../journal'

// Exemple affiché UNIQUEMENT quand cet appareil n'a encore enregistré aucun accès. Il est étiqueté « fictif ».
const EXEMPLE = [
  { when: 'Mardi 30 sept.', where: 'Cotonou', who: 'Médecine générale', what: 'Lecture de la carte' },
  { when: 'Mercredi 1 oct.', where: 'Lomé', who: 'Cardiologie', what: 'Lecture de la carte' },
]

const ACTION: Record<Entree['action'], string> = { LECTURE: 'Lecture de la carte', ECRITURE: 'Nouvelle carte émise' }

function quand(t: number) {
  const d = new Date(t * 1000)
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return `Aujourd'hui, ${hm}`
  return `${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}, ${hm}`
}

function Row({ when, where, who, what, i }: { when: string; where: string; who: string; what: string; i: number }) {
  return (
    <div
      className="r grid grid-cols-1 sm:grid-cols-[1.2fr_0.8fr_1fr_1.4fr] gap-1 sm:gap-6 py-6 border-b border-white/[0.08] last:border-0 text-[15px]"
      style={{ ['--i' as string]: Math.min(i, 5) + 2 }}
    >
      <span className="text-[#F4F1EA] first-letter:uppercase">{when}</span>
      <span className="text-[#F4F1EA]/60">{where}</span>
      <span className="text-[#F4F1EA]/60">{who}</span>
      <span className="text-[#F4F1EA]/60">{what}</span>
    </div>
  )
}

// Les lignes viennent du vrai journal de l'appareil (chaîné, écrit avant chaque affichage de carte).
export default function Journal() {
  const ref = useReveal<HTMLElement>()
  const { entrees, erreur } = useJournal()
  const reelles = entrees ?? []

  return (
    <section ref={ref} id="journal" className="relative px-6 sm:px-10 md:px-14 py-32 md:py-44">
      <Label n="04">Le journal</Label>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-14 md:gap-12 items-end mb-16 md:mb-24">
        <h2 className="md:col-span-7 font-display font-light leading-[0.98] tracking-[-0.03em] text-[clamp(2.4rem,5.2vw,4.8rem)]">
          <Lines lines={['Chaque lecture laisse', 'une trace.', 'Vous la lisez.']} dim={[2]} />
        </h2>
        <p className="r md:col-span-4 md:col-start-9 text-[15px] sm:text-base text-[#F4F1EA]/65 leading-relaxed" style={{ ['--i' as string]: 3 }}>
          Chaque entrée scelle la précédente : modifier ou retirer une ligne au milieu du journal se voit. À terme, il sera lisible par vous et
          par l'Ordre des Médecins, jamais par le serveur qui le stocke.
        </p>
      </div>

      <div className="relative">
        <div className="journal-halo absolute -inset-x-10 -inset-y-16 pointer-events-none" aria-hidden />
        <div className="lg lg-panel px-6 sm:px-10 py-4 sm:py-6">
          {erreur ? (
            <p role="alert" className="py-6 text-[15px] text-[#F2A93B]">
              Journal indisponible sur cet appareil.
            </p>
          ) : entrees === null ? (
            <p className="py-6 text-[15px] text-[#F4F1EA]/60">Chargement du journal…</p>
          ) : reelles.length > 0 ? (
            reelles.slice(0, 5).map((e, i) => {
              const r = e.acteur ? REGISTRY[e.acteur] : undefined
              return (
                <Row
                  key={e.hash}
                  i={i}
                  when={quand(e.t)}
                  where={e.etab ? (FACILITIES[e.etab] ?? 'Établissement inconnu') : 'Lieu non renseigné'}
                  who={e.acteur ? (r ? ROLE_LABEL[r.role] ?? r.role : 'Badge inconnu') : 'Lecteur sans badge'}
                  what={ACTION[e.action]}
                />
              )
            })
          ) : (
            <>
              <p className="pt-4 text-xs tracking-[0.12em] uppercase text-[#F2A93B]">Exemple fictif · aucun accès enregistré sur cet appareil</p>
              <div className="opacity-70">
                {EXEMPLE.map((e, i) => (
                  <Row key={e.when} i={i} when={e.when} where={e.where} who={e.who} what={e.what} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <p className="r mt-8 text-sm text-[#F4F1EA]/50" style={{ ['--i' as string]: 6 }}>
        Aujourd'hui, ce journal est celui de cet appareil. Le pseudonymat des médecins, que seul l'Ordre pourra lever en cas d'abus, est prévu mais
        pas encore en place.
      </p>
    </section>
  )
}
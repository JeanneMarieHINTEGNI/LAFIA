import { MOTIFS_LECTURE } from '../journal'
import { BadgeLoader } from './BadgeLoader'
import { MOTIF_LECTURE } from './labels'

/**
 * « Qui lit cette carte ? » — affiché AVANT la carte, jamais bloquant.
 * Avec un badge : la lecture est signée dans le journal. Sans badge : un toucher sur un motif, la carte s'affiche
 * aussitôt, et la lecture est inscrite comme « non vérifiée » avec ce motif, visible du patient.
 * L'identification sert à TRACER, pas à protéger : le contenu est de toute façon dans le QR.
 */
export function QuiLit({ onUrgence }: { onUrgence: (motif: string) => void }) {
  return (
    <section aria-labelledby="qui-lit" className="space-y-6">
      <h2 id="qui-lit" className="font-display text-2xl font-light text-[#F4F1EA]">Qui lit cette carte ?</h2>

      <div className="rounded-2xl border border-[#D9534A]/40 bg-[#D9534A]/10 p-4">
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-[#FFB5AC]">Urgence sans badge</p>
        <p className="mt-1 text-sm text-[#F4F1EA]/70">La carte s’affiche tout de suite. Cette lecture sera inscrite dans le journal du patient comme « non vérifiée ».</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MOTIFS_LECTURE.map(m => (
            <button key={m} type="button" onClick={() => onUrgence(m)}
              className="rounded-xl border border-white/15 bg-[#0A1615]/60 px-4 py-3 text-left text-[15px] text-[#F4F1EA] hover:border-[#FFB5AC] focus-visible:border-[#FFB5AC]">
              {MOTIF_LECTURE[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-[#C8F3EE]">Je suis soignant</p>
        <p className="mb-3 mt-1 text-sm text-[#F4F1EA]/70">Avec votre badge, la lecture est signée à votre nom et rattachée à votre établissement.</p>
        <BadgeLoader />
      </div>
    </section>
  )
}
import { useCallback, useRef, useState } from 'react'
import type { Verified } from '../core'
import { ScanUrgence } from './ScanUrgence'
import { journal } from '../journal/usejournal'
import { useBadge } from './BadgeContext'
import { QuiLit } from './QuiLit'
import { MOTIF_LECTURE } from './labels'

type Ok = Extract<Verified, { ok: true }>

/**
 * Lecteur d'urgence branché sur le journal : « Qui lit ? » d'abord, puis l'entrée de journal est écrite AVANT l'affichage.
 * Badge chargé : entrée signée par le badge, avec son établissement. Sinon : entrée non signée, avec le motif choisi.
 */
export function ScanJournalise({ initialText, etab }: { initialText?: string; etab?: string }) {
  const { badge } = useBadge()
  const [motif, setMotif] = useState<string | null>(null)
  // Une même lecture (même carte, même lecteur) relancée dans les 3 s n'est inscrite qu'une fois : React rejoue les
  // effets en développement, et un double déclenchement ferait croire au patient que sa carte a été lue deux fois.
  const derniere = useRef<{ cle: string; t: number } | null>(null)
  // Référence stable : ScanUrgence relance la lecture quand cette fonction change.
  const beforeDisplay = useCallback(
    async (v: Ok) => {
      const cle = [v.payload.id, v.payload.iat, badge?.kid ?? '', motif ?? ''].join('|')
      const t = Date.now()
      if (derniere.current && derniere.current.cle === cle && t - derniere.current.t < 3000) return
      derniere.current = { cle, t }
      await journal.ajouterEntree({
        action: 'LECTURE', cible: v.payload.id, rubriques: ['C0'], etab: etab ?? badge?.etab, signataire: badge,
        ...(badge ? {} : { motif: motif ?? undefined }),
      })
    },
    [badge, etab, motif],
  )
  if (!badge && !motif) return <QuiLit onUrgence={setMotif} />
  return (
    <div className="space-y-4">
      {!badge && motif && (
        <p className="rounded-xl border border-[#F2A93B]/40 bg-[#F2A93B]/10 px-4 py-2 text-sm text-[#F2A93B]">
          Lecture sans badge · motif : {MOTIF_LECTURE[motif] ?? motif} · inscrite dans le journal du patient
        </p>
      )}
      <ScanUrgence initialText={initialText} beforeDisplay={beforeDisplay} />
    </div>
  )
}
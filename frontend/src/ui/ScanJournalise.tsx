import { useCallback } from 'react'
import type { Verified } from '../core'
import { ScanUrgence } from './ScanUrgence'
import { journal } from '../journal/usejournal'
import { useBadge } from './BadgeContext'

type Ok = Extract<Verified, { ok: true }>

/**
 * Scanner d'urgence branché sur le vrai journal : l'entrée est écrite AVANT l'affichage.
 * Si un badge soignant est chargé, l'entrée est signée par lui et porte son établissement ;
 * sinon elle est enregistrée « lecteur sans badge », non signée.
 */
export function ScanJournalise({ initialText, etab }: { initialText?: string; etab?: string }) {
  const { badge } = useBadge()
  // Référence stable : ScanUrgence relance la lecture quand cette fonction change.
  const beforeDisplay = useCallback(
    (v: Ok) => journal.ajouterEntree({ action: 'LECTURE', cible: v.payload.id, rubriques: ['C0'], etab: etab ?? badge?.etab, signataire: badge }).then(() => undefined),
    [badge, etab],
  )
  return <ScanUrgence initialText={initialText} beforeDisplay={beforeDisplay} />
}

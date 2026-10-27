import { useEffect, useState } from 'react'
import { Journal, LocalStockage, type Entree } from './index'

/** Instance unique pour l'application (stockage local de l'appareil). */
export const journal = new Journal(new LocalStockage())

/** Entrées réelles du patient `cible` (ou toutes si absent), mises à jour à chaque écriture. */
export function useJournal(cible?: string) {
  const [entrees, setEntrees] = useState<Entree[] | null>(null)   // null = chargement
  const [erreur, setErreur] = useState(false)
  useEffect(() => {
    let vivant = true
    const charger = () => journal.listerEntrees(cible).then(e => { if (vivant) { setEntrees(e); setErreur(false) } }, () => { if (vivant) setErreur(true) })
    void charger()
    const off = journal.subscribe(() => void charger())
    return () => { vivant = false; off() }
  }, [cible])
  return { entrees, erreur }
}
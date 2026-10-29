import { useEffect, useMemo, useRef } from 'react'
import { ArrowCounterClockwiseIcon, EarIcon } from '@phosphor-icons/react'
import { verify } from '../core'
import { FACILITIES, REGISTRY } from '../ui/trust'
import { arreter, dire, synthese } from '../ui/voix'
import { useDeviceState } from './store'
import { accueilVocal, guideOnglet } from './guides'
import type { Prises, Rappel } from './rappels'

/** Réglage de l'appareil : aide vocale activée (gardé sur ce téléphone). */
export function useAideVocale() {
  return useDeviceState('aide-vocale', false)
}

/**
 * Aide vocale de l'espace patient. Activée, elle dit chaque écran à l'arrivée (où l'on est, quoi faire, et l'essentiel :
 * la carte, les rappels du jour), et propose un gros bouton « Répéter ». La voix ne part qu'après un toucher de la
 * personne (règle des navigateurs) : activer l'aide, ou changer d'onglet, en est un.
 */
export function GuideVocal({ onglet, prenom }: { onglet: string; prenom: string }) {
  const [actif, setActif] = useAideVocale()
  const [carteTexte] = useDeviceState('c0-carte', '')
  const [rappels] = useDeviceState<Rappel[]>('rappels-v1', [])
  const [prises] = useDeviceState<Prises>('prises-v1', {})
  const carte = useMemo(() => { if (!carteTexte) return null; const v = verify(carteTexte, REGISTRY); return v.ok ? v : null }, [carteTexte])
  const phrases = useMemo(() => guideOnglet(onglet, { prenom, carte, etablissements: FACILITIES, rappels, prises }), [onglet, prenom, carte, rappels, prises])
  const premier = useRef(true)

  // Changement d'onglet (aide active) : on dit le nouvel écran. Pas au tout premier affichage : sans toucher préalable,
  // le navigateur refuserait de parler, et la personne n'a encore rien demandé.
  useEffect(() => {
    if (premier.current) { premier.current = false; return }
    if (actif) dire(phrases)
  }, [onglet]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => arreter(), [])

  if (!synthese()) return null

  const basculer = () => {
    if (actif) { arreter(); setActif(false); return }
    setActif(true)
    dire([...accueilVocal(prenom), ...phrases])
  }

  return (
    <div className="mb-8 flex flex-wrap items-center gap-3">
      <button type="button" onClick={basculer} aria-pressed={actif}
        className={`inline-flex min-h-12 items-center gap-2.5 rounded-full px-5 py-2.5 text-[15px] font-medium ${actif ? 'bg-[#4FB3AC] text-[#0A1615]' : 'border border-white/15 text-[#F4F1EA]/80 hover:text-white'}`}>
        <EarIcon size={20} weight={actif ? 'fill' : 'regular'} />
        {actif ? 'Aide vocale activée' : 'Activer l’aide vocale'}
      </button>
      {actif && (
        <button type="button" onClick={() => dire(phrases)} className="inline-flex min-h-12 items-center gap-2.5 rounded-full border border-[#4FB3AC]/50 bg-[#4FB3AC]/15 px-5 py-2.5 text-[15px] text-[#C8F3EE]">
          <ArrowCounterClockwiseIcon size={20} /> Répéter
        </button>
      )}
    </div>
  )
}
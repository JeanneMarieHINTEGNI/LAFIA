import { useEffect, useState } from 'react'
import { SpeakerHighIcon, StopIcon } from '@phosphor-icons/react'
import { arreter, dire, synthese } from './voix'

/**
 * Gros bouton « Écouter » : le téléphone lit le texte à voix haute (synthèse vocale de l'appareil, sans réseau quand
 * une voix française est installée). Pensé pour qui ne lit pas : icône haut-parleur, un seul toucher, même bouton
 * pour arrêter. Sans synthèse vocale, le bouton est remplacé par une phrase qui le dit.
 */
export function Ecouter({ phrases, libelle = 'Écouter', className = '' }: { phrases: string[]; libelle?: string; className?: string }) {
  const [parle, setParle] = useState(false)
  const [dispo] = useState(() => synthese() !== null)

  useEffect(() => () => arreter(), [])                       // quitter l'écran coupe la voix
  useEffect(() => { if (parle) { arreter(); setParle(false) } }, [phrases.join('\n')])  // contenu changé : on s'arrête

  if (!dispo) return <p className="text-xs text-[#F4F1EA]/45">La lecture à voix haute n’est pas disponible sur ce téléphone.</p>

  const basculer = () => {
    if (parle) { arreter(); setParle(false); return }
    setParle(dire(phrases, () => setParle(false)))
  }

  return (
    <button type="button" onClick={basculer} aria-pressed={parle}
      className={`inline-flex min-h-12 items-center gap-3 rounded-full px-5 py-2.5 text-[15px] font-medium transition-colors ${parle ? 'bg-[#F2A93B] text-[#0A1615]' : 'border border-[#4FB3AC]/50 bg-[#4FB3AC]/15 text-[#C8F3EE] hover:bg-[#4FB3AC]/25'} ${className}`}>
      {parle ? <StopIcon size={20} weight="fill" /> : <SpeakerHighIcon size={22} weight="fill" />}
      {parle ? 'Arrêter' : libelle}
    </button>
  )
}
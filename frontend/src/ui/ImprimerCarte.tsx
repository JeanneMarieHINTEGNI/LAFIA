import { useMemo, useState } from 'react'
import { PrinterIcon } from '@phosphor-icons/react'
import { verify } from '../core'
import { FACILITIES, REGISTRY } from './trust'
import { champ } from './formulaire'
import { imprimerCarte } from '../patient/impressionCarte'

/**
 * Impression de la carte au format carte bancaire (recto QR, verso résumé lisible), avec deux choix de confidentialité :
 * le nom sur la carte, et le résumé lisible sans téléphone. Partagé par « Ma carte » et l'espace soignant.
 */
export function ImprimerCarte({ carte, qr, nomParDefaut = '' }: { carte: string; qr: string; nomParDefaut?: string }) {
  const verdict = useMemo(() => (carte ? verify(carte, REGISTRY) : null), [carte])
  const [avecNom, setAvecNom] = useState(Boolean(nomParDefaut))
  const [nom, setNom] = useState(nomParDefaut)
  const [avecResume, setAvecResume] = useState(true)
  const [bloque, setBloque] = useState(false)

  if (!verdict?.ok) return null
  const imprimer = () => {
    setBloque(!imprimerCarte({ qr, carte: verdict, etablissements: FACILITIES, nom: avecNom ? nom : '', avecResume }))
  }

  return (
    <div className="space-y-3 text-sm text-[#F4F1EA]/70">
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={avecNom} onChange={e => setAvecNom(e.target.checked)} />
        <span>Imprimer le nom sur la carte <span className="text-[#F4F1EA]/45">(aide à identifier une personne inconsciente et à rendre une carte perdue)</span></span>
      </label>
      {avecNom && <input value={nom} maxLength={40} onChange={e => setNom(e.target.value)} placeholder="Prénom et nom" className={`${champ} max-w-xs`} />}
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={avecResume} onChange={e => setAvecResume(e.target.checked)} />
        <span>Résumé lisible sans téléphone au verso <span className="text-[#F4F1EA]/45">(allergies, groupe sanguin, points d’attention, personne à prévenir)</span></span>
      </label>
      <button type="button" onClick={imprimer} className="flex items-center gap-2.5 rounded-full bg-[#F4F1EA] px-6 py-3 text-sm font-medium text-[#0A1615] hover:bg-white">
        <PrinterIcon size={16} weight="light" /> Imprimer la carte
      </button>
      {bloque && <p role="alert" className="text-xs text-[#F2A93B]">Le navigateur a bloqué la fenêtre d’impression : autorisez les fenêtres pour ce site, puis réessayez.</p>}
    </div>
  )
}
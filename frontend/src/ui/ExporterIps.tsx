import { useState } from 'react'
import { DownloadSimpleIcon } from '@phosphor-icons/react'
import type { Verified } from '../core'
import { telechargerIps } from '../patient/fhirIps'
import { FACILITIES } from './trust'

type Ok = Extract<Verified, { ok: true }>

/**
 * « Exporter pour un logiciel médical » : le résumé de la carte au format international FHIR IPS (fichier JSON),
 * fabriqué sur ce téléphone à partir de la carte vérifiée. Le nom n'y figure que si on le choisit.
 */
export function ExporterIps({ carte, nomParDefaut = '' }: { carte: Ok; nomParDefaut?: string }) {
  const [avecNom, setAvecNom] = useState(false)
  const [fait, setFait] = useState(false)
  const exporter = () => {
    telechargerIps(carte, { etablissements: FACILITIES, nom: avecNom ? nomParDefaut : '' })
    setFait(true)
  }
  return (
    <div className="space-y-3 text-sm text-[#F4F1EA]/65">
      <p>Pour le logiciel d’un hôpital ou d’un centre de santé : le résumé de la carte au format international <abbr title="Fast Healthcare Interoperability Resources, International Patient Summary">FHIR IPS</abbr>.</p>
      {nomParDefaut && (
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={avecNom} onChange={e => setAvecNom(e.target.checked)} />
          <span>Inclure le nom ({nomParDefaut}) <span className="text-[#F4F1EA]/45">: sinon, seul l’identifiant LAFIA y figure</span></span>
        </label>
      )}
      <button type="button" onClick={exporter} className="inline-flex items-center gap-2.5 rounded-full border border-white/15 px-5 py-2.5 text-[#F4F1EA]/85 hover:text-white">
        <DownloadSimpleIcon size={16} /> Exporter (FHIR IPS)
      </button>
      {fait && <p role="status" className="text-xs text-[#C8F3EE]">Fichier enregistré dans vos téléchargements. Il n’est pas signé : en cas de doute, c’est le QR de la carte qui fait foi.</p>}
    </div>
  )
}
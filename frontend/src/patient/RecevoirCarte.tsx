import { useState } from 'react'
import { verify, type C0Payload, type Registry } from '../core'
import { ScannerQr } from '../ui/ScannerQr'
import { estCarte } from '../ui/lecteurQr'
import { REGISTRY } from '../ui/trust'
import { champ } from '../ui/formulaire'
import { carteEnTexte, profilDepuisCarte } from './secours'
import type { ProfilSaisi } from './carte'

export type Reception = { ok: true; carte: string; payload: C0Payload } | { ok: false; erreur: string }

/**
 * Le soignant a signé une nouvelle carte sur SON téléphone et montre le QR ; le patient le scanne.
 * Acceptée seulement si : signature valide, MÊME identifiant que l'espace, et pas plus ancienne que la carte actuelle.
 * Ce n'est pas une prise d'identité : l'espace existe déjà, on ne fait que remplacer sa carte par une plus récente.
 */
export function accepterNouvelleCarte(saisie: string, registre: Registry, idPatient: string, carteActuelle: string, now?: number): Reception {
  if (!idPatient) return { ok: false, erreur: 'Créez d’abord votre espace.' }
  let carte: string
  try { carte = carteEnTexte(saisie) } catch { return { ok: false, erreur: 'Carte illisible.' } }
  const v = verify(carte, registre, now)
  if (!v.ok) return { ok: false, erreur: `Carte refusée : ${v.reason}` }
  if (v.payload.id !== idPatient) return { ok: false, erreur: 'Cette carte appartient à un autre patient : elle n’a pas été enregistrée.' }
  const actuelle = carteActuelle ? verify(carteActuelle, registre, now) : null
  if (actuelle?.ok && carte === carteActuelle) return { ok: false, erreur: 'C’est déjà votre carte actuelle.' }
  if (actuelle?.ok && v.payload.iat < actuelle.payload.iat) return { ok: false, erreur: 'Cette carte est plus ancienne que celle que vous avez déjà : elle n’a pas été enregistrée.' }
  return { ok: true, carte, payload: v.payload }
}

export function RecevoirCarte({ idPatient, carteActuelle, onRecue }: {
  idPatient: string
  carteActuelle: string
  onRecue: (texte: string, payload: C0Payload, profil: ProfilSaisi) => void
}) {
  const [scan, setScan] = useState(false)
  const [colle, setColle] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)

  const recevoir = (texte: string) => {
    const r = accepterNouvelleCarte(texte, REGISTRY, idPatient, carteActuelle)
    if (!r.ok) { setMessage({ ok: false, texte: r.erreur }); return }
    onRecue(r.carte, r.payload, profilDepuisCarte(r.payload.pr))
    setMessage({ ok: true, texte: 'Nouvelle carte enregistrée sur ce téléphone.' }); setColle('')
  }

  return (
    <div className="lg lg-panel space-y-3 p-5">
      <h3 className="font-display text-2xl font-light text-[#F4F1EA]">Recevoir ma nouvelle carte</h3>
      <p className="text-sm text-[#F4F1EA]/55">Le soignant a mis à jour votre carte sur son téléphone ? Scannez le QR qu’il vous montre.</p>
      {scan ? (
        <div>
          <ScannerQr accepte={estCarte} consigne="Le QR affiché par le soignant dans l’image." onLu={t => { setScan(false); recevoir(t) }} onErreur={m => { setScan(false); setMessage({ ok: false, texte: m }) }} />
          <button type="button" onClick={() => setScan(false)} className="mt-2 rounded-full border border-white/15 px-4 py-2 text-sm text-[#F4F1EA]/80">Arrêter la caméra</button>
        </div>
      ) : (
        <button type="button" onClick={() => { setMessage(null); setScan(true) }} className="rounded-full bg-[#4FB3AC] px-5 py-2.5 text-sm font-medium text-[#0A1615]">Scanner la nouvelle carte</button>
      )}
      <details className="text-xs text-[#F4F1EA]/50">
        <summary className="cursor-pointer">Pas de caméra ? Coller le texte ou le lien de la carte</summary>
        <textarea rows={2} value={colle} onChange={e => setColle(e.target.value)} className={`${champ} font-mono text-xs`} placeholder="L2:… ou https://…#L2B:…" />
        <button type="button" onClick={() => recevoir(colle)} className="mt-2 rounded-full border border-white/15 px-4 py-2 text-sm text-[#F4F1EA]/80">Enregistrer cette carte</button>
      </details>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-sm ${message.ok ? 'border border-[#4FB3AC]/40 bg-[#4FB3AC]/10 text-[#C8F3EE]' : 'border border-[#D9534A]/40 bg-[#D9534A]/10 text-[#FFB5AC]'}`}>{message.texte}</p>
      )}
    </div>
  )
}
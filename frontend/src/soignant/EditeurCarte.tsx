import { useState } from 'react'
import { CATALOG, SchemaError, type C0Payload, type Consultation } from '../core'
import { useBadge } from '../ui/BadgeContext'
import { ADMINISTRES, ALLERGENS, ANTECEDENTS, MOTIFS, ORIENT, TRAITEMENTS, label } from '../ui/labels'
import { Apercu, ChoixListe, Chip, champ } from '../ui/formulaire'
import { journal } from '../journal/usejournal'
import {
  CONSULTATION_VIDE, SaisieError, aDuContenu, construireCarte, construireConsultation, construireProfil, sensiblesDe, signerCarte,
  type ConsultationSaisie, type ProfilSaisi,
} from '../patient/carte'

/**
 * Mise à jour d'une carte par un soignant : profil d'urgence, nouvelle consultation, relecture, signature.
 * Partagé par « Ma carte » (téléphone du patient) et l'espace soignant (téléphone du soignant).
 *
 * Contrat : l'émission est inscrite au journal AVANT que la carte soit remise (entrée ECRITURE signée par le badge).
 * Si le journal est indisponible, la carte n'est pas émise : contrairement à une lecture d'urgence, une écriture
 * peut attendre.
 */
export function EditeurCarte({ profil, onProfil, consultations, patientId, onSigne }: {
  profil: ProfilSaisi
  onProfil: (p: ProfilSaisi) => void
  consultations: Consultation[]
  patientId: string
  onSigne: (texte: string, carte: C0Payload) => void
}) {
  const { badge } = useBadge()
  const [saisie, setSaisie] = useState<ConsultationSaisie>(CONSULTATION_VIDE)
  const [brouillon, setBrouillon] = useState<C0Payload | null>(null)
  const [relu, setRelu] = useState(false)
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const sensibles = sensiblesDe(profil)

  const s = (patch: Partial<ConsultationSaisie>) => { setSaisie({ ...saisie, ...patch }); setBrouillon(null) }
  const p = (patch: Partial<ProfilSaisi>) => { onProfil({ ...profil, ...patch }); setBrouillon(null) }

  const preparer = () => {
    setErreur(''); setRelu(false)
    try {
      if (!badge) throw new SaisieError('Chargez d’abord le badge du soignant qui relit et signe.')
      const now = Math.floor(Date.now() / 1000)
      const nouvelles = aDuContenu(saisie) ? [...consultations, construireConsultation(saisie, badge, now)] : consultations
      setBrouillon(construireCarte(patientId, construireProfil(profil), nouvelles, now))
    } catch (e) {
      setBrouillon(null)
      setErreur(e instanceof Error ? e.message : 'Saisie invalide.')
    }
  }

  const signer = async () => {
    if (!brouillon || !badge) return
    setEnCours(true)
    try {
      const texte = signerCarte(brouillon, badge)
      try {
        await journal.ajouterEntree({ action: 'ECRITURE', cible: brouillon.id, rubriques: ['C0'], etab: badge.etab, signataire: badge })
      } catch {
        setErreur('Journal indisponible sur cet appareil : la carte n’a pas été émise. Réessayez.')
        return
      }
      onSigne(texte, brouillon)
      setSaisie(CONSULTATION_VIDE); setBrouillon(null); setRelu(false); setErreur('')
    } catch (e) {
      setErreur(`Signature refusée : ${e instanceof SchemaError || e instanceof Error ? e.message : 'erreur inconnue'}`)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-5">
        <h4 className="text-xs uppercase tracking-[0.14em] text-[#F4F1EA]/50">Profil d’urgence</h4>
        <div className="flex flex-wrap items-end gap-6">
          <label className="text-sm text-[#F4F1EA]/65">
            Année de naissance
            <input inputMode="numeric" maxLength={4} value={profil.yb} onChange={e => p({ yb: e.target.value })} placeholder="1988" className={`${champ} w-28`} />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm text-[#F4F1EA]/65">Sexe</legend>
            <div className="flex gap-2">
              <Chip on={profil.sx === ''} onClick={() => p({ sx: '' })}>Non renseigné</Chip>
              <Chip on={profil.sx === 'F'} onClick={() => p({ sx: 'F' })}>Femme</Chip>
              <Chip on={profil.sx === 'M'} onClick={() => p({ sx: 'M' })}>Homme</Chip>
            </div>
          </fieldset>
        </div>
        <ChoixListe titre="Allergies" feminin tone="red" valeur={profil.al} onChange={al => p({ al })} catalogue={ALLERGENS} />
        <ChoixListe titre="Traitements au long cours" valeur={profil.tx} onChange={tx => p({ tx })} catalogue={TRAITEMENTS} />
        <ChoixListe titre="Maladies de fond / antécédents" valeur={profil.ah} onChange={ah => p({ ah })} catalogue={ANTECEDENTS} />
        {sensibles.length > 0 && (
          <label className="flex items-start gap-2 rounded-xl bg-[#F2A93B]/10 p-3 text-sm text-[#F2A93B]">
            <input type="checkbox" className="mt-1" checked={profil.accordSensible} onChange={e => p({ accordSensible: e.target.checked })} />
            Le patient accepte que « {sensibles.map(c => label(ANTECEDENTS, c)).join(', ')} » soit lisible par toute personne qui scanne sa carte.
          </label>
        )}
        <fieldset>
          <legend className="mb-2 text-sm text-[#F4F1EA]/65">Groupe sanguin</legend>
          <div className="flex flex-wrap gap-2">
            <Chip on={!profil.gs} onClick={() => p({ gs: '' })}>Non renseigné</Chip>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].filter(g => CATALOG.groupes.includes(g)).map(g => (
              <Chip key={g} tone="red" on={profil.gs === g} onClick={() => p({ gs: g })}>
                <span className="inline-block min-w-[2.2em] text-center text-sm font-semibold">{g}</span>
              </Chip>
            ))}
          </div>
          <span className="mt-2 block text-xs text-[#F4F1EA]/40">D’après un résultat fiable. Ne remplace jamais le contrôle prétransfusionnel.</span>
        </fieldset>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm text-[#F4F1EA]/65">Contact d’urgence<input maxLength={30} value={profil.ecNom} onChange={e => p({ ecNom: e.target.value })} placeholder="Nom" className={champ} /></label>
          <label className="text-sm text-[#F4F1EA]/65">Téléphone<input inputMode="tel" maxLength={19} value={profil.ecTel} onChange={e => p({ ecTel: e.target.value })} placeholder="+229 …" className={champ} /></label>
        </div>
      </section>

      <section className="space-y-4 border-t border-white/10 pt-5">
        <h4 className="text-xs uppercase tracking-[0.14em] text-[#F4F1EA]/50">Nouvelle consultation (facultatif)</h4>
        <div className="flex flex-wrap gap-2">
          {CATALOG.motifs.map(m => <Chip key={m} tone="amber" on={saisie.motif === m} onClick={() => s({ motif: saisie.motif === m ? '' : m })}>{label(MOTIFS, m)}</Chip>)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-[#F4F1EA]/55">Température (°C)<input inputMode="decimal" maxLength={5} value={saisie.temp} onChange={e => s({ temp: e.target.value })} placeholder="30 à 45" className={champ} /></label>
          <label className="text-sm text-[#F4F1EA]/55">Poids (kg)<input inputMode="decimal" maxLength={6} value={saisie.poids} onChange={e => s({ poids: e.target.value })} placeholder="0,5 à 300" className={champ} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#F4F1EA]/55">
          TDR paludisme :
          <Chip on={saisie.tdr === 'POS'} onClick={() => s({ tdr: saisie.tdr === 'POS' ? '' : 'POS' })}>Positif</Chip>
          <Chip on={saisie.tdr === 'NEG'} onClick={() => s({ tdr: saisie.tdr === 'NEG' ? '' : 'NEG' })}>Négatif</Chip>
        </div>
        <div>
          <p className="mb-2 text-sm text-[#F4F1EA]/55">Médicaments administrés</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ADMINISTRES).map(([c, l]) => <Chip key={c} on={saisie.meds.includes(c)} disabled={!saisie.meds.includes(c) && saisie.meds.length >= 4} onClick={() => s({ meds: saisie.meds.includes(c) ? saisie.meds.filter(x => x !== c) : [...saisie.meds, c] })}>{l}</Chip>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#F4F1EA]/55">
          Orientation :
          {CATALOG.orientations.map(o => <Chip key={o} on={saisie.orientation === o} onClick={() => s({ orientation: saisie.orientation === o ? '' : (o as ConsultationSaisie['orientation']) })}>{label(ORIENT, o)}</Chip>)}
        </div>
        <p className="text-xs text-[#F4F1EA]/40">La carte garde les 3 consultations les plus récentes. Champ vide = non inclus.</p>
      </section>

      {erreur && <p role="alert" className="text-sm text-[#FF8D82]">{erreur}</p>}
      <button onClick={preparer} className="rounded-full bg-[#F2A93B] px-5 py-2.5 text-sm font-medium text-[#0A1615] hover:bg-[#f5b85a]">Relire avant signature</button>

      {brouillon && (
        <div className="rounded-xl border border-[#F2A93B]/40 bg-black/15 p-4">
          <h4 className="mb-2 text-sm font-medium text-[#F4F1EA]">Ce qui sera signé</h4>
          <Apercu p={brouillon} />
          <label className="mt-4 flex items-start gap-2 text-sm text-[#F4F1EA]/80">
            <input type="checkbox" className="mt-1" checked={relu} onChange={e => setRelu(e.target.checked)} />
            J’ai relu ces informations et j’en assume la signature.
          </label>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setBrouillon(null)} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-[#F4F1EA]/70">Modifier</button>
            <button onClick={() => void signer()} disabled={!relu || !badge || enCours} className="rounded-full bg-[#F2A93B] px-3 py-1.5 text-xs font-medium text-[#0A1615] disabled:opacity-40">Signer la carte</button>
          </div>
        </div>
      )}
    </div>
  )
}
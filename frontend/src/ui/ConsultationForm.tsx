import { useState } from 'react'
import { CATALOG, SchemaError, newDraft, review, sign, type C0Payload, type Consultation, type Profile } from '../core'
import { useBadge } from './BadgeContext'
import { ALLERGENS, ANTECEDENTS, MOTIFS } from './labels'

export type ConsultationFormProps = {
  onSigned?: (text: string) => void
}

const randomId = () => 'p-' + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('')
const toggle = (list: string[], c: string) => (list.includes(c) ? list.filter(x => x !== c) : [...list, c])
const num = (s: string) => Number(s.replace(',', '.'))

/**
 * Saisie d'une consultation → brouillon → relu → signé (noyau v2).
 * Champ non coché = « non renseigné » (absent de la carte) ; « aucun(e) connu(e) » = liste vide déclarée.
 * Limite connue : la carte produite ne contient que cette consultation (pas de fusion avec la carte précédente).
 */
export default function ConsultationForm({ onSigned }: ConsultationFormProps) {
  const { badge } = useBadge()
  const [motif, setMotif] = useState('')
  const [allergies, setAllergies] = useState<string[]>([])
  const [aucuneAllergie, setAucuneAllergie] = useState(false)
  const [antecedents, setAntecedents] = useState<string[]>([])
  const [aucunAntecedent, setAucunAntecedent] = useState(false)
  const [temperature, setTemperature] = useState('')
  const [poids, setPoids] = useState('')
  const [accordSensible, setAccordSensible] = useState(false)
  const [relu, setRelu] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const sensibles = antecedents.filter(c => CATALOG.sensibles.includes(c))

  const handleSubmit = () => {
    setMessage(null)
    if (!badge) return setMessage({ ok: false, text: 'Chargez un badge de soignant pour signer la carte.' })
    if (!badge.etab) return setMessage({ ok: false, text: "Ce badge n'est rattaché à aucun établissement : signature impossible." })
    if (!motif) return setMessage({ ok: false, text: 'Choisissez un motif de consultation.' })
    if (sensibles.length && !accordSensible)
      return setMessage({ ok: false, text: 'Catégorie sensible cochée : le patient doit accepter explicitement qu’elle soit lisible en urgence.' })
    if (!relu) return setMessage({ ok: false, text: 'Relisez la saisie et cochez la case de relecture avant de signer.' })

    const now = Math.floor(Date.now() / 1000)
    const c: Consultation['c'] = {}
    if (temperature.trim()) c.temp = Math.round(num(temperature) * 10)
    if (poids.trim()) { c.poids = Math.round(num(poids) * 10); c.pt = now }

    const pr: Profile = {}
    if (aucuneAllergie) pr.al = []
    else if (allergies.length) pr.al = allergies
    if (aucunAntecedent) pr.ah = []
    else if (antecedents.length) pr.ah = antecedents
    if (sensibles.length) pr.vs = sensibles

    const consultation: Consultation = { t: now, f: badge.etab, a: badge.kid, m: motif, ...(Object.keys(c).length ? { c } : {}) }
    const payload: C0Payload = { v: 2, id: randomId(), iat: now, ...(Object.keys(pr).length ? { pr } : {}), co: [consultation] }

    try {
      const { text } = sign(review(newDraft(payload), badge.kid), badge)
      setMessage({ ok: true, text: 'Carte signée.' })
      onSigned?.(text)
    } catch (e) {
      const raison = e instanceof SchemaError || e instanceof Error ? e.message : 'erreur inconnue'
      setMessage({ ok: false, text: `Signature refusée : ${raison}` })
    }
  }

  const box = 'flex items-center gap-2'
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-800">Nouvelle consultation</h3>
      <div className="mt-4 space-y-4 text-sm text-slate-700">
        <label className="block">
          <span className="mb-1 block">Motif</span>
          <select value={motif} onChange={e => setMotif(e.target.value)} className="w-full rounded border border-slate-300 p-2">
            <option value="">— choisir —</option>
            {CATALOG.motifs.map(m => <option key={m} value={m}>{MOTIFS[m] ?? m}</option>)}
          </select>
        </label>

        <fieldset>
          <legend className="mb-1">Allergies</legend>
          <label className={box}><input type="checkbox" checked={aucuneAllergie} onChange={e => { setAucuneAllergie(e.target.checked); if (e.target.checked) setAllergies([]) }} /> Aucune allergie connue</label>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {Object.entries(ALLERGENS).map(([c, l]) => (
              <label key={c} className={box}><input type="checkbox" disabled={aucuneAllergie} checked={allergies.includes(c)} onChange={() => setAllergies(a => toggle(a, c))} /> {l}</label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1">Antécédents</legend>
          <label className={box}><input type="checkbox" checked={aucunAntecedent} onChange={e => { setAucunAntecedent(e.target.checked); if (e.target.checked) setAntecedents([]) }} /> Aucun antécédent connu</label>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {Object.entries(ANTECEDENTS).map(([c, l]) => (
              <label key={c} className={box}>
                <input type="checkbox" disabled={aucunAntecedent} checked={antecedents.includes(c)} onChange={() => setAntecedents(a => toggle(a, c))} /> {l}
                {CATALOG.sensibles.includes(c) && <span className="text-xs text-amber-700">(sensible)</span>}
              </label>
            ))}
          </div>
          {sensibles.length > 0 && (
            <label className={`${box} mt-2 rounded bg-amber-50 p-2 text-amber-900`}>
              <input type="checkbox" checked={accordSensible} onChange={e => setAccordSensible(e.target.checked)} />
              Le patient accepte que ces informations sensibles soient lisibles par toute personne qui scanne sa carte.
            </label>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block">Température (°C)</span>
            <input inputMode="decimal" value={temperature} onChange={e => setTemperature(e.target.value)} className="w-full rounded border border-slate-300 p-2" />
          </label>
          <label className="block">
            <span className="mb-1 block">Poids (kg)</span>
            <input inputMode="decimal" value={poids} onChange={e => setPoids(e.target.value)} className="w-full rounded border border-slate-300 p-2" />
          </label>
        </div>

        <label className={box}>
          <input type="checkbox" checked={relu} onChange={e => setRelu(e.target.checked)} />
          J’ai relu cette saisie et j’en assume la signature.
        </label>
      </div>

      {message && <p role={message.ok ? 'status' : 'alert'} className={`mt-4 text-sm ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.text}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        className="mt-5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!badge}
      >
        Signer la carte
      </button>
    </div>
  )
}

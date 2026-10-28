import { useEffect, useMemo, useState } from 'react'
import { CheckIcon, PillIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { verify } from '../core'
import { MEDS, label } from '../ui/labels'
import { REGISTRY } from '../ui/trust'
import { Chip, champ } from '../ui/formulaire'
import { Ecouter } from '../ui/Ecouter'
import { useDeviceState } from './store'
import {
  COULEURS, MOMENTS, RappelInvalide, annulerPrise, dosesDuJour, marquerPrise, nomAffiche, nouveauRappel, suiviSemaine, texteRappels,
  type Couleur, type Dose, type Prises, type Rappel,
} from './rappels'

/** L'heure courante, rafraîchie chaque minute : l'état des doses (« à prendre maintenant »…) suit la journée. */
function useMaintenant() {
  const [maintenant, setMaintenant] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setMaintenant(new Date()), 30_000); return () => clearInterval(t) }, [])
  return maintenant
}

const pastille = (c: Couleur, taille = 'h-5 w-5') => <span className={`inline-block ${taille} shrink-0 rounded-full border border-black/30`} style={{ background: COULEURS[c].hex }} aria-hidden />
/** « 08:00 » → « 8 h », « 19:30 » → « 19 h 30 » (lisible d'un coup d'œil). */
const hCourte = (h: string) => `${Number(h.slice(0, 2))} h${h.slice(3) === '00' ? '' : ` ${h.slice(3)}`}`
const hm = (s: number) => new Date(s * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

export function RappelsView() {
  const [rappels, setRappels] = useDeviceState<Rappel[]>('rappels-v1', [])
  const [prises, setPrises] = useDeviceState<Prises>('prises-v1', {})
  const [discret, setDiscret] = useDeviceState('rappels-discret', false)
  const [ajout, setAjout] = useState(false)
  const maintenant = useMaintenant()
  const doses = useMemo(() => dosesDuJour(rappels, prises, maintenant), [rappels, prises, maintenant])
  const semaine = useMemo(() => suiviSemaine(rappels, prises, maintenant), [rappels, prises, maintenant])

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-2xl font-light text-[#F4F1EA]">Aujourd’hui</h3>
          {rappels.length > 0 && <Ecouter phrases={texteRappels(doses, discret)} libelle="Écouter mes rappels" />}
        </div>
        {rappels.length === 0 ? (
          <p className="text-[15px] text-[#F4F1EA]/60">Aucun rappel pour l’instant. Ajoutez vos médicaments et leurs heures de prise.</p>
        ) : (
          <ol className="space-y-3">
            {doses.map(d => <LigneDose key={d.cle} d={d} discret={discret}
              onPris={() => setPrises(p => marquerPrise(p, d.cle))} onAnnuler={() => setPrises(p => annulerPrise(p, d.cle))} />)}
          </ol>
        )}
      </section>

      {rappels.length > 0 && <Semaine semaine={semaine} />}

      <section className="border-t border-white/10 pt-6">
        <h3 className="mb-3 font-display text-2xl font-light text-[#F4F1EA]">Mes médicaments</h3>
        <ul className="mb-4 divide-y divide-white/10">
          {rappels.map(r => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-3">
              <span className="flex items-center gap-3 text-[#F4F1EA]">
                {pastille(r.couleur)}
                <span>{nomAffiche(r, discret)} <span className="text-sm text-[#F4F1EA]/50">· {r.heures.map(hCourte).join(', ')}</span></span>
              </span>
              <button type="button" onClick={() => setRappels(rs => rs.filter(x => x.id !== r.id))} aria-label={`Supprimer le rappel ${nomAffiche(r, discret)}`}
                className="rounded-full p-2 text-[#F4F1EA]/50 hover:text-[#FF8D82]"><TrashIcon size={18} /></button>
            </li>
          ))}
        </ul>
        {ajout
          ? <AjoutRappel existants={rappels} onAjoute={r => { setRappels(rs => [...rs, r]); setAjout(false) }} onAnnule={() => setAjout(false)} />
          : <button type="button" onClick={() => setAjout(true)} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#F4F1EA] px-5 py-2.5 text-sm font-medium text-[#0A1615]"><PlusIcon size={16} /> Ajouter un médicament</button>}
        <label className="mt-6 flex items-start gap-2 text-sm text-[#F4F1EA]/65">
          <input type="checkbox" className="mt-1" checked={discret} onChange={e => setDiscret(e.target.checked)} />
          <span>Mode discret : n’afficher que la couleur (« Médicament bleu »), pas le nom, si d’autres personnes voient votre écran.</span>
        </label>
      </section>

      <p className="text-sm text-[#F4F1EA]/40">
        Vos rappels restent sur ce téléphone. Ouvrez LAFIA pour les voir : le téléphone ne sonne pas encore quand l’appli est fermée.
        Les rappels par SMS (sans jamais nommer la maladie ni le médicament) viendront avec le serveur.
      </p>
    </div>
  )
}

function LigneDose({ d, discret, onPris, onAnnuler }: { d: Dose; discret: boolean; onPris: () => void; onAnnuler: () => void }) {
  const style = {
    pris: 'border-[#4FB3AC]/40 bg-[#4FB3AC]/10',
    maintenant: 'border-[#F2A93B]/70 bg-[#F2A93B]/15',
    a_venir: 'border-white/10 bg-white/5',
    oubliee: 'border-[#D9534A]/50 bg-[#D9534A]/10',
  }[d.etat]
  const etat = { pris: `Pris à ${d.prisA ? hm(d.prisA) : ''}`, maintenant: 'À prendre maintenant', a_venir: 'Plus tard', oubliee: 'L’heure est passée' }[d.etat]
  return (
    <li className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${style}`} data-etat={d.etat}>
      <div className="flex items-center gap-4">
        <span className="min-w-[4.5rem] whitespace-nowrap font-display text-3xl font-light tabular-nums text-[#F4F1EA]">{hCourte(d.heure)}</span>
        <div>
          <p className="flex items-center gap-2 text-[17px] text-[#F4F1EA]">{pastille(d.rappel.couleur)} {nomAffiche(d.rappel, discret)}</p>
          <p className={`text-sm ${d.etat === 'pris' ? 'text-[#C8F3EE]' : d.etat === 'maintenant' ? 'text-[#F2A93B]' : d.etat === 'oubliee' ? 'text-[#FFB5AC]' : 'text-[#F4F1EA]/50'}`}>{etat}</p>
        </div>
      </div>
      {d.etat === 'pris'
        ? <button type="button" onClick={onAnnuler} className="text-sm text-[#F4F1EA]/50 underline underline-offset-4">Annuler</button>
        : <button type="button" onClick={onPris} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#4FB3AC] px-5 py-2.5 text-[15px] font-medium text-[#0A1615]"><CheckIcon size={18} weight="bold" /> Je l’ai pris</button>}
    </li>
  )
}

function Semaine({ semaine }: { semaine: { jour: string; prevues: number; prises: number }[] }) {
  const prevues = semaine.reduce((n, j) => n + j.prevues, 0)
  const prises = semaine.reduce((n, j) => n + j.prises, 0)
  const nomJour = (j: string) => new Date(`${j}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')
  return (
    <section>
      <h3 className="mb-1 text-xs uppercase tracking-[0.14em] text-[#F4F1EA]/50">Ces 7 jours</h3>
      <p className="mb-4 text-[15px] text-[#F4F1EA]/75">{prevues === 0 ? 'Pas encore de prise prévue.' : `${prises} prise${prises > 1 ? 's' : ''} sur ${prevues}.`}</p>
      <ol className="flex gap-2" aria-label="Prises des 7 derniers jours">
        {semaine.map(j => {
          const etat = j.prevues === 0 ? 'vide' : j.prises === j.prevues ? 'tout' : j.prises === 0 ? 'rien' : 'partiel'
          const fond = { vide: 'border-white/10', tout: 'border-[#4FB3AC] bg-[#4FB3AC]', partiel: 'border-[#F2A93B] bg-[#F2A93B]/40', rien: 'border-[#D9534A]' }[etat]
          return (
            <li key={j.jour} className="flex flex-col items-center gap-1" title={`${j.prises} sur ${j.prevues}`}>
              <span className={`h-8 w-8 rounded-full border-2 ${fond}`} aria-label={`${nomJour(j.jour)} : ${j.prises} sur ${j.prevues}`} />
              <span className="text-[11px] text-[#F4F1EA]/45">{nomJour(j.jour)}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function AjoutRappel({ existants, onAjoute, onAnnule }: { existants: Rappel[]; onAjoute: (r: Rappel) => void; onAnnule: () => void }) {
  const [carte] = useDeviceState('c0-carte', '')
  const traitementsCarte = useMemo(() => {
    if (!carte) return []
    const v = verify(carte, REGISTRY)
    return v.ok ? (v.payload.pr?.tx ?? []).map(t => ({ code: t.c, nom: label(MEDS, t.c) })) : []
  }, [carte])
  const [choix, setChoix] = useState<{ code?: string; nom: string } | null>(null)
  const [autre, setAutre] = useState('')
  const [couleur, setCouleur] = useState<Couleur>('blanc')
  const [heures, setHeures] = useState<string[]>([])
  const [heureLibre, setHeureLibre] = useState('')
  const [erreur, setErreur] = useState('')

  const basculerHeure = (h: string) => setHeures(hs => (hs.includes(h) ? hs.filter(x => x !== h) : [...hs, h]))
  const enregistrer = () => {
    try {
      const nom = choix?.code ? choix.nom : autre
      onAjoute(nouveauRappel({ nom, code: choix?.code, couleur, heures }, existants))
    } catch (e) {
      setErreur(e instanceof RappelInvalide ? e.message : 'Rappel impossible à enregistrer.')
    }
  }

  return (
    <div className="space-y-5 rounded-2xl border border-white/10 bg-white/5 p-5">
      <fieldset>
        <legend className="mb-2 flex items-center gap-2 text-sm text-[#F4F1EA]/65"><PillIcon size={16} /> Quel médicament ?</legend>
        <div className="flex flex-wrap gap-2">
          {traitementsCarte.map(t => <Chip key={t.code} on={choix?.code === t.code} onClick={() => { setChoix(t); setErreur('') }}>{t.nom}</Chip>)}
          <Chip on={choix !== null && !choix.code} onClick={() => { setChoix({ nom: '' }); setErreur('') }}>Autre médicament</Chip>
        </div>
        {traitementsCarte.length > 0 && <p className="mt-2 text-xs text-[#F4F1EA]/40">Les premiers viennent de votre carte, signée par un soignant.</p>}
        {choix !== null && !choix.code && (
          <input value={autre} maxLength={40} onChange={e => setAutre(e.target.value)} placeholder="Nom, ou ce qui vous aide à le reconnaître" className={`${champ} max-w-sm`} />
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm text-[#F4F1EA]/65">Sa couleur (pour le reconnaître sans lire)</legend>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(COULEURS) as Couleur[]).map(c => (
            <button key={c} type="button" onClick={() => setCouleur(c)} aria-pressed={couleur === c} aria-label={`Couleur ${COULEURS[c].nom}`}
              className={`rounded-full p-1 ${couleur === c ? 'ring-2 ring-[#F4F1EA]' : ''}`}>{pastille(c, 'h-9 w-9')}</button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm text-[#F4F1EA]/65">À quelles heures ?</legend>
        <div className="flex flex-wrap items-center gap-2">
          {MOMENTS.map(m => <Chip key={m.heure} on={heures.includes(m.heure)} onClick={() => basculerHeure(m.heure)}>{m.nom} · {hCourte(m.heure)}</Chip>)}
          {heures.filter(h => !MOMENTS.some(m => m.heure === h)).map(h => <Chip key={h} on onClick={() => basculerHeure(h)}>{hCourte(h)}</Chip>)}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input type="time" value={heureLibre} onChange={e => setHeureLibre(e.target.value)} aria-label="Autre heure" className={`${champ} mt-0 w-36`} />
          <button type="button" disabled={!heureLibre} onClick={() => { if (heureLibre && !heures.includes(heureLibre)) setHeures(hs => [...hs, heureLibre]); setHeureLibre('') }}
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-[#F4F1EA]/80 disabled:opacity-40">Ajouter cette heure</button>
        </div>
      </fieldset>

      {erreur && <p role="alert" className="text-sm text-[#FF8D82]">{erreur}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={enregistrer} className="min-h-12 rounded-full bg-[#F2A93B] px-5 py-2.5 text-sm font-medium text-[#0A1615]">Enregistrer le rappel</button>
        <button type="button" onClick={onAnnule} className="rounded-full border border-white/15 px-4 py-2 text-sm text-[#F4F1EA]/70">Annuler</button>
      </div>
    </div>
  )
}
import { useCallback, useEffect, useRef, useState } from 'react'
import { LockKeyIcon, LockOpenIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { Chip, champ } from '../ui/formulaire'
import { useDeviceState } from './store'
import {
  AUCUN_ESSAI, CATEGORIES, CLE_ESSAIS, CodeInvalide, ITERATIONS, RX_CODE, apresEchec, codeTropSimple, ecrireCoffre, fermer, lireCoffre, ouvrir,
  type ContenuSensible, type Essais,
} from './sensible'

const VERROU_AUTO_MS = 2 * 60_000

/**
 * Compartiment sensible (étape A) : créé, ouvert et modifié par le patient seul, avec son code, sur ce téléphone.
 * Il se referme tout seul après 2 minutes sans toucher, ou dès qu'on quitte l'application.
 */
export function CompartimentSensible({ iterations = ITERATIONS }: { iterations?: number }) {
  const [coffre, setCoffre] = useState(() => lireCoffre())
  const [contenu, setContenu] = useState<ContenuSensible | null>(null)
  const code = useRef('')
  const [essais, setEssais] = useDeviceState<Essais>(CLE_ESSAIS.replace('lafia:', ''), AUCUN_ESSAI)
  const minuteur = useRef<ReturnType<typeof setTimeout>>()

  const verrouiller = useCallback(() => { code.current = ''; setContenu(null) }, [])
  const relancerMinuteur = useCallback(() => {
    clearTimeout(minuteur.current)
    minuteur.current = setTimeout(verrouiller, VERROU_AUTO_MS)
  }, [verrouiller])

  useEffect(() => {
    if (!contenu) return
    relancerMinuteur()
    const cache = () => { if (document.visibilityState === 'hidden') verrouiller() }
    document.addEventListener('visibilitychange', cache)
    addEventListener('pointerdown', relancerMinuteur)
    return () => { clearTimeout(minuteur.current); document.removeEventListener('visibilitychange', cache); removeEventListener('pointerdown', relancerMinuteur) }
  }, [contenu, relancerMinuteur, verrouiller])

  const enregistrer = async (c: ContenuSensible) => {
    const nouveau = await fermer(c, code.current, iterations)
    ecrireCoffre(nouveau); setCoffre(nouveau); setContenu(c)
  }

  if (!coffre) return <Creation iterations={iterations} onCree={(c, k) => { code.current = k; ecrireCoffre(c); setCoffre(c); setContenu({ v: 1, elements: [], maj: Date.now() }) }} />
  if (!contenu) {
    return <Ouverture essais={essais}
      onCode={async k => {
        try {
          const c = await ouvrir(coffre, k)
          code.current = k; setEssais(AUCUN_ESSAI); setContenu(c); return ''
        } catch (e) {
          if (!(e instanceof CodeInvalide)) throw e
          const n = apresEchec(essais); setEssais(n)
          return n.jusqua > Date.now() ? 'Code incorrect. Trop d’essais : attendez avant de réessayer.' : `Code incorrect (${n.faux} essai${n.faux > 1 ? 's' : ''}).`
        }
      }}
      onOublie={() => { ecrireCoffre(null); setCoffre(null); setEssais(AUCUN_ESSAI) }} />
  }
  return <Contenu contenu={contenu} onChange={enregistrer} onVerrouiller={verrouiller}
    onChangerCode={async nouveau => { code.current = nouveau; await enregistrer(contenu) }} />
}

/* ---------- création ---------- */

function Creation({ iterations, onCree }: { iterations: number; onCree: (coffre: NonNullable<ReturnType<typeof lireCoffre>>, code: string) => void }) {
  const [ouvert, setOuvert] = useState(false)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const creer = async () => {
    if (!RX_CODE.test(a)) return setErreur('Le code fait de 4 à 6 chiffres.')
    if (codeTropSimple(a)) return setErreur('Code trop facile à deviner (1234, 0000, une année…). Choisissez-en un autre.')
    if (a !== b) return setErreur('Les deux codes ne sont pas les mêmes.')
    setEnCours(true)
    try { onCree(await fermer({ v: 1, elements: [], maj: Date.now() }, a, iterations), a) } finally { setEnCours(false) }
  }
  if (!ouvert) {
    return (
      <div className="space-y-3 text-[15px] text-[#F4F1EA]/65">
        <p>Ce que vous ne voulez pas montrer à tout le monde. Chiffré sur ce téléphone : seul votre code l’ouvre, même sans réseau.</p>
        <button type="button" onClick={() => setOuvert(true)} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#F4F1EA] px-5 py-2.5 text-sm font-medium text-[#0A1615]"><LockKeyIcon size={16} /> Créer mon compartiment sensible</button>
      </div>
    )
  }
  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-[15px] text-[#F4F1EA]">Choisissez un code de 4 à 6 chiffres.</p>
      <p className="rounded-xl border border-[#F2A93B]/40 bg-[#F2A93B]/10 px-3 py-2 text-sm text-[#F2A93B]">
        Retenez-le bien : si vous l’oubliez, personne ne pourra ouvrir ce compartiment, pas même LAFIA. Ne le donnez à personne.
      </p>
      <div className="grid max-w-sm grid-cols-2 gap-3">
        <label className="text-sm text-[#F4F1EA]/65">Code<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={a} onChange={e => setA(e.target.value.replace(/\D/g, ''))} className={`${champ} text-center text-2xl tracking-[0.4em]`} /></label>
        <label className="text-sm text-[#F4F1EA]/65">Encore une fois<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={b} onChange={e => setB(e.target.value.replace(/\D/g, ''))} className={`${champ} text-center text-2xl tracking-[0.4em]`} /></label>
      </div>
      {erreur && <p role="alert" className="text-sm text-[#FF8D82]">{erreur}</p>}
      <button type="button" disabled={enCours} onClick={() => void creer()} className="min-h-12 rounded-full bg-[#F2A93B] px-5 py-2.5 text-sm font-medium text-[#0A1615] disabled:opacity-50">{enCours ? 'Chiffrement…' : 'Créer avec ce code'}</button>
    </div>
  )
}

/* ---------- ouverture ---------- */

function Ouverture({ essais, onCode, onOublie }: { essais: Essais; onCode: (code: string) => Promise<string>; onOublie: () => void }) {
  const [k, setK] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [maintenant, setMaintenant] = useState(Date.now())
  const [oubli, setOubli] = useState(false)
  const bloque = essais.jusqua > maintenant
  useEffect(() => { if (!bloque) return; const t = setInterval(() => setMaintenant(Date.now()), 1000); return () => clearInterval(t) }, [bloque])

  const valider = async () => {
    if (bloque || !RX_CODE.test(k)) return
    setEnCours(true)
    try { setErreur(await onCode(k)); setK(''); setMaintenant(Date.now()) } finally { setEnCours(false) }
  }
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-[15px] text-[#F4F1EA]/70"><LockKeyIcon size={18} /> Fermé. Entrez votre code pour l’ouvrir.</p>
      <div className="flex flex-wrap items-end gap-3">
        <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={k} aria-label="Votre code"
          onChange={e => setK(e.target.value.replace(/\D/g, ''))} onKeyDown={e => { if (e.key === 'Enter') void valider() }}
          disabled={bloque} className={`${champ} mt-0 w-44 text-center text-2xl tracking-[0.4em]`} />
        <button type="button" disabled={bloque || enCours || !RX_CODE.test(k)} onClick={() => void valider()} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#4FB3AC] px-5 py-2.5 text-sm font-medium text-[#0A1615] disabled:opacity-40">
          <LockOpenIcon size={16} /> {enCours ? 'Ouverture…' : 'Ouvrir'}
        </button>
      </div>
      {bloque && <p role="alert" className="text-sm text-[#F2A93B]">Trop d’essais. Réessayez dans {Math.ceil((essais.jusqua - maintenant) / 1000)} s.</p>}
      {!bloque && erreur && <p role="alert" className="text-sm text-[#FF8D82]">{erreur}</p>}
      {!oubli ? (
        <button type="button" onClick={() => setOubli(true)} className="text-xs text-[#F4F1EA]/45 underline underline-offset-4">Code oublié ?</button>
      ) : (
        <div className="rounded-xl border border-[#D9534A]/40 bg-[#D9534A]/10 p-4 text-sm text-[#FFB5AC]">
          <p>Sans le code, le contenu ne peut pas être ouvert. Vous pouvez seulement tout effacer et recommencer avec un nouveau code.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onOublie} className="rounded-full bg-[#D9534A] px-4 py-2 text-sm font-medium text-white">Tout effacer</button>
            <button type="button" onClick={() => setOubli(false)} className="rounded-full border border-white/15 px-4 py-2 text-sm text-[#F4F1EA]/70">Annuler</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- contenu ouvert ---------- */

function Contenu({ contenu, onChange, onVerrouiller, onChangerCode }: {
  contenu: ContenuSensible; onChange: (c: ContenuSensible) => Promise<void>; onVerrouiller: () => void; onChangerCode: (code: string) => Promise<void>
}) {
  const [ajout, setAjout] = useState(false)
  const [cat, setCat] = useState('')
  const [note, setNote] = useState('')
  const [depuis, setDepuis] = useState('')
  const [changer, setChanger] = useState(false)
  const [nouveau, setNouveau] = useState('')
  const [message, setMessage] = useState('')

  const ajouter = async () => {
    if (!cat) return setMessage('Choisissez de quoi il s’agit.')
    const el = { id: crypto.randomUUID(), code: cat, ...(note.trim() ? { note: note.trim().slice(0, 200) } : {}), ...(depuis.trim() ? { depuis: depuis.trim().slice(0, 20) } : {}) }
    await onChange({ ...contenu, elements: [...contenu.elements, el], maj: Date.now() })
    setAjout(false); setCat(''); setNote(''); setDepuis(''); setMessage('')
  }
  const changerCode = async () => {
    if (!RX_CODE.test(nouveau) || codeTropSimple(nouveau)) return setMessage('Nouveau code : 4 à 6 chiffres, pas trop facile à deviner.')
    await onChangerCode(nouveau); setChanger(false); setNouveau(''); setMessage('Code changé.')
  }

  return (
    <div className="space-y-5" data-testid="sensible-ouvert">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[15px] text-[#C8F3EE]"><LockOpenIcon size={18} /> Ouvert. Il se refermera seul dans 2 minutes sans toucher.</p>
        <button type="button" onClick={onVerrouiller} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#F4F1EA] px-5 py-2.5 text-sm font-medium text-[#0A1615]"><LockKeyIcon size={16} /> Refermer</button>
      </div>
      {contenu.elements.length === 0 ? (
        <p className="text-sm text-[#F4F1EA]/55">Rien pour l’instant.</p>
      ) : (
        <ul className="divide-y divide-white/10">
          {contenu.elements.map(e => (
            <li key={e.id} className="flex items-start justify-between gap-3 py-4">
              <div>
                <p className="text-lg text-[#F4F1EA]">{CATEGORIES[e.code] ?? e.code}{e.depuis ? <span className="text-sm text-[#F4F1EA]/50"> · depuis {e.depuis}</span> : null}</p>
                {e.note && <p className="mt-1 text-[15px] text-[#F4F1EA]/70">{e.note}</p>}
                <p className="mt-1 text-xs text-[#F4F1EA]/40">Déclaré par vous, non vérifié par un soignant.</p>
              </div>
              <button type="button" aria-label={`Retirer ${CATEGORIES[e.code] ?? e.code}`} onClick={() => void onChange({ ...contenu, elements: contenu.elements.filter(x => x.id !== e.id), maj: Date.now() })}
                className="rounded-full p-2 text-[#F4F1EA]/50 hover:text-[#FF8D82]"><TrashIcon size={18} /></button>
            </li>
          ))}
        </ul>
      )}
      {ajout ? (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap gap-2">{Object.entries(CATEGORIES).map(([c, l]) => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{l}</Chip>)}</div>
          <label className="block text-sm text-[#F4F1EA]/65">Précision (facultatif)<input value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="Traitement, médecin qui vous suit…" className={champ} /></label>
          <label className="block text-sm text-[#F4F1EA]/65">Depuis (facultatif)<input value={depuis} maxLength={20} onChange={e => setDepuis(e.target.value)} placeholder="2019" className={`${champ} max-w-[10rem]`} /></label>
          <div className="flex gap-2">
            <button type="button" onClick={() => void ajouter()} className="min-h-12 rounded-full bg-[#F2A93B] px-5 py-2.5 text-sm font-medium text-[#0A1615]">Enregistrer</button>
            <button type="button" onClick={() => setAjout(false)} className="rounded-full border border-white/15 px-4 py-2 text-sm text-[#F4F1EA]/70">Annuler</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAjout(true)} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm text-[#F4F1EA]/85"><PlusIcon size={16} /> Ajouter</button>
      )}
      {message && <p role="status" className="text-sm text-[#F2A93B]">{message}</p>}
      <div className="space-y-2 border-t border-white/10 pt-4 text-sm text-[#F4F1EA]/55">
        <p>Pour qu’un soignant le voie en urgence, demandez-lui de l’ajouter à votre carte : il vous demandera votre accord.</p>
        {changer ? (
          <div className="flex flex-wrap items-center gap-2">
            <input type="password" inputMode="numeric" maxLength={6} value={nouveau} aria-label="Nouveau code" onChange={e => setNouveau(e.target.value.replace(/\D/g, ''))} className={`${champ} mt-0 w-36 text-center text-xl tracking-[0.3em]`} />
            <button type="button" onClick={() => void changerCode()} className="rounded-full border border-white/15 px-4 py-2 text-[#F4F1EA]/85">Changer</button>
          </div>
        ) : (
          <button type="button" onClick={() => setChanger(true)} className="underline underline-offset-4">Changer mon code</button>
        )}
      </div>
    </div>
  )
}
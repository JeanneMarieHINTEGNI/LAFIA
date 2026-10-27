import { useState } from 'react'
import QrCode from '../ui/QrCode'
import { REGISTRY } from '../ui/trust'
import { adopterIdentite, enregistrerPatient, jetonPatient, verifierJeton } from '../journal/sync'
import { codeSecours, enregistrerCarteRestauree, lireCodeSecours, restaurerCarte } from './secours'

const champ = 'mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-[#F4F1EA] outline-none focus:border-[#4FB3AC]'
const bouton = 'rounded-full border border-white/15 px-4 py-2 text-sm text-[#F4F1EA]/85 hover:border-[#4FB3AC] hover:text-[#F4F1EA]'

/** Dans l'espace patient : afficher le code de secours, à garder pour un futur téléphone. */
export function SauvegardeSecours({ id }: { id: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [copie, setCopie] = useState(false)

  const afficher = async () => {
    void enregistrerPatient(id)            // le code ne vaut que si l'identifiant est réservé au serveur
    setCode(await codeSecours(id, jetonPatient()))
  }
  const copier = async () => {
    if (!code) return
    try { await navigator.clipboard.writeText(code); setCopie(true) } catch { setCopie(false) }
  }

  return (
    <div className="text-sm leading-relaxed">
      <p className="mb-2 text-[#F4F1EA]/70">Changer de téléphone</p>
      <p className="text-[#F4F1EA]/45">
        Gardez votre code de secours (photo rangée ou papier). Sur un nouveau téléphone, il redonne l’accès à votre journal.
        Il ne contient aucune donnée médicale. Votre carte se récupère depuis sa version imprimée.
      </p>
      {!code ? (
        <button type="button" onClick={afficher} className={`mt-3 ${bouton}`}>Afficher mon code de secours</button>
      ) : (
        <div className="mt-4 space-y-3">
          <QrCode text={code} size={220} />
          <p className="break-all rounded-lg border border-white/10 bg-black/20 p-2 font-mono text-xs text-[#F4F1EA]/85" data-testid="code-secours">{code}</p>
          <p className="text-xs text-[#F2A93B]">Comme un mot de passe : ne le montrez à personne.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copier} className={bouton}>{copie ? 'Copié' : 'Copier'}</button>
            <button type="button" onClick={() => { setCode(null); setCopie(false) }} className={bouton}>Masquer</button>
          </div>
        </div>
      )}
    </div>
  )
}

export type Restauration = { id: string; avecJournal: boolean; avecCarte: boolean; anneeNaissance?: string }

/** À la création de l'espace sur un nouveau téléphone : reprendre l'identifiant (code de secours) et/ou la carte signée. */
export function RestaurerEspace({ onRestaure }: { onRestaure: (r: Restauration) => void }) {
  const [ouvert, setOuvert] = useState(false)
  const [code, setCode] = useState('')
  const [carte, setCarte] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)

  const restaurer = async () => {
    setErreur('')
    if (!code.trim() && !carte.trim()) { setErreur('Collez votre code de secours, votre carte, ou les deux.'); return }
    setEnCours(true)
    try {
      const lu = code.trim() ? await lireCodeSecours(code) : null
      if (lu && !lu.ok) { setErreur(lu.erreur); return }
      const rc = carte.trim() ? restaurerCarte(carte, REGISTRY, lu?.ok ? lu.id : undefined) : null
      if (rc && !rc.ok) { setErreur(rc.erreur); return }
      if (lu?.ok) {
        const v = await verifierJeton(lu.id, lu.jeton)
        if (v === 'refuse') { setErreur('Le serveur ne reconnaît pas ce code de secours pour cet identifiant.'); return }
        if (v === 'injoignable') { setErreur('Pas de connexion au serveur : la vérification du code demande le réseau. Réessayez une fois connecté.'); return }
      }
      // Tout est vérifié : on écrit, et seulement maintenant.
      if (lu?.ok) adopterIdentite(lu.id, lu.jeton)
      if (rc?.ok) enregistrerCarteRestauree(rc.carte, rc.payload)
      const id = lu?.ok ? lu.id : rc && rc.ok ? rc.payload.id : ''
      const yb = rc?.ok ? rc.payload.pr?.yb : undefined
      onRestaure({ id, avecJournal: Boolean(lu?.ok), avecCarte: Boolean(rc?.ok), anneeNaissance: yb ? String(yb) : undefined })
      setOuvert(false)
    } finally {
      setEnCours(false)
    }
  }

  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className="text-sm text-[#4FB3AC] underline-offset-4 hover:underline">
        J’avais déjà un espace sur un autre téléphone
      </button>
    )
  }
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-4 text-sm text-[#F4F1EA]/65">
      <p className="text-[#F4F1EA]/85">Retrouver votre espace</p>
      <label className="mt-3 block">
        Code de secours
        <textarea rows={2} value={code} onChange={e => setCode(e.target.value)} className={champ} placeholder="LAFIA-SECOURS:p-…" />
      </label>
      <label className="mt-3 block">
        Votre carte (texte « L2:… » ou lien), facultatif
        <textarea rows={2} value={carte} onChange={e => setCarte(e.target.value)} className={champ} placeholder="L2:… ou https://…#L2B:…" />
      </label>
      <p className="mt-2 text-xs text-[#F4F1EA]/45">Sans code de secours, la carte suffit pour continuer, mais le journal enregistré sur le serveur restera sur l’ancien téléphone.</p>
      {erreur && <p role="alert" className="mt-3 rounded-lg border border-[#D9534A]/40 bg-[#D9534A]/10 px-3 py-2 text-[#FFB5AC]">{erreur}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={enCours} onClick={restaurer} className="rounded-full bg-[#4FB3AC] px-4 py-2 text-sm font-medium text-[#0A1615] disabled:opacity-50">
          {enCours ? 'Vérification…' : 'Vérifier et restaurer'}
        </button>
        <button type="button" onClick={() => setOuvert(false)} className={bouton}>Annuler</button>
      </div>
    </div>
  )
}
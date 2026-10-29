import { useRef, useState } from 'react'
import { useBadge } from './BadgeContext'
import { AUTORITE_DEMO, FACILITIES } from './trust'

/**
 * Charge un badge soignant depuis son fichier JSON ({ kid, seed }). La clé reste en mémoire de session :
 * elle disparaît au rechargement de la page. Le rôle affiché vient du registre, jamais du fichier.
 */
export function BadgeLoader() {
  const { badge, roleLabel, loadBadge, clearBadge } = useBadge()
  const [erreur, setErreur] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const lire = async (f: File | undefined) => {
    setErreur('')
    if (!f) return
    try {
      const r = loadBadge(JSON.parse(await f.text()))
      if (!r.ok) setErreur(r.message)
    } catch {
      setErreur('Fichier de badge illisible (JSON attendu).')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  if (badge) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#4FB3AC]/40 bg-[#4FB3AC]/10 px-4 py-3 text-sm text-[#C8F3EE]">
        <span>
          Badge chargé : <strong>{badge.label ?? badge.kid}</strong> · {roleLabel}
          {badge.etab ? ` · ${FACILITIES[badge.etab] ?? `établissement ${badge.etab}`}` : ''}
        </span>
        <button type="button" onClick={clearBadge} className="text-xs uppercase tracking-[0.12em] text-[#F4F1EA]/70 hover:text-[#F4F1EA]">Retirer</button>
      </div>
    )
  }

  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-[#F4F1EA]/85 hover:bg-white/10">
        Charger un badge soignant (.json)
        <input ref={input} type="file" accept="application/json,.json" className="sr-only" onChange={e => void lire(e.target.files?.[0])} />
      </label>
      <p className="mt-2 text-xs text-[#F4F1EA]/40">
        {AUTORITE_DEMO ? <>Démonstration : fichiers de <code>demo/secrets/</code>. </> : <>Le fichier de badge remis par votre autorité. </>}
        Seul un badge inscrit au registre peut signer.
      </p>
      {erreur && <p role="alert" className="mt-2 text-sm text-[#FF8D82]">{erreur}</p>}
    </div>
  )
}
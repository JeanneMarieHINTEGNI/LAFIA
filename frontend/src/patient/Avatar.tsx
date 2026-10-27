import { useRef, useState } from 'react'
import { CameraIcon } from '@phosphor-icons/react'
import { PhotoError, preparerPhoto } from './photo'

export const CLE_PHOTO = 'patient-photo'

const initiales = (nom: string) => nom.trim().split(/\s+/).slice(0, 2).map(m => m[0]?.toUpperCase() ?? '').join('') || '?'

/** Photo du patient, ou ses initiales s'il n'en a pas mis. */
export function Avatar({ photo, nom, taille = 48, className = '' }: { photo: string; nom: string; taille?: number; className?: string }) {
  const style = { width: taille, height: taille }
  return photo ? (
    <img src={photo} alt={`Photo de ${nom || 'le patient'}`} style={style} className={`shrink-0 rounded-full object-cover ring-1 ring-white/20 ${className}`} />
  ) : (
    <span style={{ ...style, fontSize: taille * 0.38 }} aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-[#4FB3AC]/20 font-medium text-[#C8F3EE] ring-1 ring-white/15 ${className}`}>
      {initiales(nom)}
    </span>
  )
}

/** Choix de la photo : appareil photo frontal sur téléphone, ou fichier sur ordinateur. */
export function ChoixPhoto({ photo, nom, onChange, taille = 112 }: { photo: string; nom: string; onChange: (p: string) => void; taille?: number }) {
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const lire = async (f: File | undefined) => {
    setErreur('')
    if (!f) return
    setEnCours(true)
    try {
      onChange(await preparerPhoto(f))
    } catch (e) {
      setErreur(e instanceof PhotoError ? e.message : 'La photo n’a pas pu être préparée.')
    } finally {
      setEnCours(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-5">
      <Avatar photo={photo} nom={nom} taille={taille} />
      <div className="space-y-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-[#F4F1EA]/85 hover:bg-white/10">
          <CameraIcon size={16} weight="light" />
          {enCours ? 'Préparation…' : photo ? 'Changer la photo' : 'Prendre ou choisir une photo'}
          <input ref={input} type="file" accept="image/*" capture="user" className="sr-only" disabled={enCours} onChange={e => void lire(e.target.files?.[0])} />
        </label>
        {photo && (
          <button type="button" onClick={() => onChange('')} className="block text-xs text-[#F4F1EA]/50 underline underline-offset-4 hover:text-[#F4F1EA]">Retirer la photo</button>
        )}
        <p className="max-w-xs text-xs text-[#F4F1EA]/40">Visage de face, bien éclairé. La photo reste sur ce téléphone : elle n’est ni dans le QR ni envoyée.</p>
        {erreur && <p role="alert" className="text-sm text-[#FF8D82]">{erreur}</p>}
      </div>
    </div>
  )
}

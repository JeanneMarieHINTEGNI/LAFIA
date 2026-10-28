import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PlayIcon, XIcon } from '@phosphor-icons/react'

/** Vidéo de démonstration (86 s, filmée dans le logiciel), servie par le site lui-même : pas de lecteur tiers. */
export const VIDEO_DEMO = '/demo/lafia-demo.mp4'
export const AFFICHE_DEMO = '/demo/lafia-demo.jpg'

export function BoutonVideoDemo({ className = '' }: { className?: string }) {
  const [ouvert, setOuvert] = useState(false)
  const fermer = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!ouvert) return
    fermer.current?.focus()
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    addEventListener('keydown', echap)
    return () => removeEventListener('keydown', echap)
  }, [ouvert])

  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} className={className}>
        <PlayIcon size={14} weight="fill" />
        Voir la démo
      </button>
      {ouvert && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Vidéo de démonstration LAFIA"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4" onClick={() => setOuvert(false)}>
          <div className="relative w-full max-w-5xl" onClick={e => e.stopPropagation()}>
            <button ref={fermer} type="button" onClick={() => setOuvert(false)} aria-label="Fermer la vidéo"
              className="absolute -top-12 right-0 flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-[#F4F1EA]/85 hover:text-white">
              <XIcon size={14} /> Fermer
            </button>
            <video src={VIDEO_DEMO} poster={AFFICHE_DEMO} controls autoPlay playsInline preload="metadata"
              className="aspect-video w-full rounded-2xl bg-black" />
          </div>
        </div>,
        document.body,   // hors de l'en-tête animé : un ancêtre transformé piégerait la position « fixed »
      )}
    </>
  )
}
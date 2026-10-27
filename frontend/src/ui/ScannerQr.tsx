import { useEffect, useRef, useState } from 'react'
import { creerDecodeur, messageCamera } from './lecteurQr'

/**
 * Caméra + lecture de QR, 100 % sur l'appareil. Monté = caméra allumée ; démonté = caméra éteinte.
 * Réglages issus des mesures (voir lecteurQr.ts) : caméra arrière, mise au point continue, lampe si disponible,
 * images limitées à 1600 px, recherche jamais interrompue par une image illisible.
 * `accepte` filtre les QR : un QR étranger est ignoré et la recherche continue. `onLu` est appelé une seule fois.
 */
export function ScannerQr({ accepte, onLu, onErreur, consigne = 'Toute la carte dans l’image, à 15–25 cm, téléphone immobile.' }: {
  accepte: (texte: string) => boolean
  onLu: (texte: string) => void
  onErreur: (message: string) => void
  consigne?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [lampe, setLampe] = useState<MediaStreamTrack | null>(null)
  const [lampeOn, setLampeOn] = useState(false)
  // Les rappels du parent changent à chaque rendu : on garde les derniers sans relancer la caméra.
  const rappels = useRef({ accepte, onLu, onErreur })
  rappels.current = { accepte, onLu, onErreur }

  useEffect(() => {
    let actif = true
    let flux: MediaStream | null = null
    let minuteur = 0
    ;(async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        rappels.current.onErreur('Caméra indisponible : le site doit être ouvert en HTTPS. Utilisez le texte collé en repli.'); return
      }
      try {
        const decodeur = creerDecodeur()             // le moteur se charge pendant que la caméra s'ouvre
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
        if (!actif) { flux.getTracks().forEach(t => t.stop()); return }
        const piste = flux.getVideoTracks()[0]
        const cap = (piste.getCapabilities?.() ?? {}) as { focusMode?: string[]; torch?: boolean }
        // Mise au point continue : sans elle, beaucoup de téléphones restent flous de près (cause n° 1 d'échec mesurée).
        if (cap.focusMode?.includes('continuous')) await piste.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined)
        setLampe(cap.torch ? piste : null)
        const video = videoRef.current
        if (!video) return
        video.srcObject = flux
        await video.play().catch(() => undefined)
        const lire = await decodeur
        const toile = document.createElement('canvas')
        const ctx = toile.getContext('2d', { willReadFrequently: true })
        if (!ctx) throw new Error('canvas indisponible')
        const tour = async () => {
          if (!actif) return
          if (video.videoWidth) {
            // Au plus 1600 px de côté : assez pour une carte dense tenue à distance, sans ralentir les téléphones modestes.
            const k = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight))
            toile.width = Math.round(video.videoWidth * k); toile.height = Math.round(video.videoHeight * k)
            ctx.drawImage(video, 0, 0, toile.width, toile.height)
            // Une image illisible ou une erreur ponctuelle du moteur ne doit JAMAIS arrêter la recherche.
            const texte = await lire(ctx.getImageData(0, 0, toile.width, toile.height)).catch(() => null)
            if (!actif) return
            if (texte && rappels.current.accepte(texte)) {
              actif = false
              flux?.getTracks().forEach(t => t.stop())
              rappels.current.onLu(texte)
              return
            }
          }
          minuteur = window.setTimeout(() => void tour(), 60)
        }
        void tour()
      } catch (e) {
        if (actif) rappels.current.onErreur(messageCamera(e))
      }
    })()
    return () => { actif = false; window.clearTimeout(minuteur); flux?.getTracks().forEach(t => t.stop()) }
  }, [])

  const basculerLampe = async () => {
    if (!lampe) return
    try { await lampe.applyConstraints({ advanced: [{ torch: !lampeOn } as MediaTrackConstraintSet] }); setLampeOn(!lampeOn) } catch { setLampe(null) }
  }

  return (
    <div className="space-y-2">
      <video ref={videoRef} playsInline muted autoPlay className="w-full max-w-sm rounded-2xl border border-white/10" />
      <p className="text-sm text-[#F4F1EA]/60">{consigne}</p>
      {lampe && (
        <button type="button" onClick={() => void basculerLampe()} className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-[#F4F1EA]/80">
          {lampeOn ? 'Éteindre la lampe' : 'Allumer la lampe'}
        </button>
      )}
    </div>
  )
}
import { useEffect, useRef, useState } from 'react'
import { creerDecodeurInfo, messageCamera } from './lecteurQr'

/**
 * Caméra + lecture de QR, 100 % sur l'appareil. Monté = caméra allumée ; démonté = caméra éteinte.
 * Réglages issus des mesures (voir lecteurQr.ts) : caméra arrière, mise au point continue, lampe si disponible,
 * images limitées à 1600 px, recherche jamais interrompue par une image illisible.
 * `accepte` filtre les QR : un QR étranger est signalé et la recherche continue. `onLu` est appelé une seule fois.
 *
 * IMAGE NOIRE : une caméra peut « tourner » en ne renvoyant que du noir (volet de confidentialité fermé sur un
 * portable, caméra occupée par une autre application, résolution refusée par certaines webcams sous Linux).
 * On le détecte (luminosité moyenne quasi nulle pendant ~2 s), on réessaie une fois avec des réglages simples,
 * puis on explique quoi vérifier et on propose de changer de caméra.
 */

/** Luminosité moyenne (0-255) d'un échantillon de pixels : suffit à reconnaître une image entièrement noire. */
export function luminositeMoyenne(data: Uint8ClampedArray): number {
  let somme = 0, n = 0
  const pas = Math.max(4, Math.floor(data.length / 4 / 2000) * 4)       // ~2 000 pixels échantillonnés
  for (let i = 0; i + 2 < data.length; i += pas) { somme += (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8; n++ }
  return n ? somme / n : 0
}

const SEUIL_NOIR = 6            // en dessous : image noire (une pièce sombre réelle reste nettement au-dessus)
const IMAGES_AVANT_DIAGNOSTIC = 25

export function ScannerQr({ accepte, onLu, onErreur, consigne = 'Toute la carte dans l’image, à 15–25 cm, téléphone immobile.', refus = 'QR lu, mais ce n’est pas une carte LAFIA' }: {
  accepte: (texte: string) => boolean
  onLu: (texte: string) => void
  onErreur: (message: string) => void
  consigne?: string
  /** Message quand un QR est lu mais refusé par `accepte` (au lieu de l'ignorer en silence). */
  refus?: string
}) {
  // Retour visible : sans lui, « rien ne se passe » ne dit pas si la caméra tourne, si la lecture tourne, ou si un QR est refusé.
  const [etat, setEtat] = useState<{ phase: 'demarrage' | 'recherche'; images: number; moteur: string; refuse: string }>({ phase: 'demarrage', images: 0, moteur: '', refuse: '' })
  const videoRef = useRef<HTMLVideoElement>(null)
  const [lampe, setLampe] = useState<MediaStreamTrack | null>(null)
  const [lampeOn, setLampeOn] = useState(false)
  const [noir, setNoir] = useState(false)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [camera, setCamera] = useState<string | null>(null)       // null = caméra arrière par défaut
  const [simple, setSimple] = useState(false)                      // réglages simples après une image noire
  // Les rappels du parent changent à chaque rendu : on garde les derniers sans relancer la caméra.
  const rappels = useRef({ accepte, onLu, onErreur })
  rappels.current = { accepte, onLu, onErreur }

  useEffect(() => {
    let actif = true
    let flux: MediaStream | null = null
    let minuteur = 0
    setEtat(e => ({ ...e, phase: 'demarrage', images: 0 }))
    ;(async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        rappels.current.onErreur('Caméra indisponible : le site doit être ouvert en HTTPS. Utilisez le texte collé en repli.'); return
      }
      try {
        const decodeur = creerDecodeurInfo()         // le moteur se charge pendant que la caméra s'ouvre
        const video: MediaTrackConstraints = camera ? { deviceId: { exact: camera } } : { facingMode: { ideal: 'environment' } }
        if (!simple) Object.assign(video, { width: { ideal: 1920 }, height: { ideal: 1080 } })
        flux = await navigator.mediaDevices.getUserMedia({ video, audio: false })
        if (!actif) { flux.getTracks().forEach(t => t.stop()); return }
        // La liste des caméras n'a de libellés qu'une fois l'autorisation donnée : on la lit maintenant.
        navigator.mediaDevices.enumerateDevices?.().then(l => { if (actif) setCameras(l.filter(d => d.kind === 'videoinput')) }).catch(() => undefined)
        const piste = flux.getVideoTracks()[0]
        const cap = (piste.getCapabilities?.() ?? {}) as { focusMode?: string[]; torch?: boolean }
        // Mise au point continue : sans elle, beaucoup de téléphones restent flous de près (cause n° 1 d'échec mesurée).
        if (cap.focusMode?.includes('continuous')) await piste.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined)
        setLampe(cap.torch ? piste : null)
        const el = videoRef.current
        if (!el) return
        el.srcObject = flux
        await el.play().catch(() => undefined)
        const { lire, moteur } = await decodeur
        if (!actif) return
        let images = 0, noires = 0
        setEtat(e => ({ ...e, phase: 'recherche', moteur }))
        const toile = document.createElement('canvas')
        const ctx = toile.getContext('2d', { willReadFrequently: true })
        if (!ctx) throw new Error('canvas indisponible')
        const tour = async () => {
          if (!actif) return
          if (el.videoWidth) {
            // Au plus 1600 px de côté : assez pour une carte dense tenue à distance, sans ralentir les téléphones modestes.
            const k = Math.min(1, 1600 / Math.max(el.videoWidth, el.videoHeight))
            toile.width = Math.round(el.videoWidth * k); toile.height = Math.round(el.videoHeight * k)
            ctx.drawImage(el, 0, 0, toile.width, toile.height)
            const image = ctx.getImageData(0, 0, toile.width, toile.height)
            images++
            if (luminositeMoyenne(image.data) < SEUIL_NOIR) noires++
            else if (noires) { noires = 0; setNoir(false) }
            if (images === IMAGES_AVANT_DIAGNOSTIC && noires === images) {
              if (!simple) { setSimple(true); return }   // 1er essai de secours : réglages simples (relance la caméra)
              setNoir(true)
            }
            // Une image illisible ou une erreur ponctuelle du moteur ne doit JAMAIS arrêter la recherche.
            const texte = await lire(image).catch(() => null)
            if (!actif) return
            if (texte && rappels.current.accepte(texte)) {
              actif = false
              flux?.getTracks().forEach(t => t.stop())
              rappels.current.onLu(texte)
              return
            }
            if (texte) setEtat(e => ({ ...e, images, refuse: texte.slice(0, 40) }))
            else if (images % 10 === 0) setEtat(e => ({ ...e, images }))
          }
          minuteur = window.setTimeout(() => void tour(), 60)
        }
        void tour()
      } catch (e) {
        if (!actif) return
        // Une caméra choisie qui refuse de s'ouvrir : on revient à la caméra par défaut plutôt que d'échouer.
        if (camera) { setCamera(null); return }
        rappels.current.onErreur(messageCamera(e))
      }
    })()
    return () => { actif = false; window.clearTimeout(minuteur); flux?.getTracks().forEach(t => t.stop()) }
  }, [camera, simple])

  const basculerLampe = async () => {
    if (!lampe) return
    try { await lampe.applyConstraints({ advanced: [{ torch: !lampeOn } as MediaTrackConstraintSet] }); setLampeOn(!lampeOn) } catch { setLampe(null) }
  }

  const cameraSuivante = () => {
    if (cameras.length < 2) return
    const i = cameras.findIndex(c => c.deviceId === camera)
    setNoir(false); setSimple(false); setCamera(cameras[(i + 1) % cameras.length].deviceId)
  }

  return (
    <div className="space-y-2">
      <p role="status" className="text-xs text-[#F4F1EA]/45">
        {etat.phase === 'demarrage' ? 'Démarrage de la caméra et du lecteur…' : `Recherche… ${etat.images} image${etat.images > 1 ? 's' : ''} analysée${etat.images > 1 ? 's' : ''}`}
        {etat.moteur && <span className="block text-[10px] text-[#F4F1EA]/30">Lecteur : {etat.moteur}</span>}
      </p>
      {noir && (
        <div role="alert" className="rounded-lg border border-[#F2A93B]/40 bg-[#F2A93B]/10 px-3 py-2 text-xs text-[#F2A93B]">
          <p className="font-medium">L’image de la caméra est noire.</p>
          <ul className="mt-1 list-disc pl-4">
            <li>Sur un ordinateur portable : ouvrez le petit volet qui cache la caméra, au-dessus de l’écran.</li>
            <li>Fermez les autres applications ou onglets qui utilisent la caméra (visio…).</li>
            {cameras.length > 1 && <li>Ou essayez une autre caméra.</li>}
          </ul>
        </div>
      )}
      {etat.refuse && (
        <p className="rounded-lg border border-[#F2A93B]/40 bg-[#F2A93B]/10 px-3 py-2 text-xs text-[#F2A93B]">
          {refus} : « {etat.refuse}… »
        </p>
      )}
      <video ref={videoRef} playsInline muted autoPlay className="w-full max-w-sm rounded-2xl border border-white/10" />
      <p className="text-sm text-[#F4F1EA]/60">{consigne}</p>
      <div className="flex flex-wrap gap-2">
        {lampe && (
          <button type="button" onClick={() => void basculerLampe()} className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-[#F4F1EA]/80">
            {lampeOn ? 'Éteindre la lampe' : 'Allumer la lampe'}
          </button>
        )}
        {cameras.length > 1 && (
          <button type="button" onClick={cameraSuivante} className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-[#F4F1EA]/80">
            Changer de caméra
          </button>
        )}
      </div>
    </div>
  )
}
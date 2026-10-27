import { useCallback, useEffect, useRef, useState } from 'react'
import { verify, type Verified } from '../core'
import { creerDecodeur, estCarte, messageCamera } from './lecteurQr'
import { REGISTRY, FACILITIES, useInfoRegistre } from './trust'
import { UrgenceView } from './UrgenceView'

type Ok = Extract<Verified, { ok: true }>

/** Lit une carte (caméra, texte collé, ou texte/lien fourni par ton routeur via `initialText`), vérifie, puis affiche.
 *  Rien n'est rendu tant que verify() n'a pas réussi. Aucun appel réseau.
 *  Invariant d'architecture : « le journal est écrit AVANT l'affichage, pas après ». `beforeDisplay` est donc
 *  appelé et attendu AVANT que le contenu soit rendu ; s'il échoue, la lecture reste possible (fonction vitale)
 *  mais un bandeau signale qu'elle n'a pas été journalisée.
 *  Le routage par '#' est laissé à ton application : passe le fragment/lien reçu dans `initialText`. */
export function ScanUrgence({ initialText = '', beforeDisplay }: { initialText?: string; beforeDisplay?: (v: Ok) => void | Promise<void> }) {
  const [result, setResult] = useState<Verified | null>(null)
  const registre = useInfoRegistre()
  const [ms, setMs] = useState<number | null>(null)
  const [camOn, setCamOn] = useState(false)
  const [error, setError] = useState('')
  const [pasted, setPasted] = useState('')
  const [journalWarning, setJournalWarning] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const debutScan = useRef<number | null>(null)      // toucher sur « Scanner » : le chrono couvre caméra + lecture + vérification
  const [lampe, setLampe] = useState<MediaStreamTrack | null>(null)
  const [lampeOn, setLampeOn] = useState(false)
  const [depuisCamera, setDepuisCamera] = useState(false)

  const handleText = useCallback(async (text: string, debut?: number) => {
    const t0 = debut ?? performance.now()
    setDepuisCamera(debut !== undefined)
    const v = verify(text, REGISTRY)
    setJournalWarning('')
    if (v.ok && beforeDisplay) {
      try { await beforeDisplay(v) }
      catch { setJournalWarning("Lecture NON journalisée : le journal est indisponible. Signalez-le dès que possible.") }
    }
    setResult(v); setMs(Math.round(performance.now() - t0))
  }, [beforeDisplay])

  useEffect(() => { if (initialText) void handleText(initialText) }, [initialText, handleText])

  useEffect(() => {
    if (!camOn) return
    let actif = true
    let flux: MediaStream | null = null
    let minuteur = 0
    ;(async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError('Caméra indisponible : le site doit être ouvert en HTTPS. Utilisez le texte collé en repli.'); setCamOn(false); return
      }
      try {
        const decodeur = creerDecodeur()             // le moteur se charge pendant que la caméra s'ouvre
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
        if (!actif) return
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
            if (texte && estCarte(texte)) {
              actif = false
              flux?.getTracks().forEach(t => t.stop())
              setCamOn(false)
              void handleText(texte, debutScan.current ?? undefined)
              return
            }
          }
          minuteur = window.setTimeout(() => void tour(), 60)
        }
        void tour()
      } catch (e) {
        if (actif) { setError(messageCamera(e)); setCamOn(false) }
      }
    })()
    return () => { actif = false; window.clearTimeout(minuteur); flux?.getTracks().forEach(t => t.stop()); setLampe(null); setLampeOn(false) }
  }, [camOn, handleText])

  const basculerLampe = async () => {
    if (!lampe) return
    try { await lampe.applyConstraints({ advanced: [{ torch: !lampeOn } as MediaTrackConstraintSet] }); setLampeOn(!lampeOn) } catch { setLampe(null) }
  }

  return (
    <div className="space-y-4">
      {!result && <p className="text-sm text-[#F4F1EA]/55">La lecture et la vérification se font sur cet appareil, sans réseau.</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { setError(''); setResult(null); setMs(null); debutScan.current = performance.now(); setCamOn(c => !c) }} className="bg-[#F4F1EA] text-[#0A1615] rounded-full px-5 py-2.5 text-sm font-medium">
          {camOn ? 'Arrêter la caméra' : 'Scanner la carte'}
        </button>
        {result && <button onClick={() => { setResult(null); setMs(null) }} className="rounded-full border border-white/20 px-5 py-2.5 text-sm text-[#F4F1EA]/80">Nouvelle lecture</button>}
      </div>
      {camOn && (
        <div className="space-y-2">
          <video ref={videoRef} playsInline muted autoPlay className="w-full max-w-sm rounded-2xl border border-white/10" />
          <p className="text-sm text-[#F4F1EA]/60">Toute la carte dans l’image, à 15–25 cm, téléphone immobile.</p>
          {lampe && (
            <button onClick={() => void basculerLampe()} className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-[#F4F1EA]/80">
              {lampeOn ? 'Éteindre la lampe' : 'Allumer la lampe'}
            </button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-[#F2A93B]">{error}</p>}

      <details className="text-sm text-[#F4F1EA]/60">
        <summary className="cursor-pointer">Repli : coller le contenu du QR ou le lien</summary>
        <textarea value={pasted} onChange={e => setPasted(e.target.value)} className="mt-2 w-full min-h-[90px] rounded-xl border border-white/10 bg-black/20 p-2 text-xs text-[#F4F1EA]" />
        <button onClick={() => void handleText(pasted)} className="mt-2 rounded-full border border-white/20 px-4 py-1.5">Lire</button>
      </details>

      {result && !result.ok && (
        <div role="alert" className="rounded-2xl border border-[#D9534A]/50 bg-[#D9534A]/10 p-4 text-[#FFD5CF]">
          <p className="font-semibold">✗ Carte refusée : {result.reason}</p>
          <p className="mt-1 text-sm">Aucune donnée n'est affichée. Interrogez la famille ou procédez à l'examen clinique habituel.</p>
        </div>
      )}
      {journalWarning && <p role="alert" className="rounded-xl border border-[#F2A93B]/40 bg-[#F2A93B]/10 px-4 py-3 text-sm text-[#F2A93B]">⚠ {journalWarning}</p>}
      {result?.ok && <UrgenceView card={result} facilities={FACILITIES} />}
      {ms !== null && result?.ok && (
        <p className="text-xs text-[#F4F1EA]/40">
          {depuisCamera ? `Lu et vérifié en ${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s depuis le toucher sur « Scanner »` : `Vérifié en ${ms} ms`} (cible : lecture complète &lt; 5 s)
        </p>
      )}
      {result && <p className="text-xs text-[#F4F1EA]/40">Registre des soignants : version {registre.version} du {new Date(registre.emis * 1000).toLocaleDateString('fr-FR')}</p>}
    </div>
  )
}
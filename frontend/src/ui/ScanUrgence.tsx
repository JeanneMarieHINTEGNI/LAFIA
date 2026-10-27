import { useCallback, useEffect, useRef, useState } from 'react'
import { verify, type Verified } from '../core'
import { estCarte } from './lecteurQr'
import { ScannerQr } from './ScannerQr'
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
  const debutScan = useRef<number | null>(null)      // toucher sur « Scanner » : le chrono couvre caméra + lecture + vérification
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
        <ScannerQr
          accepte={estCarte}
          onLu={texte => { setCamOn(false); void handleText(texte, debutScan.current ?? undefined) }}
          onErreur={message => { setError(message); setCamOn(false) }}
        />
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
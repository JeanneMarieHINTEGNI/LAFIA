import { useEffect, useMemo, useRef, useState } from 'react'
import { verify } from '../core'
import { ScannerQr } from '../ui/ScannerQr'
import { estCarte } from '../ui/lecteurQr'
import { REGISTRY } from '../ui/trust'
import { Chip, champ } from '../ui/formulaire'
import { carteEnTexte } from '../patient/secours'
import { useDeviceState } from '../patient/store'
import { CONDITIONS, OBJECTIF, appareil, enCsv, enTexte, resumer, secondes, type Condition, type Essai } from './g1'

/**
 * Page « Test terrain G1 » (#/test-terrain) : chronomètre 10 lectures de la carte imprimée, en mode avion.
 * N'affiche jamais le contenu médical : seulement « signature valide » et le temps. Résultats gardés sur ce téléphone,
 * à envoyer à l'équipe (WhatsApp) ou à télécharger pour un tableur.
 */
export default function TestTerrain() {
  const [essais, setEssais] = useDeviceState<Essai[]>('test-g1', [])
  const [testeur, setTesteur] = useDeviceState('test-g1-testeur', '')
  const [lieu, setLieu] = useDeviceState('test-g1-lieu', '')
  const [condition, setCondition] = useState<Condition>('Lumière normale')
  const [scan, setScan] = useState(false)
  const [dernier, setDernier] = useState<Essai | null>(null)
  const [enLigne, setEnLigne] = useState(() => navigator.onLine)
  const [copie, setCopie] = useState(false)
  const debut = useRef(0)
  const tel = useMemo(() => appareil(navigator.userAgent), [])
  const r = resumer(essais)
  const infos = { appareil: tel, testeur: testeur.trim(), lieu: lieu.trim() }

  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine)
    addEventListener('online', maj); addEventListener('offline', maj)
    return () => { removeEventListener('online', maj); removeEventListener('offline', maj) }
  }, [])

  const demarrer = () => { setDernier(null); debut.current = performance.now(); setScan(true) }
  const enregistrer = (ok: boolean, raison?: string) => {
    const e: Essai = { n: essais.length + 1, t: Math.floor(Date.now() / 1000), ms: Math.round(performance.now() - debut.current), ok, ...(raison ? { raison } : {}), condition, horsLigne: !navigator.onLine }
    setEssais(l => [...l, e]); setDernier(e); setScan(false)
  }
  const lu = (texte: string) => {
    let t: string
    try { t = carteEnTexte(texte) } catch { enregistrer(false, 'carte illisible'); return }
    const v = verify(t, REGISTRY)
    enregistrer(v.ok, v.ok ? undefined : v.reason)
  }
  const copier = async () => {
    try { await navigator.clipboard.writeText(enTexte(essais, infos)); setCopie(true); setTimeout(() => setCopie(false), 2500) } catch { /* presse-papiers refusé */ }
  }
  const telecharger = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + enCsv(essais, infos)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `lafia-test-g1-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const recommencer = () => { if (confirmerEffacement()) { setEssais([]); setDernier(null) } }

  const restant = Math.max(0, OBJECTIF.lectures - essais.length)

  return (
    <main className="min-h-screen bg-[#0A1615] px-5 pb-20 pt-12 text-[#F4F1EA] sm:px-10">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <a href="/" className="text-sm text-[#F4F1EA]/55 hover:text-[#F4F1EA]">Lafia</a>
          <h1 className="mt-4 font-display text-4xl font-light">Test terrain G1</h1>
          <p className="mt-2 text-[15px] text-[#F4F1EA]/60">
            Objectif : {OBJECTIF.lectures} lectures de la carte imprimée, téléphone en mode avion, chacune en moins de {OBJECTIF.ms / 1000} secondes.
            Le contenu médical n’est jamais affiché ici : seulement la signature et le temps.
          </p>
        </div>

        <section className={`rounded-2xl border p-4 text-sm ${enLigne ? 'border-[#F2A93B]/50 bg-[#F2A93B]/10 text-[#F2A93B]' : 'border-[#4FB3AC]/40 bg-[#4FB3AC]/10 text-[#C8F3EE]'}`} role="status">
          {enLigne ? '⚠ Le téléphone est EN LIGNE. Activez le mode avion avant de commencer : une lecture faite en ligne ne compte pas pour l’objectif.' : '✓ Mode avion : aucune connexion. Le test peut commencer.'}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-[#F4F1EA]/65">Testeur<input value={testeur} maxLength={40} onChange={e => setTesteur(e.target.value)} placeholder="Prénom" className={champ} /></label>
          <label className="text-sm text-[#F4F1EA]/65">Lieu<input value={lieu} maxLength={60} onChange={e => setLieu(e.target.value)} placeholder="Ex. CS de Bassila" className={champ} /></label>
          <p className="text-xs text-[#F4F1EA]/45 sm:col-span-2">Téléphone détecté : {tel}</p>
        </section>

        <section className="lg lg-panel space-y-4 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-light">Lecture n° {essais.length + 1}</h2>
            <p className="text-sm text-[#F4F1EA]/55">{restant ? `encore ${restant} pour l’objectif` : 'objectif de 10 lectures fait'}</p>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm text-[#F4F1EA]/65">Conditions de cette lecture</legend>
            <div className="flex flex-wrap gap-2">{CONDITIONS.map(c => <Chip key={c} on={condition === c} onClick={() => setCondition(c)}>{c}</Chip>)}</div>
          </fieldset>
          {scan ? (
            <div>
              <ScannerQr accepte={estCarte} onLu={lu} onErreur={m => { setScan(false); enregistrer(false, m) }} consigne="Carte imprimée à 15–25 cm. Le chrono tourne depuis le toucher." />
              <button type="button" onClick={() => setScan(false)} className="mt-2 rounded-full border border-white/15 px-4 py-2 text-sm text-[#F4F1EA]/80">Annuler (ne compte pas)</button>
            </div>
          ) : (
            <button type="button" onClick={demarrer} className="min-h-14 w-full rounded-full bg-[#F4F1EA] px-6 py-3 text-base font-medium text-[#0A1615]">Scanner la carte</button>
          )}
          {dernier && (
            <p role="status" data-testid="dernier-essai" className={`rounded-xl px-4 py-3 text-lg ${dernier.ok && dernier.ms < OBJECTIF.ms ? 'bg-[#4FB3AC]/15 text-[#C8F3EE]' : 'bg-[#D9534A]/15 text-[#FFB5AC]'}`}>
              {dernier.ok ? `✓ Signature valide en ${secondes(dernier.ms)}${dernier.ms < OBJECTIF.ms ? '' : ' : trop lent'}` : `✗ Refusée : ${dernier.raison}`}
            </p>
          )}
        </section>

        {essais.length > 0 && (
          <section className="space-y-4">
            <div className={`rounded-2xl border p-5 ${r.atteint ? 'border-[#4FB3AC]/60 bg-[#4FB3AC]/10' : 'border-white/10 bg-white/5'}`}>
              <p className="font-display text-2xl font-light">{r.atteint ? 'Objectif G1 atteint' : essais.length < OBJECTIF.lectures ? 'Test en cours' : 'Objectif G1 non atteint'}</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-[#F4F1EA]/50">Valides</dt><dd className="text-xl">{r.valides}/{r.total}</dd></div>
                <div><dt className="text-[#F4F1EA]/50">Sous 5 s</dt><dd className="text-xl">{r.sousObjectif}/{r.total}</dd></div>
                <div><dt className="text-[#F4F1EA]/50">Médiane</dt><dd className="text-xl">{r.mediane !== null ? secondes(r.mediane) : '–'}</dd></div>
                <div><dt className="text-[#F4F1EA]/50">Le plus long</dt><dd className="text-xl">{r.max !== null ? secondes(r.max) : '–'}</dd></div>
              </dl>
              {r.horsLigne < r.total && <p className="mt-3 text-sm text-[#F2A93B]">{r.total - r.horsLigne} lecture(s) faite(s) en ligne : elles ne comptent pas pour l’objectif.</p>}
            </div>
            <ol className="divide-y divide-white/10 text-sm">
              {[...essais].reverse().map(e => (
                <li key={e.n} className="flex justify-between gap-3 py-2">
                  <span>{e.n}. {e.condition}{e.horsLigne ? '' : ' · en ligne'}</span>
                  <span className={e.ok && e.ms < OBJECTIF.ms ? 'text-[#C8F3EE]' : 'text-[#FFB5AC]'}>{e.ok ? secondes(e.ms) : `refusée (${e.raison})`}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void copier()} className="rounded-full bg-[#4FB3AC] px-5 py-2.5 text-sm font-medium text-[#0A1615]">{copie ? 'Copié : collez-le dans WhatsApp' : 'Copier le résumé (WhatsApp)'}</button>
              <button type="button" onClick={telecharger} className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-[#F4F1EA]/85">Télécharger (tableur)</button>
              <button type="button" onClick={recommencer} className="rounded-full border border-[#D9534A]/40 px-5 py-2.5 text-sm text-[#FFB5AC]">Recommencer</button>
            </div>
          </section>
        )}

        <details className="text-sm text-[#F4F1EA]/60">
          <summary className="cursor-pointer text-[#F4F1EA]/80">Protocole du test</summary>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5">
            <li>Ouvrir cette page une fois AVEC réseau (elle se met en mémoire), puis activer le mode avion.</li>
            <li>Utiliser une carte imprimée à taille réelle (100 %), signée par un badge de démonstration.</li>
            <li>Pour chaque lecture : choisir les conditions, toucher « Scanner la carte », viser la carte. Le chrono part au toucher.</li>
            <li>Faire 10 lectures de suite, sans recharger la page. Varier les conditions si possible (pénombre, soleil).</li>
            <li>Noter tout problème (caméra noire, mise au point lente) et envoyer le résumé à l’équipe.</li>
            <li>Recommencer sur au moins 3 téléphones différents, dont un d’entrée de gamme.</li>
          </ol>
        </details>
      </div>
    </main>
  )
}

function confirmerEffacement(): boolean {
  try { return window.confirm('Effacer toutes les lectures de ce test ?') } catch { return true }
}
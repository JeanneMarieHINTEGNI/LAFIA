import { useState } from 'react'
import { renderSVG } from 'uqr'
import QrCode from '../ui/QrCode'
import { ScannerQr } from '../ui/ScannerQr'
import { estCarte } from '../ui/lecteurQr'
import { REGISTRY } from '../ui/trust'
import { adopterIdentite, enregistrerPatient, jetonPatient, verifierJeton } from '../journal/sync'
import { codeSecours, enregistrerCarteRestauree, estCodeSecours, lireCodeSecours, restaurerCarte, type CarteRestauree } from './secours'

// RÈGLE : la carte ouvre l'URGENCE, jamais le COMPTE. Retrouver un espace exige le code de secours, confirmé par le
// serveur ; la carte ne s'ajoute qu'ensuite, et seulement si elle porte le même identifiant (voir secours.ts).

const champ = 'mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-[#F4F1EA] outline-none focus:border-[#4FB3AC]'
const bouton = 'rounded-full border border-white/15 px-4 py-2 text-sm text-[#F4F1EA]/85 hover:border-[#4FB3AC] hover:text-[#F4F1EA]'
const principal = 'rounded-full bg-[#4FB3AC] px-5 py-2.5 text-sm font-medium text-[#0A1615] hover:bg-[#6fc4be] disabled:opacity-50'

/** Fiche de secours imprimable, SÉPARÉE de la carte : à garder chez soi, comme un mot de passe. */
export function ficheSecoursHtml(code: string, id: string): string {
  const qr = renderSVG(code, { ecc: 'M', border: 4 })
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fiche de secours Lafia</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:32px auto;color:#111;padding:0 16px}h1{font-size:22px}
.qr{width:60mm;height:60mm}.qr svg{width:100%;height:100%}.code{font-family:monospace;font-size:11px;word-break:break-all;border:1px solid #999;padding:8px}
.alerte{border:2px solid #b45309;padding:10px;margin:16px 0}</style></head><body>
<h1>Fiche de secours Lafia</h1>
<p>Identifiant Lafia : <strong>${id}</strong></p>
<div class="alerte"><strong>À garder chez vous, comme un mot de passe.</strong> Ne la rangez jamais avec votre carte d’urgence,
et ne la montrez à personne. Elle permet de retrouver votre espace sur un nouveau téléphone.</div>
<div class="qr">${qr}</div>
<p>Sur le nouveau téléphone : Espace patient → « Retrouver votre espace » → « Scanner mon code de secours ».</p>
<p class="code">${code}</p>
<p style="font-size:12px;color:#555">Cette fiche ne contient aucune donnée médicale.</p>
</body></html>`
}

/** Dans l'espace patient : afficher, copier ou imprimer le code de secours. */
export function SauvegardeSecours({ id }: { id: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [enregistre, setEnregistre] = useState<boolean | null>(null)
  const [copie, setCopie] = useState(false)

  const afficher = async () => {
    // Le code ne vaut que si l'identifiant est réservé au serveur : on le dit si ce n'est pas encore le cas.
    setEnregistre(await enregistrerPatient(id))
    setCode(await codeSecours(id, jetonPatient()))
  }
  const copier = async () => {
    if (!code) return
    try { await navigator.clipboard.writeText(code); setCopie(true) } catch { setCopie(false) }
  }
  const imprimer = () => {
    if (!code) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(ficheSecoursHtml(code, id)); w.document.close(); w.focus(); w.print()
  }

  return (
    <div className="text-sm leading-relaxed">
      <p className="mb-2 text-[#F4F1EA]/70">Changer de téléphone</p>
      <p className="text-[#F4F1EA]/45">
        Pour retrouver votre espace sur un autre téléphone, il faut votre <strong className="font-normal text-[#F4F1EA]/75">code de secours</strong>.
        Imprimez la fiche et gardez-la chez vous, <strong className="font-normal text-[#F4F1EA]/75">jamais avec votre carte</strong> :
        la carte ne donne accès qu’aux informations d’urgence, le code donne accès à votre espace.
      </p>
      {!code ? (
        <button type="button" onClick={afficher} className={`mt-3 ${bouton}`}>Afficher mon code de secours</button>
      ) : (
        <div className="mt-4 space-y-3">
          {enregistre === false && (
            <p role="alert" className="rounded-lg border border-[#F2A93B]/40 bg-[#F2A93B]/10 px-3 py-2 text-xs text-[#F2A93B]">
              Votre espace n’est pas encore enregistré sur le serveur (pas de connexion) : ce code ne fonctionnera qu’après une connexion.
            </p>
          )}
          <QrCode text={code} size={220} />
          <p className="break-all rounded-lg border border-white/10 bg-black/20 p-2 font-mono text-xs text-[#F4F1EA]/85" data-testid="code-secours">{code}</p>
          <p className="text-xs text-[#F2A93B]">Comme un mot de passe : ne le montrez à personne.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={imprimer} className={bouton}>Imprimer la fiche de secours</button>
            <button type="button" onClick={copier} className={bouton}>{copie ? 'Copié' : 'Copier'}</button>
            <button type="button" onClick={() => { setCode(null); setCopie(false) }} className={bouton}>Masquer</button>
          </div>
        </div>
      )}
    </div>
  )
}

export type Restauration = { id: string; avecCarte: boolean; anneeNaissance?: string }

type Ok = Extract<CarteRestauree, { ok: true }>

/**
 * Nouveau téléphone. Étape 1 (obligatoire) : le code de secours, confirmé par le serveur.
 * Étape 2 (facultative) : la carte, acceptée seulement si elle porte le même identifiant.
 */
export function RestaurerEspace({ onRestaure, onAnnuler }: { onRestaure: (r: Restauration) => void; onAnnuler: () => void }) {
  const [identite, setIdentite] = useState<{ id: string; jeton: string } | null>(null)
  const [carte, setCarte] = useState<Ok | null>(null)
  const [scan, setScan] = useState<'code' | 'carte' | null>(null)
  const [codeColle, setCodeColle] = useState('')
  const [carteCollee, setCarteCollee] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)

  const prendreCode = async (texte: string) => {
    setErreur(''); setEnCours(true)
    try {
      const lu = await lireCodeSecours(texte)
      if (!lu.ok) { setErreur(lu.erreur); return }
      const v = await verifierJeton(lu.id, lu.jeton)
      if (v === 'refuse') { setErreur('Le serveur ne reconnaît pas ce code de secours. Vérifiez qu’il s’agit bien de votre fiche la plus récente.'); return }
      if (v === 'injoignable') {
        setErreur('Connexion nécessaire : seul le serveur peut confirmer votre code. C’est ce qui empêche quelqu’un d’autre de prendre votre espace. Réessayez avec du réseau.')
        return
      }
      setIdentite({ id: lu.id, jeton: lu.jeton })
    } finally { setEnCours(false) }
  }

  const prendreCarte = (texte: string) => {
    if (!identite) return
    setErreur('')
    const rc = restaurerCarte(texte, REGISTRY, identite.id)
    if (rc.ok) setCarte(rc)
    else setErreur(rc.erreur)
  }

  const terminer = () => {
    if (!identite) return
    adopterIdentite(identite.id, identite.jeton)
    if (carte) enregistrerCarteRestauree(carte.carte, carte.payload)
    const yb = carte?.payload.pr?.yb
    onRestaure({ id: identite.id, avecCarte: Boolean(carte), anneeNaissance: yb ? String(yb) : undefined })
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-[#F4F1EA]/65">
      <p className="text-[15px] text-[#F4F1EA]">Retrouver votre espace</p>

      <div className="mt-4">
        <p className="text-[#F4F1EA]/85">1. Votre code de secours</p>
        <p className="mt-1 text-xs text-[#F4F1EA]/45">Sur votre fiche de secours (papier, photo ou capture d’écran). Votre carte d’urgence ne suffit pas : elle est lisible par tout le monde.</p>
        {identite ? (
          <p role="status" className="mt-2 text-[#C8F3EE]">✓ Code confirmé par le serveur · identifiant <span className="whitespace-nowrap font-mono">{identite.id}</span></p>
        ) : enCours ? (
          <p className="mt-2 text-[#F4F1EA]/60">Vérification auprès du serveur…</p>
        ) : scan === 'code' ? (
          <div className="mt-2">
            <ScannerQr accepte={estCodeSecours} consigne="Le QR de votre fiche de secours dans l’image." refus="Ceci n’est pas un code de secours. Une carte d’urgence ne permet pas de retrouver un espace ; pour la lire, utilisez « Lire une carte d’urgence »"
              onLu={t => { setScan(null); void prendreCode(t) }} onErreur={m => { setScan(null); setErreur(m) }} />
            <button type="button" onClick={() => setScan(null)} className={`mt-2 ${bouton}`}>Arrêter la caméra</button>
          </div>
        ) : (
          <button type="button" onClick={() => { setErreur(''); setScan('code') }} className={`mt-2 ${principal}`}>Scanner mon code de secours</button>
        )}
        {!identite && !enCours && (
          <details className="mt-2 text-xs text-[#F4F1EA]/50">
            <summary className="cursor-pointer">Pas de caméra ? Coller le code</summary>
            <textarea rows={2} value={codeColle} onChange={e => setCodeColle(e.target.value)} className={champ} placeholder="LAFIA-SECOURS:p-…" />
            <button type="button" onClick={() => void prendreCode(codeColle)} className={`mt-2 ${bouton}`}>Vérifier ce code</button>
          </details>
        )}
      </div>

      {identite && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-[#F4F1EA]/85">2. Votre carte <span className="text-[#F4F1EA]/45">(facultatif)</span></p>
          <p className="mt-1 text-xs text-[#F4F1EA]/45">Pour retrouver aussi votre carte signée et votre profil d’urgence sur ce téléphone.</p>
          {carte ? (
            <p role="status" className="mt-2 text-[#C8F3EE]">✓ Carte reconnue</p>
          ) : scan === 'carte' ? (
            <div className="mt-2">
              <ScannerQr accepte={estCarte} onLu={t => { setScan(null); prendreCarte(t) }} onErreur={m => { setScan(null); setErreur(m) }} />
              <button type="button" onClick={() => setScan(null)} className={`mt-2 ${bouton}`}>Arrêter la caméra</button>
            </div>
          ) : (
            <button type="button" onClick={() => { setErreur(''); setScan('carte') }} className={`mt-2 ${bouton}`}>Scanner ma carte</button>
          )}
          {!carte && (
            <details className="mt-2 text-xs text-[#F4F1EA]/50">
              <summary className="cursor-pointer">Coller le texte ou le lien de la carte</summary>
              <textarea rows={2} value={carteCollee} onChange={e => setCarteCollee(e.target.value)} className={champ} placeholder="L2:… ou https://…#L2B:…" />
              <button type="button" onClick={() => prendreCarte(carteCollee)} className={`mt-2 ${bouton}`}>Utiliser ce texte</button>
            </details>
          )}
        </div>
      )}

      {erreur && <p role="alert" className="mt-4 rounded-lg border border-[#D9534A]/40 bg-[#D9534A]/10 px-3 py-2 text-[#FFB5AC]">{erreur}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={!identite} onClick={terminer} className={principal}>Retrouver mon espace</button>
        <button type="button" onClick={onAnnuler} className={bouton}>Retour</button>
      </div>
    </div>
  )
}
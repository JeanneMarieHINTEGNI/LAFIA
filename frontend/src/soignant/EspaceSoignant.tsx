import { useMemo, useState } from 'react'
import { verify, type Verified } from '../core'
import { useBadge } from '../ui/BadgeContext'
import { BadgeLoader } from '../ui/BadgeLoader'
import { ScannerQr } from '../ui/ScannerQr'
import { UrgenceView } from '../ui/UrgenceView'
import { estCarte } from '../ui/lecteurQr'
import { AUTORITE_DEMO, FACILITIES, REGISTRY } from '../ui/trust'
import { Qr, champ, quand } from '../ui/formulaire'
import { journal, useJournal } from '../journal/usejournal'
import { baseParDefaut, texteQr, type ProfilSaisi } from '../patient/carte'
import { carteEnTexte, profilDepuisCarte } from '../patient/secours'
import { EditeurCarte } from './EditeurCarte'
import { ImprimerCarte } from '../ui/ImprimerCarte'
import { ExporterIps } from '../ui/ExporterIps'

type Ok = Extract<Verified, { ok: true }>

/**
 * Espace soignant, sur le téléphone DU SOIGNANT (son badge n'est jamais chargé sur le téléphone d'un patient).
 * 1. charger son badge ; 2. scanner la carte du patient (lecture signée au journal, avant affichage) ;
 * 3. mettre à jour et signer (émission inscrite au journal) ; 4. montrer le QR : le patient le reçoit dans « Ma carte ».
 */
export default function EspaceSoignant() {
  const { badge, roleLabel, etab, clearBadge } = useBadge()
  const [scan, setScan] = useState(false)
  const [colle, setColle] = useState('')
  const [carteLue, setCarteLue] = useState<Ok | null>(null)
  const [profil, setProfil] = useState<ProfilSaisi | null>(null)
  const [nouvelle, setNouvelle] = useState<string | null>(null)
  const [erreur, setErreur] = useState('')
  const [avertissement, setAvertissement] = useState('')

  const lire = async (saisie: string) => {
    setErreur(''); setAvertissement('')
    if (!badge) return
    let texte: string
    try { texte = carteEnTexte(saisie) } catch { setErreur('Carte illisible.'); return }
    const v = verify(texte, REGISTRY)
    if (!v.ok) { setErreur(`Carte refusée : ${v.reason}. Aucune donnée n’est affichée.`); return }
    // Journal AVANT affichage : lecture signée par le badge, rattachée à l'établissement.
    try {
      await journal.ajouterEntree({ action: 'LECTURE', cible: v.payload.id, rubriques: ['C0'], etab: badge.etab, signataire: badge })
    } catch {
      setAvertissement('Lecture NON journalisée : le journal de cet appareil est indisponible.')
    }
    setCarteLue(v); setProfil(profilDepuisCarte(v.payload.pr)); setNouvelle(null); setColle('')
  }

  const patientSuivant = () => { setCarteLue(null); setProfil(null); setNouvelle(null); setErreur(''); setAvertissement('') }

  return (
    <main className="min-h-screen bg-[#0A1615] px-5 pb-16 pt-12 text-[#F4F1EA] sm:px-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <a href="/" className="text-sm text-[#F4F1EA]/55 hover:text-[#F4F1EA]">Lafia</a>
          <h1 className="mt-4 font-display text-4xl font-light">Espace soignant</h1>
          <p className="mt-2 text-sm text-[#F4F1EA]/55">Mettez à jour la carte d’un patient depuis votre propre téléphone. Votre badge reste sur votre appareil, en mémoire seulement.</p>
        </div>

        {AUTORITE_DEMO && (
          <p role="note" className="rounded-xl border border-[#F2A93B]/40 bg-[#F2A93B]/10 px-4 py-3 text-sm text-[#F2A93B]">
            Version de démonstration : les badges et la clé de l’autorité sont publics. Ne signez pas la carte d’un vrai patient avec ce site.
          </p>
        )}

        <section className="lg lg-panel p-5">
          {badge ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-[#C8F3EE]">✓ Badge chargé</p>
                <p className="text-[#F4F1EA]">{roleLabel}{etab ? ` · ${FACILITIES[etab] ?? etab}` : ''}</p>
                <p className="font-mono text-xs text-[#F4F1EA]/40">badge {badge.kid}</p>
              </div>
              <button type="button" onClick={() => { clearBadge(); patientSuivant() }} className="rounded-full border border-white/15 px-4 py-2 text-sm text-[#F4F1EA]/80">Retirer le badge</button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[#F4F1EA]">Chargez votre badge pour commencer.</p>
              <BadgeLoader />
            </div>
          )}
        </section>

        {badge && !carteLue && (
          <section className="lg lg-panel space-y-3 p-5">
            <h2 className="font-display text-2xl font-light">1. Carte du patient</h2>
            {scan ? (
              <div>
                <ScannerQr accepte={estCarte} onLu={t => { setScan(false); void lire(t) }} onErreur={m => { setScan(false); setErreur(m) }} />
                <button type="button" onClick={() => setScan(false)} className="mt-2 rounded-full border border-white/15 px-4 py-2 text-sm text-[#F4F1EA]/80">Arrêter la caméra</button>
              </div>
            ) : (
              <button type="button" onClick={() => { setErreur(''); setScan(true) }} className="rounded-full bg-[#F4F1EA] px-5 py-2.5 text-sm font-medium text-[#0A1615]">Scanner la carte du patient</button>
            )}
            <details className="text-xs text-[#F4F1EA]/50">
              <summary className="cursor-pointer">Pas de caméra ? Coller le texte ou le lien de la carte</summary>
              <textarea rows={2} value={colle} onChange={e => setColle(e.target.value)} className={`${champ} font-mono text-xs`} placeholder="L2:… ou https://…#L2B:…" />
              <button type="button" onClick={() => void lire(colle)} className="mt-2 rounded-full border border-white/15 px-4 py-2 text-sm text-[#F4F1EA]/80">Lire cette carte</button>
            </details>
          </section>
        )}

        {erreur && <p role="alert" className="rounded-xl border border-[#D9534A]/40 bg-[#D9534A]/10 px-4 py-3 text-sm text-[#FFD5CF]">{erreur}</p>}
        {avertissement && <p role="alert" className="rounded-xl border border-[#F2A93B]/40 bg-[#F2A93B]/10 px-4 py-3 text-sm text-[#F2A93B]">⚠ {avertissement}</p>}

        {badge && carteLue && profil && !nouvelle && (
          <>
            <section className="lg lg-panel p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-light">Carte actuelle</h2>
                <button type="button" onClick={patientSuivant} className="text-sm text-[#F4F1EA]/55 hover:text-[#F4F1EA]">Autre patient</button>
              </div>
              <UrgenceView card={carteLue} facilities={FACILITIES} />
              <div className="mt-5 border-t border-white/10 pt-5"><ExporterIps carte={carteLue} /></div>
            </section>
            <section className="lg lg-panel space-y-4 p-5">
              <h2 className="font-display text-2xl font-light">2. Mettre à jour</h2>
              <EditeurCarte profil={profil} onProfil={setProfil} consultations={carteLue.payload.co ?? []} patientId={carteLue.payload.id}
                onSigne={texte => setNouvelle(texte)} />
            </section>
          </>
        )}

        {badge && nouvelle && <NouvelleCarte texte={nouvelle} onSuivant={patientSuivant} />}

        {badge && <SignaturesRecentes kid={badge.kid} />}
      </div>
    </main>
  )
}

function NouvelleCarte({ texte, onSuivant }: { texte: string; onSuivant: () => void }) {
  const qr = useMemo(() => texteQr(texte, baseParDefaut()).qr, [texte])
  return (
    <section className="lg lg-panel space-y-4 p-5">
      <h2 className="font-display text-2xl font-light">3. Nouvelle carte signée</h2>
      <p className="text-sm text-[#F4F1EA]/65">
        Le patient ouvre LAFIA → <strong className="font-normal text-[#F4F1EA]">Ma carte</strong> → <strong className="font-normal text-[#F4F1EA]">Recevoir ma nouvelle carte</strong>, puis scanne ce QR.
        Pensez à réimprimer sa carte papier.
      </p>
      <div className="mx-auto aspect-square w-full max-w-[360px] rounded-2xl bg-[#F4F1EA] p-3"><Qr text={qr} /></div>
      <details className="text-xs text-[#F4F1EA]/50">
        <summary className="cursor-pointer">Le patient n’a pas de caméra ? Texte de la carte à lui transmettre</summary>
        <textarea readOnly rows={3} value={texte} data-testid="nouvelle-carte" className={`${champ} font-mono text-[11px]`} />
      </details>
      <div className="border-t border-white/10 pt-4">
        <p className="mb-3 text-sm text-[#F4F1EA]/65">Patient sans smartphone : imprimez-lui sa nouvelle carte.</p>
        <ImprimerCarte carte={texte} qr={qr} />
      </div>
      <button type="button" onClick={onSuivant} className="rounded-full bg-[#F4F1EA] px-5 py-2.5 text-sm font-medium text-[#0A1615]">Patient suivant</button>
    </section>
  )
}

/** Cartes émises avec CE badge sur CET appareil (entrées ECRITURE du journal). */
function SignaturesRecentes({ kid }: { kid: string }) {
  const { entrees } = useJournal()
  const miennes = (entrees ?? []).filter(e => e.action === 'ECRITURE' && e.acteur === kid).slice(0, 10)
  return (
    <section className="space-y-2">
      <h2 className="text-xs uppercase tracking-[0.14em] text-[#F4F1EA]/50">Mes signatures récentes sur cet appareil</h2>
      {miennes.length === 0 ? (
        <p className="text-sm text-[#F4F1EA]/45">Aucune carte signée pour l’instant.</p>
      ) : (
        <ul className="divide-y divide-white/10 text-sm">
          {miennes.map(e => (
            <li key={e.i} className="flex justify-between gap-4 py-2">
              <span className="text-[#F4F1EA]/80">{quand(e.t)}</span>
              <span className="font-mono text-xs text-[#F4F1EA]/50">{e.cible}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
import { useMemo, useState } from 'react'
import { encode } from 'uqr'
import { verify, type Consultation } from '../core'
import { BadgeLoader } from '../ui/BadgeLoader'
import { UrgenceView } from '../ui/UrgenceView'
import { FACILITIES, REGISTRY, getRoleLabel } from '../ui/trust'
import { Qr, champ, quand } from '../ui/formulaire'
import { EditeurCarte } from '../soignant/EditeurCarte'
import { useDeviceState } from './store'
import { PROFIL_VIDE, baseParDefaut, falsifier, nouvelIdPatient, texteQr, type ProfilSaisi } from './carte'
import { RecevoirCarte } from './RecevoirCarte'
import { ImprimerCarte } from '../ui/ImprimerCarte'

/* ---------- vue ---------- */

export function CarteView() {
  const [carte, setCarte] = useDeviceState('c0-carte', '')
  const [consultations, setConsultations] = useDeviceState<Consultation[]>('c0-consultations', [])
  const [compte] = useDeviceState<{ birthYear?: string; fullName?: string }>('patient-profile', {})
  const [profilStocke, setProfil] = useDeviceState<ProfilSaisi>('c0-profil', { ...PROFIL_VIDE, yb: compte.birthYear ?? '' })
  // Profils enregistrés avant l'ajout de l'âge et du sexe : on complète ; l'année est proposée depuis le compte (le soignant la vérifie).
  const profil: ProfilSaisi = { ...PROFIL_VIDE, ...profilStocke, yb: profilStocke.yb ?? compte.birthYear ?? '' }
  const [patientId, setPatientId] = useDeviceState('c0-id', '')
  const [base, setBase] = useDeviceState('qr-base-url', baseParDefaut())
  const [lecture, setLecture] = useState<string | null>(null)   // null = la carte courante

  const qr = useMemo(() => texteQr(carte, base), [carte, base])
  const version = useMemo(() => { try { return qr.qr ? encode(qr.qr, { ecc: 'M', border: 4 }).version : 0 } catch { return 0 } }, [qr.qr])
  const texteLu = lecture ?? carte
  const verdict = useMemo(() => (texteLu ? verify(texteLu, REGISTRY) : null), [texteLu])
  const signataire = useMemo(() => (carte ? verify(carte, REGISTRY) : null), [carte])
  const [idNeuf] = useState(nouvelIdPatient)                  // stable : ne change pas à chaque affichage
  const id = patientId || idNeuf

  return (
    <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* Carte imprimable */}
      <div className="print-shell lg lg-panel p-2.5">
        <div className="print-card rounded-[20px] bg-[#F4F1EA] p-6 text-[#0A1615] sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <p className="font-display text-lg tracking-wide">LAFIA</p>
            <p className="text-xs uppercase tracking-[0.18em] text-[#0A1615]/50">C0 · urgence</p>
          </div>
          <div className="mx-auto aspect-square w-full max-w-[400px]"><Qr text={qr.qr} /></div>
          {qr.qr && <p className="qr-diagnostic mt-2 text-center text-xs text-[#0A1615]/55">{qr.qr.length} caractères · version QR {version}{qr.lien ? ' · s’ouvre avec l’appareil photo' : ''}</p>}
          {qr.avertissement && <p className="mt-2 text-center text-xs text-[#B45309]">{qr.avertissement}</p>}
          <div className="mt-6 space-y-1 text-sm text-[#0A1615]/75">
            {signataire?.ok ? (
              <>
                <p><strong>Signée par :</strong> {getRoleLabel(signataire.role)}{signataire.etab ? `, ${FACILITIES[signataire.etab] ?? signataire.etab}` : ''}</p>
                <p><strong>Émise le :</strong> {quand(signataire.iat)}</p>
              </>
            ) : <p>Aucune carte signée.</p>}
          </div>
        </div>
      </div>

      <div className="max-w-xl space-y-8">
        <div>
          <p className="mb-5 text-[15px] leading-relaxed text-[#F4F1EA]/70">
            La carte contient le résumé d’urgence, signé par un soignant inscrit au registre. Elle se lit sans réseau. Elle est lisible par toute
            personne qui la scanne : les informations sensibles n’y figurent que si vous l’acceptez.
          </p>
          <label className="mb-5 block text-sm text-[#F4F1EA]/65">
            Adresse publique du site (pour ouvrir la carte avec l’appareil photo)
            <input type="text" inputMode="url" value={base} onChange={e => setBase(e.target.value)} placeholder="https://votre-domaine" className={champ} />
            <span className="mt-1 block text-xs text-[#F4F1EA]/40">Pas de localhost : sur le téléphone, localhost désigne le téléphone lui-même.</span>
          </label>
          {carte ? <ImprimerCarte carte={carte} qr={qr.qr} nomParDefaut={compte.fullName ?? ''} />
            : <p className="text-sm text-[#F4F1EA]/45">L’impression sera possible une fois la carte signée par un soignant.</p>}
          <a href="/#/espace/lecture" className="mt-4 inline-block text-sm text-[#F4F1EA]/70 underline underline-offset-4 hover:text-[#F4F1EA]">Ouvrir le lecteur d’urgence</a>
        </div>

        {/* Nouvelle carte signée par un soignant sur SON téléphone (espace soignant) */}
        <RecevoirCarte idPatient={patientId} carteActuelle={carte}
          onRecue={(texte, payload, profilRecu) => { setCarte(texte); setPatientId(payload.id); setConsultations(payload.co ?? []); setProfil(profilRecu); setLecture(null) }} />

        {/* Mise à jour par un soignant sur le téléphone du patient */}
        <div className="lg lg-panel space-y-6 p-5">
          <div>
            <h3 className="font-display text-2xl font-light text-[#F4F1EA]">Mettre à jour la carte</h3>
            <p className="mt-1 text-sm text-[#F4F1EA]/45">Réservé à un soignant : il relit puis signe avec son badge. Le patient ne peut pas signer sa propre carte. Le soignant peut aussi le faire sur son propre téléphone, depuis l’espace soignant.</p>
          </div>
          <BadgeLoader />
          <div className="border-t border-white/10 pt-5">
            <EditeurCarte profil={profil} onProfil={setProfil} consultations={consultations} patientId={id}
              onSigne={(texte, payload) => { setCarte(texte); setPatientId(payload.id); setConsultations(payload.co ?? []); setLecture(null) }} />
          </div>
        </div>

        {/* Lecture hors ligne : exactement ce que voit le soignant qui scanne */}
        <div className="lg lg-panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-display text-2xl font-light text-[#F4F1EA]">Test de lecture</h3>
            <button onClick={() => setLecture(lecture === null && carte ? falsifier(carte) : null)} disabled={!carte} className="text-xs uppercase tracking-[0.12em] text-[#F4F1EA]/60 hover:text-[#F4F1EA] disabled:opacity-40">
              {lecture !== null ? 'Restaurer la carte' : 'Simuler une falsification'}
            </button>
          </div>
          <textarea value={texteLu} onChange={e => setLecture(e.target.value)} placeholder="Contenu de la carte (L2:…) ou lien" className="min-h-[110px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 p-3 font-mono text-[11px] text-[#F4F1EA]" />
          <div className="mt-4">
            {!verdict ? <p className="text-sm text-[#F4F1EA]/45">Aucune carte à lire.</p>
              : verdict.ok ? <UrgenceView card={verdict} facilities={FACILITIES} />
                : <p role="alert" className="rounded-xl border border-[#D9534A]/40 bg-[#D9534A]/10 px-3 py-2 text-sm text-[#FFD5CF]">✗ Carte refusée : {verdict.reason}. Aucune donnée médicale n’est affichée.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
import { useMemo, useState, type ReactNode } from 'react'
import { PrinterIcon } from '@phosphor-icons/react'
import { encode, renderSVG } from 'uqr'
import { CATALOG, SchemaError, verify, type C0Payload, type Consultation } from '../core'
import { useBadge } from '../ui/BadgeContext'
import { BadgeLoader } from '../ui/BadgeLoader'
import { UrgenceView } from '../ui/UrgenceView'
import { FACILITIES, REGISTRY, getRoleLabel } from '../ui/trust'
import { ADMINISTRES, ALLERGENS, ANTECEDENTS, MEDS, MOTIFS, ORIENT, TRAITEMENTS, label } from '../ui/labels'
import { useDeviceState } from './store'
import {
  CONSULTATION_VIDE, PROFIL_VIDE, SaisieError, aDuContenu, baseParDefaut, construireCarte, construireConsultation,
  construireProfil, falsifier, nouvelIdPatient, sensiblesDe, signerCarte, texteQr,
  type ConsultationSaisie, type Etat, type Liste, type ProfilSaisi,
} from './carte'

/* ---------- petits composants ---------- */

function Chip({ on, onClick, children, tone = 'teal', disabled }: { on: boolean; onClick: () => void; children: ReactNode; tone?: 'teal' | 'amber' | 'red'; disabled?: boolean }) {
  const actif = { teal: 'border-[#4FB3AC] bg-[#4FB3AC]/15 text-[#C8F3EE]', amber: 'border-[#F2A93B] bg-[#F2A93B]/15 text-[#F2A93B]', red: 'border-[#D9534A] bg-[#D9534A]/15 text-[#FFB5AC]' }[tone]
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs disabled:opacity-40 ${on ? actif : 'border-white/15 text-[#F4F1EA]/65 hover:text-[#F4F1EA]'}`}>
      {children}
    </button>
  )
}

const ETATS: { e: Etat; f: string; m: string }[] = [
  { e: 'inconnu', f: 'Non renseignées', m: 'Non renseignés' },
  { e: 'aucun', f: 'Aucune connue', m: 'Aucun connu' },
  { e: 'connu', f: 'Renseignées', m: 'Renseignés' },
]

function ChoixListe({ titre, valeur, onChange, catalogue, feminin, tone = 'teal' }: {
  titre: string; valeur: Liste; onChange: (l: Liste) => void; catalogue: Record<string, string>; feminin?: boolean; tone?: 'teal' | 'red'
}) {
  const bascule = (c: string) => onChange({ ...valeur, codes: valeur.codes.includes(c) ? valeur.codes.filter(x => x !== c) : [...valeur.codes, c].slice(0, 6) })
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-[#F4F1EA]/65">{titre}</legend>
      <div className="flex flex-wrap gap-2">
        {ETATS.map(({ e, f, m }) => (
          <Chip key={e} tone={tone} on={valeur.etat === e} onClick={() => onChange({ etat: e, codes: e === 'connu' ? valeur.codes : [] })}>{feminin ? f : m}</Chip>
        ))}
      </div>
      {valeur.etat === 'connu' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(catalogue).map(([c, l]) => (
            <Chip key={c} tone={tone} on={valeur.codes.includes(c)} onClick={() => bascule(c)}>
              {l}{CATALOG.sensibles.includes(c) ? ' · sensible' : ''}
            </Chip>
          ))}
        </div>
      )}
    </fieldset>
  )
}

function Qr({ text }: { text: string }) {
  const svg = useMemo(() => {
    if (!text) return ''
    try { return renderSVG(text, { ecc: 'M', border: 4 }) } catch { return 'ERREUR' }
  }, [text])
  if (!text) return <p className="p-4 text-center text-sm text-[#0A1615]/60">La carte apparaîtra après sa signature par un soignant.</p>
  if (svg === 'ERREUR') return <p className="p-4 text-center text-sm text-[#D9534A]">QR impossible : contenu trop long.</p>
  return <div className="qr-render h-full w-full" role="img" aria-label="QR de la carte d’urgence" dangerouslySetInnerHTML={{ __html: svg }} />
}

const champ = 'mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[#F4F1EA] outline-none placeholder:text-[#F4F1EA]/25 focus:border-[#4FB3AC]'
const quand = (t: number) => new Date(t * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

/* ---------- aperçu de relecture (ce qui sera signé, rien d'autre) ---------- */

function Apercu({ p }: { p: C0Payload }) {
  const pr = p.pr ?? {}
  const l3 = (v: string[] | undefined, m: Record<string, string>, aucun: string) => (v === undefined ? 'non renseigné' : v.length ? v.map(c => label(m, c)).join(' · ') : aucun)
  return (
    <ul className="space-y-1 text-sm text-[#F4F1EA]/80">
      <li><strong>Né(e) en :</strong> {pr.yb ?? 'non renseigné'} · <strong>Sexe :</strong> {pr.sx === 'F' ? 'femme' : pr.sx === 'M' ? 'homme' : 'non renseigné'}</li>
      <li><strong>Allergies :</strong> {l3(pr.al, ALLERGENS, 'aucune connue')}</li>
      <li><strong>Traitements :</strong> {l3(pr.tx?.map(t => t.c), MEDS, 'aucun')}</li>
      <li><strong>Antécédents :</strong> {l3(pr.ah, ANTECEDENTS, 'aucun connu')}</li>
      <li><strong>Groupe sanguin :</strong> {pr.gs ?? 'non renseigné'}</li>
      {pr.ec && <li><strong>Contact :</strong> {pr.ec.n} · {pr.ec.tel}</li>}
      {pr.vs?.length ? <li className="text-[#F2A93B]">Sensible rendu lisible au choix du patient : {pr.vs.map(c => label(ANTECEDENTS, c)).join(' · ')}</li> : null}
      {(p.co ?? []).map(c => (
        <li key={`${c.t}-${c.a}`} className="pt-1">
          <strong>{quand(c.t)} :</strong> {label(MOTIFS, c.m)}
          {c.c?.temp !== undefined && ` · ${(c.c.temp / 10).toFixed(1)} °C`}
          {c.c?.poids !== undefined && ` · ${(c.c.poids / 10).toFixed(1)} kg`}
          {c.x?.map(x => ` · ${x.k} ${x.v === 'POS' ? 'positif' : 'négatif'}`)}
          {c.adm?.length ? ` · donné : ${c.adm.map(a => label(MEDS, a.c)).join(', ')}` : ''}
          {c.o && ` · ${label(ORIENT, c.o.k)}`}
          <span className="text-[#F4F1EA]/45"> · {getRoleLabel(REGISTRY[c.a]?.role ?? '')} · {FACILITIES[c.f] ?? c.f}</span>
        </li>
      ))}
    </ul>
  )
}

/* ---------- vue ---------- */

export function CarteView() {
  const { badge } = useBadge()
  const [carte, setCarte] = useDeviceState('c0-carte', '')
  const [consultations, setConsultations] = useDeviceState<Consultation[]>('c0-consultations', [])
  const [compte] = useDeviceState<{ birthYear?: string }>('patient-profile', {})
  const [profilStocke, setProfil] = useDeviceState<ProfilSaisi>('c0-profil', { ...PROFIL_VIDE, yb: compte.birthYear ?? '' })
  // Profils enregistrés avant l'ajout de l'âge et du sexe : on complète ; l'année est proposée depuis le compte (le soignant la vérifie).
  const profil: ProfilSaisi = { ...PROFIL_VIDE, ...profilStocke, yb: profilStocke.yb ?? compte.birthYear ?? '' }
  const [patientId, setPatientId] = useDeviceState('c0-id', '')
  const [base, setBase] = useDeviceState('qr-base-url', baseParDefaut())
  const [saisie, setSaisie] = useState<ConsultationSaisie>(CONSULTATION_VIDE)
  const [brouillon, setBrouillon] = useState<C0Payload | null>(null)
  const [relu, setRelu] = useState(false)
  const [erreur, setErreur] = useState('')
  const [lecture, setLecture] = useState<string | null>(null)   // null = la carte courante

  const qr = useMemo(() => texteQr(carte, base), [carte, base])
  const version = useMemo(() => { try { return qr.qr ? encode(qr.qr, { ecc: 'M', border: 4 }).version : 0 } catch { return 0 } }, [qr.qr])
  const texteLu = lecture ?? carte
  const verdict = useMemo(() => (texteLu ? verify(texteLu, REGISTRY) : null), [texteLu])
  const sensibles = sensiblesDe(profil)
  const signataire = useMemo(() => (carte ? verify(carte, REGISTRY) : null), [carte])

  const preparer = () => {
    setErreur(''); setRelu(false)
    try {
      if (!badge) throw new SaisieError('Chargez d’abord le badge du soignant qui relit et signe.')
      const now = Math.floor(Date.now() / 1000)
      const nouvelles = aDuContenu(saisie) ? [...consultations, construireConsultation(saisie, badge, now)] : consultations
      setBrouillon(construireCarte(patientId || nouvelIdPatient(), construireProfil(profil), nouvelles, now))
    } catch (e) {
      setBrouillon(null)
      setErreur(e instanceof Error ? e.message : 'Saisie invalide.')
    }
  }

  const signer = () => {
    if (!brouillon || !badge) return
    try {
      const texte = signerCarte(brouillon, badge)
      setCarte(texte)
      setPatientId(brouillon.id)
      setConsultations(brouillon.co ?? [])
      setSaisie(CONSULTATION_VIDE)
      setBrouillon(null)
      setLecture(null)
      setErreur('')
    } catch (e) {
      setErreur(`Signature refusée : ${e instanceof SchemaError || e instanceof Error ? e.message : 'erreur inconnue'}`)
    }
  }

  const s = (patch: Partial<ConsultationSaisie>) => { setSaisie({ ...saisie, ...patch }); setBrouillon(null) }
  const p = (patch: Partial<ProfilSaisi>) => { setProfil({ ...profil, ...patch }); setBrouillon(null) }

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
          <div className="flex flex-wrap items-center gap-4">
            <button onClick={() => window.print()} disabled={!carte} className="flex items-center gap-2.5 rounded-full bg-[#F4F1EA] px-6 py-3 text-sm font-medium text-[#0A1615] hover:bg-white disabled:opacity-40">
              <PrinterIcon size={16} weight="light" /> Imprimer la carte
            </button>
            <a href="/#/espace/lecture" className="text-sm text-[#F4F1EA]/70 underline underline-offset-4 hover:text-[#F4F1EA]">Ouvrir le lecteur d’urgence</a>
          </div>
        </div>

        {/* Mise à jour par un soignant */}
        <div className="lg lg-panel space-y-6 p-5">
          <div>
            <h3 className="font-display text-2xl font-light text-[#F4F1EA]">Mettre à jour la carte</h3>
            <p className="mt-1 text-sm text-[#F4F1EA]/45">Réservé à un soignant : il relit puis signe avec son badge. Le patient ne peut pas signer sa propre carte.</p>
          </div>
          <BadgeLoader />

          <section className="space-y-5 border-t border-white/10 pt-5">
            <h4 className="text-xs uppercase tracking-[0.14em] text-[#F4F1EA]/50">Profil d’urgence</h4>
            <div className="flex flex-wrap items-end gap-6">
              <label className="text-sm text-[#F4F1EA]/65">
                Année de naissance
                <input inputMode="numeric" maxLength={4} value={profil.yb} onChange={e => p({ yb: e.target.value })} placeholder="1988" className={`${champ} w-28`} />
              </label>
              <fieldset>
                <legend className="mb-2 text-sm text-[#F4F1EA]/65">Sexe</legend>
                <div className="flex gap-2">
                  <Chip on={profil.sx === ''} onClick={() => p({ sx: '' })}>Non renseigné</Chip>
                  <Chip on={profil.sx === 'F'} onClick={() => p({ sx: 'F' })}>Femme</Chip>
                  <Chip on={profil.sx === 'M'} onClick={() => p({ sx: 'M' })}>Homme</Chip>
                </div>
              </fieldset>
            </div>
            <ChoixListe titre="Allergies" feminin tone="red" valeur={profil.al} onChange={al => p({ al })} catalogue={ALLERGENS} />
            <ChoixListe titre="Traitements au long cours" valeur={profil.tx} onChange={tx => p({ tx })} catalogue={TRAITEMENTS} />
            <ChoixListe titre="Maladies de fond / antécédents" valeur={profil.ah} onChange={ah => p({ ah })} catalogue={ANTECEDENTS} />
            {sensibles.length > 0 && (
              <label className="flex items-start gap-2 rounded-xl bg-[#F2A93B]/10 p-3 text-sm text-[#F2A93B]">
                <input type="checkbox" className="mt-1" checked={profil.accordSensible} onChange={e => p({ accordSensible: e.target.checked })} />
                Le patient accepte que « {sensibles.map(c => label(ANTECEDENTS, c)).join(', ')} » soit lisible par toute personne qui scanne sa carte.
              </label>
            )}
            <fieldset>
              <legend className="mb-2 text-sm text-[#F4F1EA]/65">Groupe sanguin</legend>
              <div className="flex flex-wrap gap-2">
                <Chip on={!profil.gs} onClick={() => p({ gs: '' })}>Non renseigné</Chip>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].filter(g => CATALOG.groupes.includes(g)).map(g => (
                  <Chip key={g} tone="red" on={profil.gs === g} onClick={() => p({ gs: g })}>
                    <span className="inline-block min-w-[2.2em] text-center text-sm font-semibold">{g}</span>
                  </Chip>
                ))}
              </div>
              <span className="mt-2 block text-xs text-[#F4F1EA]/40">D’après un résultat fiable. Ne remplace jamais le contrôle prétransfusionnel.</span>
            </fieldset>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm text-[#F4F1EA]/65">Contact d’urgence<input maxLength={30} value={profil.ecNom} onChange={e => p({ ecNom: e.target.value })} placeholder="Nom" className={champ} /></label>
              <label className="text-sm text-[#F4F1EA]/65">Téléphone<input inputMode="tel" maxLength={18} value={profil.ecTel} onChange={e => p({ ecTel: e.target.value })} placeholder="+229 …" className={champ} /></label>
            </div>
          </section>

          <section className="space-y-4 border-t border-white/10 pt-5">
            <h4 className="text-xs uppercase tracking-[0.14em] text-[#F4F1EA]/50">Nouvelle consultation (facultatif)</h4>
            <div className="flex flex-wrap gap-2">
              {CATALOG.motifs.map(m => <Chip key={m} tone="amber" on={saisie.motif === m} onClick={() => s({ motif: saisie.motif === m ? '' : m })}>{label(MOTIFS, m)}</Chip>)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-[#F4F1EA]/55">Température (°C)<input inputMode="decimal" maxLength={5} value={saisie.temp} onChange={e => s({ temp: e.target.value })} placeholder="30 à 45" className={champ} /></label>
              <label className="text-sm text-[#F4F1EA]/55">Poids (kg)<input inputMode="decimal" maxLength={6} value={saisie.poids} onChange={e => s({ poids: e.target.value })} placeholder="0,5 à 300" className={champ} /></label>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[#F4F1EA]/55">
              TDR paludisme :
              <Chip on={saisie.tdr === 'POS'} onClick={() => s({ tdr: saisie.tdr === 'POS' ? '' : 'POS' })}>Positif</Chip>
              <Chip on={saisie.tdr === 'NEG'} onClick={() => s({ tdr: saisie.tdr === 'NEG' ? '' : 'NEG' })}>Négatif</Chip>
            </div>
            <div>
              <p className="mb-2 text-sm text-[#F4F1EA]/55">Médicaments administrés</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ADMINISTRES).map(([c, l]) => <Chip key={c} on={saisie.meds.includes(c)} disabled={!saisie.meds.includes(c) && saisie.meds.length >= 4} onClick={() => s({ meds: saisie.meds.includes(c) ? saisie.meds.filter(x => x !== c) : [...saisie.meds, c] })}>{l}</Chip>)}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[#F4F1EA]/55">
              Orientation :
              {CATALOG.orientations.map(o => <Chip key={o} on={saisie.orientation === o} onClick={() => s({ orientation: saisie.orientation === o ? '' : (o as ConsultationSaisie['orientation']) })}>{label(ORIENT, o)}</Chip>)}
            </div>
            <p className="text-xs text-[#F4F1EA]/40">La carte garde les 3 consultations les plus récentes. Champ vide = non inclus.</p>
          </section>

          {erreur && <p role="alert" className="text-sm text-[#FF8D82]">{erreur}</p>}
          <button onClick={preparer} className="rounded-full bg-[#F2A93B] px-5 py-2.5 text-sm font-medium text-[#0A1615] hover:bg-[#f5b85a]">Relire avant signature</button>

          {brouillon && (
            <div className="rounded-xl border border-[#F2A93B]/40 bg-black/15 p-4">
              <h4 className="mb-2 text-sm font-medium text-[#F4F1EA]">Ce qui sera signé</h4>
              <Apercu p={brouillon} />
              <label className="mt-4 flex items-start gap-2 text-sm text-[#F4F1EA]/80">
                <input type="checkbox" className="mt-1" checked={relu} onChange={e => setRelu(e.target.checked)} />
                J’ai relu ces informations et j’en assume la signature.
              </label>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setBrouillon(null)} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-[#F4F1EA]/70">Modifier</button>
                <button onClick={signer} disabled={!relu || !badge} className="rounded-full bg-[#F2A93B] px-3 py-1.5 text-xs font-medium text-[#0A1615] disabled:opacity-40">Signer la carte</button>
              </div>
            </div>
          )}
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

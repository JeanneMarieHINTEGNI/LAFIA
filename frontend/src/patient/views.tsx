import { useEffect, useMemo, type ReactNode } from 'react'
import { CATALOG, verify } from '../core'
import { ALLERGENS, ANTECEDENTS, MEDS, MOTIFS, label } from '../ui/labels'
import { FACILITIES, REGISTRY, getRoleLabel } from '../ui/trust'
import { useDeviceState } from './store'
import { PROFIL_VIDE, type ProfilSaisi } from './carte'
import { Ecouter } from '../ui/Ecouter'
import { RappelsView } from './Rappels'
import { ExporterIps } from '../ui/ExporterIps'
import { texteCarte } from '../ui/voix'

// Onglets « Mes compartiments » et « Aidant et rappels » : uniquement des données RÉELLES (la carte signée de ce
// téléphone). Ce qui n'est pas encore construit est annoncé comme tel ; aucune donnée d'exemple n'est affichée.

/** Données d'exemple d'anciennes versions : effacées pour qu'elles ne passent jamais pour les vraies. */
const ANCIENNES_CLES = ['lafia:compartments', 'lafia:caregiver', 'lafia:reminders', 'lafia:double-sms']
function useNettoyageDonneesExemple() {
  useEffect(() => { try { ANCIENNES_CLES.forEach(k => localStorage.removeItem(k)) } catch { /* stockage indisponible */ } }, [])
}

/** La carte signée de ce téléphone, revérifiée comme par un lecteur (null = pas de carte). */
function useCarteVerifiee() {
  const [carte] = useDeviceState('c0-carte', '')
  return useMemo(() => {
    if (!carte) return null
    const v = verify(carte, REGISTRY)
    return v.ok ? v : null
  }, [carte])
}

const date = (s: number) => new Date(s * 1000).toLocaleDateString('fr-FR')
const lienCarte = 'text-[#4FB3AC] underline underline-offset-4 decoration-[#4FB3AC]/40 hover:decoration-[#4FB3AC]'

function PasDeCarte() {
  return (
    <div className="max-w-xl rounded-2xl border border-white/10 bg-white/5 p-5 text-[15px] text-[#F4F1EA]/65">
      <p className="text-[#F4F1EA]">Votre carte n’a pas encore été créée.</p>
      <p className="mt-1">Elle se prépare avec un soignant, qui la relit et la signe. <a href="/#/espace/carte" className={lienCarte}>Aller à « Ma carte »</a></p>
    </div>
  )
}

function Bientot({ children }: { children: ReactNode }) {
  return (
    <p className="py-5 text-sm text-[#F4F1EA]/45">
      <span className="mr-2 rounded-full border border-white/15 px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-[#F4F1EA]/60">Bientôt</span>
      {children}
    </p>
  )
}

/* ---------- Compartiments ---------- */

type Ligne = { id: string; rubrique: string; valeur: string; sensible?: boolean }

function lignesDeLaCarte(pr: NonNullable<ReturnType<typeof useCarteVerifiee>>['payload']['pr'] = {}): Ligne[] {
  const sensible = (c: string) => CATALOG.sensibles.includes(c)
  const liste = (codes: string[] | undefined, noms: Record<string, string>, vide: string) =>
    codes === undefined ? null : codes.length ? codes.map(c => label(noms, c)).join(', ') : vide
  const out: Ligne[] = []
  if (pr.gs) out.push({ id: 'gs', rubrique: 'Groupe sanguin', valeur: pr.gs })
  const al = liste(pr.al, ALLERGENS, 'Aucune allergie connue'); if (al) out.push({ id: 'al', rubrique: 'Allergies', valeur: al })
  const tx = liste(pr.tx?.map(t => t.c), MEDS, 'Aucun traitement au long cours'); if (tx) out.push({ id: 'tx', rubrique: 'Traitements', valeur: tx, sensible: pr.tx?.some(t => sensible(t.c)) })
  const ah = liste(pr.ah, ANTECEDENTS, 'Aucun antécédent connu'); if (ah) out.push({ id: 'ah', rubrique: 'Antécédents', valeur: ah, sensible: pr.ah?.some(sensible) })
  if (pr.yb) out.push({ id: 'yb', rubrique: 'Année de naissance', valeur: String(pr.yb) })
  if (pr.sx) out.push({ id: 'sx', rubrique: 'Sexe', valeur: pr.sx === 'F' ? 'Femme' : 'Homme' })
  if (pr.ec) out.push({ id: 'ec', rubrique: 'Contact d’urgence', valeur: `${pr.ec.n} · ${pr.ec.tel}` })
  return out
}

const COMPARTIMENTS = [
  { n: 1, nom: 'Le sensible', regime: 'Chiffré sur votre téléphone. S’ouvrira avec le badge d’un médecin inscrit à l’Ordre, et vous en serez prévenu.' },
  { n: 2, nom: 'Le dossier', regime: 'Votre dossier complet (historique, comptes rendus, examens), conservé sur un serveur comme dans les hôpitaux. Jamais nécessaire pour lire l’urgence.' },
]

export function CompartimentsView() {
  useNettoyageDonneesExemple()
  const carte = useCarteVerifiee()
  const [compte] = useDeviceState<{ fullName?: string }>('patient-profile', {})
  if (!carte) return <PasDeCarte />
  const lignes = lignesDeLaCarte(carte.payload.pr)
  const signataire = `${getRoleLabel(carte.role)}${carte.etab ? `, ${FACILITIES[carte.etab] ?? carte.etab}` : ''}`
  const consultations = carte.payload.co ?? []
  return (
    <div>
      <section className="mb-14">
        <div className="mb-2 grid grid-cols-[auto_1fr] items-baseline gap-6 border-t border-white/10 pt-6">
          <span className="font-display text-5xl font-light leading-none text-[#F4F1EA]/80">0</span>
          <div>
            <h3 className="font-display text-2xl font-light text-[#F4F1EA]">Votre carte</h3>
            <p className="mt-1 max-w-lg text-[15px] text-[#F4F1EA]/50">Signée, lisible par toute personne qui tient la carte, même sans réseau. Voici exactement ce qu’elle contient.</p>
            <p className="mt-2 text-xs text-[#F4F1EA]/40">Signée par : {signataire} · le {date(carte.iat)}</p>
            <Ecouter className="mt-4" phrases={texteCarte(carte, FACILITIES, { pourLePatient: true })} libelle="Écouter ma carte" />
          </div>
        </div>
        <ul>
          {lignes.map(l => (
            <li key={l.id} className="border-b border-white/10 py-5">
              <p className="text-sm text-[#F4F1EA]/45">{l.rubrique}</p>
              <p className="mt-0.5 text-[#F4F1EA]">{l.valeur}</p>
              {l.sensible && <p className="mt-2 text-xs text-[#F2A93B]">Information sensible, visible en urgence parce que vous l’avez choisi.</p>}
            </li>
          ))}
          {consultations.length > 0 && (
            <li className="border-b border-white/10 py-5">
              <p className="text-sm text-[#F4F1EA]/45">Dernières consultations ({consultations.length})</p>
              <p className="mt-0.5 text-[#F4F1EA]">{consultations.map(c => `${date(c.t)} · ${label(MOTIFS, c.m)}`).join(' — ')}</p>
            </li>
          )}
          {lignes.length === 0 && consultations.length === 0 && <li className="py-5 text-sm text-[#F4F1EA]/40">La carte ne contient encore aucune information renseignée.</li>}
        </ul>
        <div className="mt-6 border-t border-white/10 pt-5"><ExporterIps carte={carte} nomParDefaut={compte.fullName ?? ''} /></div>
        <p className="mt-4 text-sm text-[#F4F1EA]/45">
          Pour changer ce que la carte montre (y compris retirer une information sensible), il faut une nouvelle carte, relue et signée par un soignant. <a href="/#/espace/carte" className={lienCarte}>Aller à « Ma carte »</a>
        </p>
      </section>

      {COMPARTIMENTS.map(c => (
        <section key={c.n} className="mb-14">
          <div className="mb-2 grid grid-cols-[auto_1fr] items-baseline gap-6 border-t border-white/10 pt-6">
            <span className="font-display text-5xl font-light leading-none text-[#F4F1EA]/30">{c.n}</span>
            <div>
              <h3 className="font-display text-2xl font-light text-[#F4F1EA]/70">{c.nom}</h3>
              <p className="mt-1 max-w-lg text-[15px] text-[#F4F1EA]/45">{c.regime}</p>
            </div>
          </div>
          <Bientot>Ce compartiment n’est pas encore construit : rien n’y est stocké pour l’instant.</Bientot>
        </section>
      ))}
    </div>
  )
}

/* ---------- Rappels et aidant ---------- */

export function AidantView() {
  useNettoyageDonneesExemple()
  const carte = useCarteVerifiee()
  const [profilStocke] = useDeviceState<ProfilSaisi>('c0-profil', PROFIL_VIDE)
  const ecCarte = carte?.payload.pr?.ec
  const ecSaisi = profilStocke.ecNom?.trim() && profilStocke.ecTel?.trim() ? { n: profilStocke.ecNom.trim(), tel: profilStocke.ecTel.trim() } : undefined
  const modifieNonSigne = Boolean(ecSaisi && (!ecCarte || ecSaisi.n !== ecCarte.n || ecSaisi.tel !== ecCarte.tel))

  return (
    <div className="max-w-2xl">
      <div className="mb-14"><RappelsView /></div>
      <section className="mb-14 border-t border-white/10 pt-6">
        <h3 className="font-display text-2xl font-light text-[#F4F1EA]">Votre aidant</h3>
        <p className="mt-1 text-[15px] text-[#F4F1EA]/50">C’est le contact d’urgence de votre carte : un soignant peut l’appeler, même sans réseau internet.</p>
        {ecCarte ? (
          <p className="mt-5 text-lg text-[#F4F1EA]">
            {ecCarte.n} <span className="text-[#F4F1EA]/45">· </span>
            <a href={`tel:${ecCarte.tel.replace(/\s/g, '')}`} className="underline decoration-white/30 underline-offset-4">{ecCarte.tel}</a>
          </p>
        ) : (
          <p className="mt-5 text-[15px] text-[#F4F1EA]/60">{carte ? 'Votre carte ne contient pas encore de contact d’urgence.' : 'Votre carte n’a pas encore été créée.'}</p>
        )}
        {modifieNonSigne && (
          <p className="mt-3 rounded-xl border border-[#F2A93B]/40 bg-[#F2A93B]/10 px-4 py-2 text-sm text-[#F2A93B]">
            Contact modifié ({ecSaisi!.n} · {ecSaisi!.tel}) mais pas encore sur la carte : il faut la faire signer à nouveau.
          </p>
        )}
        <p className="mt-4 text-sm text-[#F4F1EA]/45">Pour le changer : <a href="/#/espace/carte" className={lienCarte}>« Ma carte »</a>, puis signature par un soignant.</p>
      </section>

    </div>
  )
}
import {
  CATALOG, MAX_CONSULTATIONS, SchemaError, assertShareableBase, newDraft, review, sign, toLink,
  type Badge, type C0Payload, type Consultation, type Profile,
} from '../core'

// Construction de la carte C0 (contrat v2) à partir de la saisie de l'espace patient.
// Règle anti-donnée-inventée : « non renseigné » = champ ABSENT ; « aucun connu » = liste VIDE déclarée.

export type Etat = 'inconnu' | 'aucun' | 'connu'
export type Liste = { etat: Etat; codes: string[] }

export type ProfilSaisi = {
  al: Liste
  tx: Liste
  ah: Liste
  gs: string
  /** Année de naissance (4 chiffres) ; vide = non renseignée. */
  yb: string
  sx: '' | 'F' | 'M'
  ecNom: string
  ecTel: string
  /** Le patient accepte que ses catégories sensibles cochées soient lisibles par quiconque scanne la carte. */
  accordSensible: boolean
}

export const PROFIL_VIDE: ProfilSaisi = {
  al: { etat: 'inconnu', codes: [] },
  tx: { etat: 'inconnu', codes: [] },
  ah: { etat: 'inconnu', codes: [] },
  gs: '', yb: '', sx: '', ecNom: '', ecTel: '', accordSensible: false,
}

export type ConsultationSaisie = {
  motif: string
  temp: string
  poids: string
  tdr: '' | 'POS' | 'NEG'
  meds: string[]
  orientation: '' | 'DOM' | 'SUIV' | 'EVAC'
}

export const CONSULTATION_VIDE: ConsultationSaisie = { motif: '', temp: '', poids: '', tdr: '', meds: [], orientation: '' }

/** Erreur de saisie lisible par l'utilisateur. */
export class SaisieError extends Error {}

const nombre = (s: string) => Number(s.trim().replace(',', '.'))

export function sensiblesDe(p: ProfilSaisi): string[] {
  const vus = [...(p.ah.etat === 'connu' ? p.ah.codes : []), ...(p.tx.etat === 'connu' ? p.tx.codes : [])]
  return [...new Set(vus.filter(c => CATALOG.sensibles.includes(c)))]
}

function liste(l: Liste, nom: string): string[] | undefined {
  if (l.etat === 'inconnu') return undefined
  if (l.etat === 'aucun') return []
  if (!l.codes.length) throw new SaisieError(`${nom} : cochez au moins un élément, ou choisissez « aucun connu ».`)
  return l.codes
}

export function construireProfil(p: ProfilSaisi): Profile {
  const pr: Profile = {}
  const al = liste(p.al, 'Allergies'); if (al) pr.al = al
  const ah = liste(p.ah, 'Antécédents'); if (ah) pr.ah = ah
  const tx = liste(p.tx, 'Traitements'); if (tx) pr.tx = tx.map(c => ({ c }))
  if (p.gs) pr.gs = p.gs
  if (p.yb.trim()) {
    const an = Number(p.yb.trim())
    if (!/^\d{4}$/.test(p.yb.trim()) || an < 1900 || an > new Date().getFullYear()) throw new SaisieError('Année de naissance invalide (4 chiffres).')
    pr.yb = an
  }
  if (p.sx) pr.sx = p.sx
  const nom = p.ecNom.trim(), tel = p.ecTel.trim()
  if (nom || tel) {
    if (!nom || !tel) throw new SaisieError('Contact d’urgence : renseignez le nom ET le téléphone, ou aucun des deux.')
    pr.ec = { n: nom, tel }
  }
  const vs = sensiblesDe(p)
  if (vs.length) {
    if (!p.accordSensible) throw new SaisieError('Information sensible cochée : le patient doit accepter explicitement qu’elle soit lisible en urgence.')
    pr.vs = vs
  }
  return pr
}

export function aDuContenu(s: ConsultationSaisie): boolean {
  return Boolean(s.motif || s.temp.trim() || s.poids.trim() || s.tdr || s.meds.length || s.orientation)
}

export function construireConsultation(s: ConsultationSaisie, badge: { kid: string; etab?: string }, now: number): Consultation {
  if (!badge.etab) throw new SaisieError("Ce badge n'est rattaché à aucun établissement : signature impossible.")
  if (!s.motif) throw new SaisieError('Choisissez un motif de consultation.')
  const co: Consultation = { t: now, f: badge.etab, a: badge.kid, m: s.motif }
  const c: NonNullable<Consultation['c']> = {}
  if (s.temp.trim()) {
    const t = nombre(s.temp)
    if (!Number.isFinite(t) || t < 30 || t > 45) throw new SaisieError('Température : valeur entre 30 et 45 °C.')
    c.temp = Math.round(t * 10)
  }
  if (s.poids.trim()) {
    const kg = nombre(s.poids)
    if (!Number.isFinite(kg) || kg < 0.5 || kg > 300) throw new SaisieError('Poids : valeur entre 0,5 et 300 kg.')
    c.poids = Math.round(kg * 10)
    c.pt = now
  }
  if (Object.keys(c).length) co.c = c
  if (s.tdr) co.x = [{ k: 'TDR', v: s.tdr }]
  if (s.meds.length) co.adm = s.meds.slice(0, 4).map(code => ({ c: code, h: now }))
  if (s.orientation) co.o = { k: s.orientation }
  return co
}

/** Assemble le C0 : profil + au plus 3 consultations, les plus récentes. */
export function construireCarte(id: string, profil: Profile, consultations: Consultation[], now: number): C0Payload {
  const co = [...consultations].sort((a, b) => a.t - b.t).slice(-MAX_CONSULTATIONS)
  return { v: 2, id, iat: now, ...(Object.keys(profil).length ? { pr: profil } : {}), ...(co.length ? { co } : {}) }
}

/** Brouillon → relu par le porteur du badge → signé. Lève SchemaError si la carte sort du contrat. */
export function signerCarte(payload: C0Payload, badge: Badge): string {
  return sign(review(newDraft(payload), badge.kid), badge).text
}

export function nouvelIdPatient(): string {
  return 'p-' + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('')
}

/** Adresse publique par défaut pour le lien QR : VITE_PUBLIC_URL, sinon la page courante si elle n'est pas en localhost. */
export function baseParDefaut(): string {
  const conf = import.meta.env.VITE_PUBLIC_URL?.trim()
  if (conf) return conf
  const here = `${window.location.origin}${window.location.pathname}`
  try { assertShareableBase(here); return here } catch { return '' }
}

/**
 * Texte à mettre dans le QR. Avec une adresse publique : lien `<base>#L2B:…` (s'ouvre avec l'appareil photo).
 * Sans adresse ou si le lien est trop long : texte `L2:…` (QR plus dense, lisible par le scanner de l'application).
 */
export function texteQr(carte: string, base: string): { qr: string; lien: boolean; avertissement: string } {
  if (!carte) return { qr: '', lien: false, avertissement: '' }
  if (!base.trim()) return { qr: carte, lien: false, avertissement: 'Aucune adresse publique : ce QR ne s’ouvre qu’avec le scanner de l’application.' }
  try {
    return { qr: toLink(carte, base.trim()), lien: true, avertissement: '' }
  } catch (e) {
    const raison = e instanceof SchemaError || e instanceof Error ? e.message : 'adresse invalide'
    return { qr: carte, lien: false, avertissement: `${raison}. Le QR contient la carte seule : utilisez le scanner de l’application.` }
  }
}

/** Démo : modifie un caractère au milieu de la carte pour montrer qu'une falsification est refusée. */
export function falsifier(carte: string): string {
  const i = Math.floor(carte.length / 2)
  return carte.slice(0, i) + (carte[i] === 'A' ? 'B' : 'A') + carte.slice(i + 1)
}

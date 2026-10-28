import type { Verified } from '../core'
import { ALERTES, ALLERGENS, ANTECEDENTS, MEDS, MOTIF_LECTURE, label } from './labels'

/**
 * Lecture à voix haute, pour les personnes qui ne lisent pas (patient, aidant, passant).
 *
 * Deux parties : des fonctions PURES qui écrivent le texte à dire (testées), et un petit pilote de la synthèse vocale
 * du téléphone (`speechSynthesis`). Rien ne part sur le réseau : on préfère une voix française installée sur
 * l'appareil, qui marche en mode avion. Le texte dit est exactement ce qui est affiché, rien de plus.
 */

type Ok = Extract<Verified, { ok: true }>

/* ---------------------------------------------------------------- texte à dire */

/** Retire ce qui se lit mal : parenthèses « (acénocoumarol…) », « Infirmier(ère) », points de suspension. */
export function pourLaVoix(s: string): string {
  return s
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/…/g, '')
    .replace(/\b([A-Z]{2,4})\b/g, m => m.split('').join(' '))   // sigles épelés : AVK → « A V K »
    .replace(/\s+/g, ' ')
    .trim()
}

/** « O+ » → « O positif », « AB- » → « A B négatif ». */
export function groupeDit(gs: string): string {
  const m = /^(A|B|AB|O)([+-])$/.exec(gs)
  if (!m) return gs
  return `${m[1] === 'AB' ? 'A B' : m[1]} ${m[2] === '+' ? 'positif' : 'négatif'}`
}

/** Numéro chiffre par chiffre, une pause par groupe : « plus 2 2 9, 0 1, 9 7, … ». */
export function telephoneDit(tel: string): string {
  const groupes = tel.trim().replace(/^\+/, 'plus ').split(/\s+/)
  return groupes.map(g => (g === 'plus' ? g : g.split('').join(' '))).join(', ')
}

export function dateDite(t: number): string {
  const d = new Date(t * 1000)
  const jour = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  return `le ${jour}, à ${d.getHours()} heures${d.getMinutes() ? ` ${d.getMinutes()}` : ''}`
}

const ROLE_DIT: Record<string, string> = { medecin: 'un médecin', infirmier: 'un infirmier ou une infirmière', relais: 'un relais communautaire' }
const liste = (codes: string[], noms: Record<string, string>) => codes.map(c => pourLaVoix(label(noms, c))).join(', ')

/**
 * La carte d'urgence dite à voix haute, dans l'ordre de l'urgence : allergies, points d'attention, groupe sanguin,
 * personne à prévenir, puis traitements, maladies de fond, âge, et qui a signé.
 */
export function texteCarte(carte: Ok, etablissements: Record<string, string>, { pourLePatient = false, now = Math.floor(Date.now() / 1000) } = {}): string[] {
  const pr = carte.payload.pr ?? {}
  const phrases: string[] = [pourLePatient ? 'Voici ce que montre votre carte d’urgence.' : 'Carte d’urgence LAFIA.']

  if (pr.al === undefined) phrases.push('Allergies : non renseignées. Ne pas supposer qu’il n’y en a pas.')
  else if (pr.al.length === 0) phrases.push('Allergies : aucune allergie connue.')
  else phrases.push(`Allergies : ${liste(pr.al, ALLERGENS)}.`)

  const alertes = [...(pr.tx ?? []).map(t => t.c), ...(pr.ah ?? [])].filter(c => ALERTES[c])
  for (const c of alertes) {
    const nom = label(MEDS, c) === c ? label(ANTECEDENTS, c) : label(MEDS, c)
    phrases.push(`Attention : ${pourLaVoix(nom)}, ${ALERTES[c]}.`)
  }

  phrases.push(pr.gs ? `Groupe sanguin : ${groupeDit(pr.gs)}. Faire quand même le contrôle avant transfusion.` : 'Groupe sanguin : non renseigné.')
  phrases.push(pr.ec ? `Personne à prévenir : ${pr.ec.n}. Téléphone : ${telephoneDit(pr.ec.tel)}.` : 'Personne à prévenir : non renseignée.')

  if (pr.tx?.length) phrases.push(`Traitements : ${liste(pr.tx.map(t => t.c), MEDS)}.`)
  else if (pr.tx) phrases.push('Traitements : aucun traitement au long cours.')
  if (pr.ah?.length) phrases.push(`Maladies de fond : ${liste(pr.ah, ANTECEDENTS)}.`)

  const age = pr.yb ? new Date(now * 1000).getFullYear() - pr.yb : undefined
  const qui = [age !== undefined ? `${age} ans` : '', pr.sx === 'F' ? 'femme' : pr.sx === 'M' ? 'homme' : ''].filter(Boolean).join(', ')
  if (qui) phrases.push(`${pourLePatient ? 'Âge et sexe' : 'Personne'} : ${qui}.`)

  const ou = carte.etab ? `, ${pourLaVoix(etablissements[carte.etab] ?? 'établissement inconnu')}` : ''
  phrases.push(`Carte signée par ${ROLE_DIT[carte.role] ?? 'un soignant'}${ou}, ${dateDite(carte.iat)}.`)
  return phrases
}

export type LigneJournalDite = {
  t: number
  lieu?: string
  qui: 'badge' | 'sans_badge' | 'inconnu' | 'invalide'
  role?: string
  motif?: string
  action: 'LECTURE' | 'ECRITURE'
}

/** Le journal dit à voix haute : les lectures les plus récentes d'abord (au plus `max`). */
export function texteJournal(lignes: LigneJournalDite[], max = 10): string[] {
  if (lignes.length === 0) return ['Personne n’a encore lu votre carte.']
  const n = lignes.length
  const phrases = [n === 1 ? 'Votre carte a été lue ou mise à jour une fois.' : `Votre carte a été lue ou mise à jour ${n} fois.`]
  if (n > max) phrases.push(`Voici les ${max} plus récentes.`)
  for (const l of lignes.slice(0, max)) {
    if (l.qui === 'invalide') { phrases.push(`${capital(dateDite(l.t))} : une ligne falsifiée. Ne pas en tenir compte.`); continue }
    const lieu = l.lieu ? `, à ${pourLaVoix(l.lieu)}` : ''
    const qui = l.qui === 'badge' ? (ROLE_DIT[l.role ?? ''] ?? 'un soignant') : l.qui === 'sans_badge' ? 'une personne sans badge' : 'un badge inconnu ou retiré'
    const fait = l.action === 'ECRITURE' ? 'a signé une nouvelle carte' : 'a lu votre carte'
    let phrase = `${capital(dateDite(l.t))}${lieu} : ${qui} ${fait}.`
    if (l.qui === 'sans_badge') phrase += l.motif ? ` Raison donnée : ${(MOTIF_LECTURE[l.motif] ?? l.motif).toLowerCase()}. Ce n’est pas vérifié.` : ' Ce n’est pas vérifié.'
    if (l.qui === 'inconnu') phrase += ' Ce n’est pas vérifié.'
    phrases.push(phrase)
  }
  return phrases
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/* ---------------------------------------------------------------- synthèse vocale */

type Synthese = Pick<SpeechSynthesis, 'speak' | 'cancel' | 'getVoices'>

export function synthese(): Synthese | null {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined' ? window.speechSynthesis : null
  } catch { return null }
}

/** Une voix française, de préférence installée sur le téléphone (marche sans réseau), puis fr-FR. */
export function voixFrancaise(voix: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const fr = voix.filter(v => v.lang?.toLowerCase().replace('_', '-').startsWith('fr'))
  const score = (v: SpeechSynthesisVoice) => (v.localService ? 2 : 0) + (v.lang.toLowerCase().replace('_', '-') === 'fr-fr' ? 1 : 0)
  return fr.sort((a, b) => score(b) - score(a))[0] ?? null
}

/**
 * Dit les phrases une par une (une longue phrase unique se coupe sur certains téléphones). Renvoie false si le
 * téléphone n'a pas de synthèse vocale. `onFin` est appelé à la fin, ou à l'arrêt.
 */
export function dire(phrases: string[], onFin?: () => void, s: Synthese | null = synthese()): boolean {
  if (!s || phrases.length === 0) return false
  s.cancel()
  const voix = voixFrancaise(s.getVoices())
  phrases.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p)
    u.lang = voix?.lang ?? 'fr-FR'
    if (voix) u.voice = voix
    u.rate = 0.9                       // un peu plus lent : plus clair, surtout pour les chiffres
    if (i === phrases.length - 1) { u.onend = () => onFin?.(); u.onerror = () => onFin?.() }
    s.speak(u)
  })
  return true
}

export function arreter(s: Synthese | null = synthese()) {
  s?.cancel()
}
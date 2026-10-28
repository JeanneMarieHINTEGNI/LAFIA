import { pourLaVoix } from '../ui/voix'

/**
 * Rappels de traitement, sur le téléphone du patient seulement (rien n'est envoyé, rien n'est signé).
 * Un rappel = un médicament, une couleur, des heures de prise chaque jour. Le patient coche « pris » ; on garde
 * 30 jours de prises pour le suivi de la semaine.
 *
 * Limite assumée : une page web ne peut pas sonner quand l'appli est fermée. Les alertes hors appli viendront avec
 * le serveur (SMS qui ne nomme jamais la maladie ni le médicament).
 */

export const COULEURS = {
  blanc: { nom: 'blanc', hex: '#F4F1EA' },
  jaune: { nom: 'jaune', hex: '#F2C94C' },
  orange: { nom: 'orange', hex: '#F2994A' },
  rouge: { nom: 'rouge', hex: '#E5534B' },
  bleu: { nom: 'bleu', hex: '#56A3F2' },
  vert: { nom: 'vert', hex: '#4FB3AC' },
} as const
export type Couleur = keyof typeof COULEURS

export type Rappel = {
  id: string
  nom: string               // libellé du médicament (celui de la carte, ou saisi par le patient)
  code?: string             // code du traitement sur la carte, s'il en vient
  couleur: Couleur
  heures: string[]          // « 08:00 », triées
  cree: string              // jour de création (AAAA-MM-JJ) : les jours d'avant ne comptent pas comme oubliés
}

/** Prises cochées : jour → (clé de la dose → instant de la prise, en secondes). */
export type Prises = Record<string, Record<string, number>>

export type EtatDose = 'pris' | 'maintenant' | 'a_venir' | 'oubliee'
export type Dose = { rappel: Rappel; heure: string; cle: string; etat: EtatDose; prisA?: number }

export const MOMENTS = [
  { nom: 'Matin', heure: '08:00' },
  { nom: 'Midi', heure: '12:00' },
  { nom: 'Soir', heure: '19:00' },
  { nom: 'Nuit', heure: '22:00' },
] as const

const AVANT_MIN = 30          // on peut la prendre 30 min avant l'heure…
const FENETRE_MIN = 180       // … et jusqu'à 3 h après ; ensuite elle est « oubliée » (on peut encore la cocher)
const GARDER_JOURS = 30
const MAX_RAPPELS = 12
const MAX_HEURES = 6
const RX_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/

const deux = (n: number) => String(n).padStart(2, '0')
/** Jour LOCAL du téléphone, AAAA-MM-JJ (pas l'UTC : à 23 h à Cotonou on est encore « aujourd'hui »). */
export const jourCle = (d: Date) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
const minutes = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))
export const cleDose = (r: Rappel, heure: string) => `${r.id}@${heure}`

export class RappelInvalide extends Error {}

/** Crée un rappel après vérification ; lève RappelInvalide avec un message clair sinon. */
export function nouveauRappel(saisie: { nom: string; code?: string; couleur: Couleur; heures: string[] }, existants: Rappel[], maintenant = new Date(), id: string = crypto.randomUUID()): Rappel {
  const nom = saisie.nom.trim().replace(/\s+/g, ' ')
  if (!nom) throw new RappelInvalide('Choisissez le médicament.')
  if (nom.length > 40) throw new RappelInvalide('Nom trop long (40 caractères au plus).')
  if (!(saisie.couleur in COULEURS)) throw new RappelInvalide('Couleur inconnue.')
  const heures = [...new Set(saisie.heures)].sort()
  if (heures.length === 0) throw new RappelInvalide('Choisissez au moins une heure de prise.')
  if (heures.length > MAX_HEURES) throw new RappelInvalide(`${MAX_HEURES} prises par jour au plus.`)
  if (heures.some(h => !RX_HEURE.test(h))) throw new RappelInvalide('Heure invalide.')
  if (existants.length >= MAX_RAPPELS) throw new RappelInvalide(`${MAX_RAPPELS} rappels au plus.`)
  if (existants.some(r => r.nom.toLowerCase() === nom.toLowerCase())) throw new RappelInvalide('Ce médicament a déjà un rappel : supprimez-le d’abord pour le changer.')
  return { id, nom, ...(saisie.code ? { code: saisie.code } : {}), couleur: saisie.couleur, heures, cree: jourCle(maintenant) }
}

/** Les doses d'aujourd'hui, dans l'ordre de la journée, avec leur état. */
export function dosesDuJour(rappels: Rappel[], prises: Prises, maintenant = new Date()): Dose[] {
  const jour = jourCle(maintenant)
  const faites = prises[jour] ?? {}
  const m = maintenant.getHours() * 60 + maintenant.getMinutes()
  const doses: Dose[] = []
  for (const r of rappels) {
    for (const heure of r.heures) {
      const cle = cleDose(r, heure)
      const prisA = faites[cle]
      const ecart = m - minutes(heure)
      const etat: EtatDose = prisA ? 'pris' : ecart > FENETRE_MIN ? 'oubliee' : ecart >= -AVANT_MIN ? 'maintenant' : 'a_venir'
      doses.push({ rappel: r, heure, cle, etat, ...(prisA ? { prisA } : {}) })
    }
  }
  return doses.sort((a, b) => a.heure.localeCompare(b.heure) || a.rappel.nom.localeCompare(b.rappel.nom))
}

/** Coche une dose (aujourd'hui), et oublie les jours de plus de 30 jours. */
export function marquerPrise(prises: Prises, cle: string, maintenant = new Date()): Prises {
  const jour = jourCle(maintenant)
  return nettoyer({ ...prises, [jour]: { ...(prises[jour] ?? {}), [cle]: Math.floor(maintenant.getTime() / 1000) } }, maintenant)
}

export function annulerPrise(prises: Prises, cle: string, maintenant = new Date()): Prises {
  const jour = jourCle(maintenant)
  const { [cle]: _retire, ...reste } = prises[jour] ?? {}
  return { ...prises, [jour]: reste }
}

export function nettoyer(prises: Prises, maintenant = new Date()): Prises {
  const limite = new Date(maintenant); limite.setDate(limite.getDate() - GARDER_JOURS)
  const min = jourCle(limite)
  return Object.fromEntries(Object.entries(prises).filter(([j]) => j >= min))
}

/** Les 7 derniers jours (aujourd'hui compris) : doses prévues et prises. Aujourd'hui ne compte que ce qui est déjà dû. */
export function suiviSemaine(rappels: Rappel[], prises: Prises, maintenant = new Date()): { jour: string; prevues: number; prises: number }[] {
  const out = []
  const m = maintenant.getHours() * 60 + maintenant.getMinutes()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(maintenant); d.setDate(d.getDate() - i)
    const jour = jourCle(d)
    const faites = prises[jour] ?? {}
    let prevues = 0, prisesJour = 0
    for (const r of rappels) {
      if (r.cree > jour) continue
      for (const h of r.heures) {
        const cochee = Boolean(faites[cleDose(r, h)])
        if (i === 0 && !cochee && minutes(h) > m) continue     // pas encore l'heure : ni prévue ni oubliée
        prevues++
        if (cochee) prisesJour++
      }
    }
    out.push({ jour, prevues, prises: prisesJour })
  }
  return out
}

/** Nom affiché : en mode discret, seulement la couleur (« Médicament bleu »), pour un écran vu par d'autres. */
export const nomAffiche = (r: Rappel, discret: boolean) => (discret ? `Médicament ${COULEURS[r.couleur].nom}` : r.nom)

export function heureDite(h: string): string {
  const [hh, mm] = [Number(h.slice(0, 2)), Number(h.slice(3, 5))]
  return `${hh} heure${hh > 1 ? 's' : ''}${mm ? ` ${mm}` : ''}`
}

const ETAT_DIT: Record<EtatDose, string> = { pris: 'C’est pris.', maintenant: 'À prendre maintenant.', a_venir: 'Plus tard.', oubliee: 'Pas encore pris : l’heure est passée.' }

/** Les rappels du jour, dits à voix haute. */
export function texteRappels(doses: Dose[], discret: boolean): string[] {
  if (doses.length === 0) return ['Vous n’avez aucun rappel pour aujourd’hui.']
  const reste = doses.filter(d => d.etat !== 'pris').length
  const phrases = [reste === 0 ? 'Aujourd’hui, tout est pris. Bravo.' : `Aujourd’hui, il reste ${reste} prise${reste > 1 ? 's' : ''}.`]
  for (const d of doses) phrases.push(`À ${heureDite(d.heure)} : ${pourLaVoix(nomAffiche(d.rappel, discret))}${discret ? '' : `, ${COULEURS[d.rappel.couleur].nom}`}. ${ETAT_DIT[d.etat]}`)
  return phrases
}
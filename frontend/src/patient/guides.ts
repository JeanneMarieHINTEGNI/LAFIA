import type { Verified } from '../core'
import { texteCarte } from '../ui/voix'
import { dosesDuJour, texteRappels, type Prises, type Rappel } from './rappels'

/**
 * Aide vocale de l'espace patient, pour qui ne lit pas : à chaque écran, le téléphone dit où l'on est, ce qu'il y a
 * à faire, et lit directement l'essentiel (la carte, les rappels du jour). Textes PURS, testés ; la voix est dans
 * GuideVocal.tsx. Les boutons sont nommés par leur COULEUR et leur forme, pas seulement par leur texte.
 */

type Ok = Extract<Verified, { ok: true }>

export type Contexte = {
  prenom: string
  carte: Ok | null
  etablissements: Record<string, string>
  rappels: Rappel[]
  prises: Prises
  maintenant?: Date
}

/** Les boutons du bas de l'écran, de gauche à droite, tels qu'on les dit. */
export const BAS_ECRAN = 'En bas de l’écran, il y a cinq boutons. De gauche à droite : mon journal, ma carte, urgence, compartiments, et rappels.'

export function accueilVocal(prenom: string): string[] {
  return [`Bonjour ${prenom || ''}.`.replace(' .', '.'), 'Vous êtes dans votre espace LAFIA. L’aide vocale est activée : à chaque écran, le téléphone vous dit ce qu’il y a.', BAS_ECRAN]
}

export function guideOnglet(id: string, c: Contexte): string[] {
  switch (id) {
    case 'journal':
      return ['Mon journal.', 'Ici, vous savez qui a lu votre carte, quand et où.', 'Pour l’entendre, touchez le bouton vert « Écouter mon journal ».']
    case 'carte':
      return c.carte
        ? ['Ma carte.', 'C’est votre carte d’urgence, avec son grand carré noir et blanc, le code QR. Montrez-la au soignant : il la lit même sans réseau.', ...texteCarte(c.carte, c.etablissements, { pourLePatient: true }).slice(1)]
        : ['Ma carte.', 'Votre carte n’est pas encore faite. Au prochain rendez-vous, demandez au soignant de la remplir et de la signer.']
    case 'lecture':
      return ['Urgence.', 'Cet écran sert à lire la carte d’une AUTRE personne, par exemple quelqu’un qui a fait un malaise.', 'Touchez la raison, par exemple « Patient inconscient », puis « Scanner la carte », et montrez la carte au téléphone.']
    case 'compartiments':
      return ['Compartiments.', 'Ici, vous voyez ce que votre carte montre en urgence.', c.carte ? 'Pour l’entendre, touchez le bouton vert « Écouter ma carte ».' : 'Votre carte n’est pas encore faite.']
    case 'aidant': {
      const doses = dosesDuJour(c.rappels, c.prises, c.maintenant)
      return [
        'Rappels.',
        ...(c.rappels.length ? texteRappels(doses, false) : ['Vous n’avez pas encore de rappel. Demandez à un proche ou à un soignant de vous aider à en ajouter.']),
        ...(c.rappels.length ? ['Après avoir pris un médicament, touchez le bouton vert « Je l’ai pris ».'] : []),
        c.carte?.payload.pr?.ec ? `Plus bas, la personne à prévenir en cas d’urgence : ${c.carte.payload.pr.ec.n}.` : '',
      ].filter(Boolean)
    }
    default:
      return []
  }
}

/** L'écran de bienvenue (pas encore d'espace sur ce téléphone). */
export const GUIDE_BIENVENUE = [
  'Bienvenue dans LAFIA.',
  'Si c’est la première fois, touchez le bouton orange « Créer mon espace ».',
  'Si vous aviez déjà un espace sur un autre téléphone, touchez « Retrouver mon espace ». Il vous faudra votre code de secours.',
  'Pour lire la carte d’urgence de quelqu’un d’autre, touchez le bouton blanc « Lire une carte d’urgence ».',
]

export const GUIDE_CREATION = [
  'Créer votre espace.',
  'Écrivez votre prénom, votre nom, et votre année de naissance. Un proche peut vous aider.',
  'Ces informations restent sur ce téléphone.',
  'Ensuite, touchez le bouton orange « Créer mon espace », tout en bas.',
]
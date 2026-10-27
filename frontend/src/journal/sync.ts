import { journal } from './usejournal'
import type { Entree } from './index'
import { appliquerRegistre } from '../ui/trust'

/**
 * Synchronisation du journal avec le backend (/api, même origine que le site).
 *
 * Règle d'or : le réseau ne bloque JAMAIS une lecture d'urgence. L'entrée est d'abord écrite sur l'appareil
 * (avant l'affichage, comme avant) ; l'envoi au serveur se fait ensuite, en arrière-plan, et se réessaie
 * tout seul quand le réseau revient. Serveur injoignable = journal local seulement, rien de cassé.
 */

const API = '/api'
const CLE_CHAINE = 'lafia.chaine'          // identifiant aléatoire de CET appareil lecteur
const CLE_ENVOYE = 'lafia.chaine.envoye'   // prochain rang que le serveur attend
const CLE_JETON = 'lafia:patient-jeton'    // secret du patient (son téléphone seulement)
const CLE_ENREGISTRE = 'lafia:patient-enregistre'

const hexAleatoire = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('')
const b64urlAleatoire = (n: number) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function lire(cle: string): string | null { try { return localStorage.getItem(cle) } catch { return null } }
function ecrire(cle: string, v: string) { try { localStorage.setItem(cle, v) } catch { /* stockage indisponible */ } }

export function idChaine(): string {
  let c = lire(CLE_CHAINE)
  if (!c || !/^c-[0-9a-f]{32}$/.test(c)) { c = 'c-' + hexAleatoire(16); ecrire(CLE_CHAINE, c) }
  return c
}

let enCours: Promise<void> | null = null

/** Envoie au serveur les entrées locales qu'il n'a pas encore. Ne lève jamais. */
export function envoyerJournal(): Promise<void> {
  if (enCours) return enCours
  enCours = (async () => {
    try {
      const toutes = await journal.toutes()
      const depuis = Number(lire(CLE_ENVOYE) ?? 0) || 0
      const aEnvoyer = toutes.filter(e => e.i >= depuis)
      if (!aEnvoyer.length) return
      const r = await fetch(`${API}/journal/chaines/${idChaine()}/entrees`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entrees: aEnvoyer.slice(0, 500) }),
      })
      if (r.ok) {
        const { prochain_rang } = (await r.json()) as { prochain_rang: number }
        ecrire(CLE_ENVOYE, String(prochain_rang))
        if (aEnvoyer.length > 500) void Promise.resolve().then(() => envoyerJournal())
      } else if (r.status === 422 || r.status === 409) {
        console.warn('[Lafia] le serveur refuse le journal de cet appareil :', await r.text())
      }
    } catch { /* hors ligne ou serveur absent : on réessaiera */ }
    finally { enCours = null }
  })()
  return enCours
}

/** Récupère le registre des badges signé ; appliqué seulement s'il est authentique ET plus récent. Ne lève jamais. */
export async function rafraichirRegistre(): Promise<'applique' | 'deja_a_jour' | 'invalide' | 'injoignable'> {
  try {
    const r = await fetch(`${API}/registre`, { cache: 'no-store' })
    if (!r.ok) return 'injoignable'
    const res = appliquerRegistre(await r.json())
    if (res === 'invalide') console.warn('[Lafia] registre reçu du serveur refusé : signature de l’autorité invalide')
    return res
  } catch { return 'injoignable' }
}

/** À appeler une fois au démarrage : registre à jour, puis envoi du journal après chaque nouvelle entrée et au retour du réseau. */
export function demarrerSynchro() {
  journal.subscribe(() => void envoyerJournal())
  const toutRafraichir = () => { void rafraichirRegistre(); void envoyerJournal() }
  window.addEventListener('online', toutRafraichir)
  // Un appareil resté ouvert longtemps (poste d'un centre de santé) reprend les révocations régulièrement.
  setInterval(() => void rafraichirRegistre(), 30 * 60 * 1000)
  toutRafraichir()
}

/* ---------- côté patient ---------- */

export type EntreeServeur = Entree & { chaine: string; statut: 'signee' | 'sans_badge' | 'badge_inconnu' }

/** Le secret du patient (créé au premier besoin). Il ne quitte ce téléphone que dans le code de secours. */
export function jetonPatient(): string {
  let j = lire(CLE_JETON)
  if (!j) { j = b64urlAleatoire(32); ecrire(CLE_JETON, j) }
  return j
}

/** Le serveur reconnaît-il ce secret pour cet identifiant ? (changement de téléphone) */
export async function verifierJeton(id: string, jeton: string): Promise<'ok' | 'refuse' | 'trop' | 'injoignable'> {
  try {
    const r = await fetch(`${API}/journal/patients/${id}`, { headers: { Authorization: `Bearer ${jeton}` }, cache: 'no-store' })
    if (r.ok) return 'ok'
    if (r.status === 429) return 'trop'          // trop d'essais refusés depuis cette adresse : le serveur bloque un moment
    return r.status === 401 ? 'refuse' : 'injoignable'
  } catch { return 'injoignable' }
}

/** Ce téléphone reprend l'identité vérifiée d'un ancien téléphone. */
export function adopterIdentite(id: string, jeton: string) {
  ecrire(CLE_JETON, jeton)
  ecrire(CLE_ENREGISTRE, id)
  ecrire('lafia:c0-id', JSON.stringify(id))
}

/** Enregistre le patient auprès du serveur (une fois). Renvoie false si le serveur est injoignable ou refuse. */
export async function enregistrerPatient(id: string): Promise<boolean> {
  if (lire(CLE_ENREGISTRE) === id) return true
  try {
    const r = await fetch(`${API}/patients`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, jeton: jetonPatient() }) })
    if (r.ok) { ecrire(CLE_ENREGISTRE, id); return true }
  } catch { /* hors ligne */ }
  return false
}

/** Les lectures de la carte du patient enregistrées sur le serveur, depuis tous les appareils. null = injoignable. */
export async function journalDuServeur(id: string): Promise<EntreeServeur[] | null> {
  if (!(await enregistrerPatient(id))) return null
  try {
    const r = await fetch(`${API}/journal/patients/${id}`, { headers: { Authorization: `Bearer ${jetonPatient()}` } })
    if (!r.ok) return null
    return ((await r.json()) as { entrees: EntreeServeur[] }).entrees
  } catch { return null }
}
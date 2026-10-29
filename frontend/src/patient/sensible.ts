import { CATALOG } from '../core'

/**
 * Compartiment 1, « le sensible » — étape A : seul le patient l'ouvre, avec son code, sur son téléphone, sans réseau.
 *
 * Chiffrement : AES-GCM 256 bits, clé dérivée du code par PBKDF2-SHA-256 (sel aléatoire, 310 000 itérations), via
 * WebCrypto. Rien n'est envoyé ; rien n'est lisible dans le stockage du téléphone sans le code.
 *
 * Limite assumée, dite à l'écran : un code de 4 à 6 chiffres arrête quelqu'un qui prend le téléphone, pas un expert
 * qui copie le stockage et essaie tous les codes. Code oublié = contenu perdu (personne, pas même LAFIA, ne peut l'ouvrir).
 * Étape B (plus tard) : copie chiffrée sur le serveur, ouverte par un médecin en bris de glace, journalisée.
 */

export const CLE_COFFRE = 'lafia:sensible-v1'
export const ITERATIONS = 310_000
export const RX_CODE = /^\d{4,6}$/

export type ElementSensible = { id: string; code: string; note?: string; depuis?: string }
export type ContenuSensible = { v: 1; elements: ElementSensible[]; maj: number }
export type Coffre = { v: 1; sel: string; iter: number; iv: string; ct: string }

/** Catégories proposées : celles que le contrat classe « sensibles », plus « Autre ». */
export const CATEGORIES: Record<string, string> = {
  VIH: 'VIH', ARV: 'Traitement antirétroviral', PSY: 'Santé mentale', GROSSESSE: 'Grossesse', IVG: 'Interruption de grossesse',
  ADDICT: 'Addiction', DREPANO: 'Drépanocytose', AUTRE: 'Autre',
}
// Garde-fou : toute catégorie sensible du contrat a un libellé ici.
for (const c of CATALOG.sensibles) if (!CATEGORIES[c]) CATEGORIES[c] = c

export class CodeInvalide extends Error {}

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
const deB64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), c => c.charCodeAt(0))

async function cle(code: string, sel: Uint8Array<ArrayBuffer>, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

/** Chiffre le contenu avec le code (nouveau sel et nouvel IV à chaque fois). */
export async function fermer(contenu: ContenuSensible, code: string, iter = ITERATIONS): Promise<Coffre> {
  if (!RX_CODE.test(code)) throw new CodeInvalide('Le code fait de 4 à 6 chiffres.')
  const sel = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cle(code, sel, iter), new TextEncoder().encode(JSON.stringify(contenu)))
  return { v: 1, sel: b64(sel), iter, iv: b64(iv), ct: b64(ct) }
}

/** Ouvre le coffre ; lève CodeInvalide si le code est faux (l'authentification AES-GCM échoue). */
export async function ouvrir(coffre: Coffre, code: string): Promise<ContenuSensible> {
  try {
    const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(coffre.iv) }, await cle(code, deB64(coffre.sel), coffre.iter), deB64(coffre.ct))
    const c = JSON.parse(new TextDecoder().decode(clair)) as ContenuSensible
    if (c.v !== 1 || !Array.isArray(c.elements)) throw new Error('format')
    return c
  } catch {
    throw new CodeInvalide('Code incorrect.')
  }
}

export function lireCoffre(): Coffre | null {
  try {
    const c = JSON.parse(localStorage.getItem(CLE_COFFRE) ?? 'null') as Coffre | null
    return c && c.v === 1 && c.sel && c.iv && c.ct ? c : null
  } catch { return null }
}
export function ecrireCoffre(c: Coffre | null) {
  try { if (c) localStorage.setItem(CLE_COFFRE, JSON.stringify(c)); else localStorage.removeItem(CLE_COFFRE) } catch { /* stockage indisponible */ }
}

/** Codes trop faciles à deviner : refusés à la création. */
export function codeTropSimple(code: string): boolean {
  if (/^(\d)\1+$/.test(code)) return true                                   // 0000, 111111
  const suite = '01234567890', inverse = '09876543210'
  if (suite.includes(code) || inverse.includes(code)) return true           // 1234, 9876
  return ['1212', '2580', '0852', '1122', '6969', '2000', '1990', '2001'].includes(code)
}

/* ---------- essais : pause croissante après plusieurs codes faux (sur ce téléphone) ---------- */

export const CLE_ESSAIS = 'lafia:sensible-essais'
export type Essais = { faux: number; jusqua: number }       // jusqua : instant (ms) avant lequel on refuse d'essayer

/** Après 5 codes faux : 30 s, puis le double à chaque nouvel échec (plafond 1 h). */
export function apresEchec(e: Essais, maintenant = Date.now()): Essais {
  const faux = e.faux + 1
  const attente = faux < 5 ? 0 : Math.min(3600_000, 30_000 * 2 ** (faux - 5))
  return { faux, jusqua: maintenant + attente }
}
export const AUCUN_ESSAI: Essais = { faux: 0, jusqua: 0 }
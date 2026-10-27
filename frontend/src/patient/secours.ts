import { b45encode, verify, type C0Payload, type Consultation, type Profile, type Registry } from '../core'
import { PROFIL_VIDE, type Liste, type ProfilSaisi } from './carte'

/**
 * Changer de téléphone sans perdre son espace.
 *
 * RÈGLE DE SÉCURITÉ : la carte ouvre l'URGENCE, jamais le COMPTE. Elle est lisible par quiconque la tient (c'est voulu) ;
 * elle ne prouve donc pas qu'on est le patient. Retrouver un espace exige le CODE DE SECOURS, confirmé par le serveur.
 * La carte ne s'importe qu'ensuite, et seulement si elle porte le même identifiant.
 *
 * Le code de secours = identifiant Lafia + secret du patient + contrôle (4 caractères). Le contrôle détecte une faute
 * de frappe ; il n'est PAS secret (n'importe qui peut le calculer) : seul le serveur peut dire si le secret est le bon.
 * Le code ne contient aucune donnée médicale.
 */

export const PREFIXE_SECOURS = 'LAFIA-SECOURS:'
const RX_CODE = /^LAFIA-SECOURS:(p-[0-9a-f]{8,16}):([A-Za-z0-9_-]{32,128}):([0-9a-f]{4})$/

async function controle(id: string, jeton: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${id}:${jeton}`)))
  return Array.from(h.slice(0, 2), b => b.toString(16).padStart(2, '0')).join('')
}

/** Le QR scanné est-il un code de secours Lafia ? */
export const estCodeSecours = (texte: string) => texte.replace(/\s+/g, '').startsWith(PREFIXE_SECOURS)

export async function codeSecours(id: string, jeton: string): Promise<string> {
  return `${PREFIXE_SECOURS}${id}:${jeton}:${await controle(id, jeton)}`
}

export type CodeLu = { ok: true; id: string; jeton: string } | { ok: false; erreur: string }

/** Lit un code collé ou recopié (espaces et retours à la ligne ignorés). */
export async function lireCodeSecours(texte: string): Promise<CodeLu> {
  const brut = texte.replace(/\s+/g, '')
  const m = RX_CODE.exec(brut)
  if (!m) return { ok: false, erreur: 'Ce n’est pas un code de secours Lafia (il commence par « LAFIA-SECOURS: »).' }
  const [, id, jeton, ctrl] = m
  if ((await controle(id, jeton)) !== ctrl) return { ok: false, erreur: 'Code de secours mal recopié : vérifiez chaque caractère.' }
  return { ok: true, id, jeton }
}

const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0))

/** Carte collée sous forme de texte `L2:…` ou de lien `…#L2B:…` → texte `L2:…` (la forme que garde l'espace patient). */
export function carteEnTexte(saisie: string): string {
  const s = saisie.trim()
  const i = s.indexOf('#L2B:')
  if (i >= 0) return `L2:${b45encode(unb64u(s.slice(i + 5)))}`
  return s
}

export type CarteRestauree = { ok: true; carte: string; payload: C0Payload } | { ok: false; erreur: string }

/**
 * Vérifie la carte comme le ferait un lecteur d'urgence, et qu'elle appartient à l'identifiant DÉJÀ PROUVÉ par le code
 * de secours. `idAttendu` est obligatoire : une carte seule ne doit jamais suffire à prendre une identité.
 */
export function restaurerCarte(saisie: string, registre: Registry, idAttendu: string, now?: number): CarteRestauree {
  let carte: string
  try { carte = carteEnTexte(saisie) } catch { return { ok: false, erreur: 'Carte illisible.' } }
  const v = verify(carte, registre, now)
  if (!v.ok) return { ok: false, erreur: `Carte refusée : ${v.reason}` }
  if (v.payload.id !== idAttendu) return { ok: false, erreur: 'Cette carte appartient à un autre espace que ce code de secours.' }
  return { ok: true, carte, payload: v.payload }
}

const liste = (codes: string[] | undefined): Liste =>
  codes === undefined ? { etat: 'inconnu', codes: [] } : codes.length ? { etat: 'connu', codes: [...codes] } : { etat: 'aucun', codes: [] }

/** Inverse de `construireProfil` : remet la carte dans le formulaire, pour que la prochaine carte signée ne perde rien. */
export function profilDepuisCarte(pr: Profile = {}): ProfilSaisi {
  return {
    ...PROFIL_VIDE,
    al: liste(pr.al),
    ah: liste(pr.ah),
    tx: liste(pr.tx?.map(t => t.c)),
    gs: pr.gs ?? '',
    yb: pr.yb ? String(pr.yb) : '',
    sx: pr.sx ?? '',
    ecNom: pr.ec?.n ?? '',
    ecTel: pr.ec?.tel ?? '',
    accordSensible: Boolean(pr.vs?.length),
  }
}

/** Écrit la carte restaurée là où l'espace patient la cherche (mêmes clés que `useDeviceState`). */
export function enregistrerCarteRestauree(carte: string, payload: C0Payload) {
  const ecrire = (cle: string, v: unknown) => localStorage.setItem(`lafia:${cle}`, JSON.stringify(v))
  ecrire('c0-id', payload.id)
  ecrire('c0-carte', carte)
  ecrire('c0-profil', profilDepuisCarte(payload.pr))
  ecrire('c0-consultations', (payload.co ?? []) as Consultation[])
}
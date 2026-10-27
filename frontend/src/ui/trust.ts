import { useEffect, useState } from 'react'
import nacl from 'tweetnacl'
import registreEmbarque from '../data/registre_signe.json'
import autorite from '../data/autorite.json'
import facilitiesData from '../data/facilities.json'
import type { Registry, Role } from '../core'
import { ROLE_LABEL } from './labels'

export type { Role }

/**
 * Registre de confiance SIGNÉ par l'autorité (format identique à `backend/lafia/registre.py`) :
 *   { v: 1, autorite: <kid>, contenu: "<JSON texte>", sig: <hex> }   contenu = { version, emis, badges }
 *
 * Le téléphone ne fait confiance qu'à la clé PUBLIQUE de l'autorité, intégrée au site (src/data/autorite.json).
 * Ordre de préférence : la version la plus récente parmi [registre intégré au site, registre gardé sur l'appareil,
 * registre reçu du serveur]. Une version plus ancienne que celle en cours est toujours refusée (pas de retour en
 * arrière vers un registre où un badge révoqué était encore actif). Hors ligne : la dernière version reçue sert.
 */
export type DocRegistre = { v: 1; autorite: string; contenu: string; sig: string }
type Contenu = { version: number; emis: number; badges: Registry }

const PUB_AUTORITE = (autorite as { pub: string }).pub
const CLE_CACHE = 'lafia.registre'
const unhex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], x => parseInt(x, 16))

/** Vérifie la signature de l'autorité ; renvoie le contenu, ou null si le document est faux ou mal formé. */
export function ouvrirRegistre(doc: unknown): Contenu | null {
  try {
    const d = doc as DocRegistre
    if (!d || d.v !== 1 || typeof d.contenu !== 'string' || typeof d.sig !== 'string' || d.autorite !== PUB_AUTORITE.slice(0, 16)) return null
    if (!nacl.sign.detached.verify(new TextEncoder().encode(d.contenu), unhex(d.sig), unhex(PUB_AUTORITE))) return null
    const c = JSON.parse(d.contenu) as Contenu
    if (!Number.isInteger(c.version) || c.version < 1 || !c.badges || typeof c.badges !== 'object') return null
    for (const [kid, b] of Object.entries(c.badges)) if (b.pub.slice(0, 16) !== kid) return null
    return c
  } catch {
    return null
  }
}

/** kid (8 octets hex) → clé publique, rôle, établissement. Le rôle vient d'ici, jamais de la carte.
 *  Objet unique, mis à jour EN PLACE : tous les modules qui l'importent voient la version courante. */
export const REGISTRY: Registry = {}
export const FACILITIES = facilitiesData as Record<string, string>

let courant: { version: number; emis: number } = { version: 0, emis: 0 }
const abonnes = new Set<() => void>()

function installer(c: Contenu) {
  for (const k of Object.keys(REGISTRY)) delete REGISTRY[k]
  Object.assign(REGISTRY, c.badges)
  courant = { version: c.version, emis: c.emis }
  abonnes.forEach(f => f())
}

/** Applique un registre reçu : 'applique' s'il est valide ET plus récent, sinon la raison du refus. */
export function appliquerRegistre(doc: unknown): 'applique' | 'deja_a_jour' | 'invalide' {
  const c = ouvrirRegistre(doc)
  if (!c) return 'invalide'
  if (c.version <= courant.version) return 'deja_a_jour'
  installer(c)
  try { localStorage.setItem(CLE_CACHE, JSON.stringify(doc)) } catch { /* stockage indisponible : version gardée en mémoire */ }
  return 'applique'
}

// Démarrage : le registre intégré au site doit être valide (sinon le site est mal construit : on le dit fort).
const embarque = ouvrirRegistre(registreEmbarque)
if (!embarque) throw new Error('Registre intégré au site invalide : signature de l’autorité incorrecte.')
installer(embarque)
try {
  const garde = localStorage.getItem(CLE_CACHE)
  if (garde) appliquerRegistre(JSON.parse(garde))
} catch { /* rien de gardé ou stockage indisponible */ }

export function infoRegistre() {
  return courant
}

/** Version et date du registre en cours, mises à jour quand un registre plus récent arrive. */
export function useInfoRegistre() {
  const [info, setInfo] = useState(courant)
  useEffect(() => {
    const f = () => setInfo(courant)
    abonnes.add(f)
    f()
    return () => { abonnes.delete(f) }
  }, [])
  return info
}

export function getRoleLabel(role: string): string {
  return ROLE_LABEL[role] ?? (role || 'Rôle inconnu')
}

export function isTrustedBadge(kid: string): boolean {
  const entry = REGISTRY[kid]
  return !!entry && !entry.revoked
}

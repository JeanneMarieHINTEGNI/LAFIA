import nacl from 'tweetnacl'
import type { Badge, Registry } from '../core'

/**
 * Journal d'accès LAFIA — chaîné (SHA-256) et signé (Ed25519 par l'acteur quand il a un badge).
 *
 * Ce que cela garantit : toute modification, suppression ou réordonnancement d'une entrée AU MILIEU de la
 * chaîne est détectée. Ce que cela NE garantit PAS : (1) la suppression des dernières entrées n'est
 * détectable que si la tête de chaîne est ancrée ailleurs (serveur / patient) — non fait ici ;
 * (2) le journal local n'est pas chiffré ; (3) un lecteur sans badge ne peut pas signer : son entrée
 * est marquée « non signée », jamais présentée comme authentifiée.
 */

export type Action = 'LECTURE' | 'ECRITURE'

export type Entree = {
  i: number                 // rang dans la chaîne, à partir de 0
  t: number                 // secondes epoch
  action: Action
  cible: string             // identifiant patient (aléatoire, cf. D5)
  rubriques: string[]       // ex. ['C0']
  etab?: string             // établissement (clé de facilities.json), si connu
  acteur?: string           // kid du badge, si l'acteur en a un
  motif?: string            // pourquoi on lit sans badge (catalogue MOTIFS_LECTURE) ; absent si lecture avec badge
  prev: string              // hash de l'entrée précédente ('0'×64 pour la première)
  hash: string              // SHA-256 hex du contenu ci-dessus
  sig?: string              // signature Ed25519 hex du hash, par `acteur`
}

export type Saisie = { action: Action; cible: string; rubriques: string[]; etab?: string; signataire?: Badge | null; motif?: string }

/** Motifs d'une lecture SANS badge (catalogue fermé, identique côté Python : backend/lafia/journal.py). */
export const MOTIFS_LECTURE = ['INCONSCIENT', 'NE_PARLE_PAS', 'VITAL', 'AUTRE'] as const

export interface Stockage { lire(): Promise<Entree[]>; ecrire(e: Entree[]): Promise<void> }

const ZERO = '0'.repeat(64)
const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], h => parseInt(h, 16))

async function sha256(s: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
}

// Sérialisation canonique : ordre de champs fixe, champs absents omis.
// Le motif n'est ajouté EN FIN de tableau que s'il existe : les entrées antérieures gardent exactement leur empreinte.
function contenu(e: Omit<Entree, 'hash' | 'sig'>): string {
  const base: unknown[] = [e.i, e.t, e.action, e.cible, e.rubriques, e.etab ?? null, e.acteur ?? null, e.prev]
  return JSON.stringify(e.motif ? [...base, e.motif] : base)
}

export class MemoireStockage implements Stockage {
  constructor(public data: Entree[] = []) {}
  async lire() { return this.data.map(e => ({ ...e })) }
  async ecrire(e: Entree[]) { this.data = e.map(x => ({ ...x })) }
}

export class LocalStockage implements Stockage {
  constructor(private cle = 'lafia.journal') {}
  async lire(): Promise<Entree[]> {
    const raw = localStorage.getItem(this.cle)
    return raw ? JSON.parse(raw) : []
  }
  async ecrire(e: Entree[]) { localStorage.setItem(this.cle, JSON.stringify(e)) }   // lève si indisponible : l'appelant doit le traiter
}

export class Journal {
  private file: Promise<unknown> = Promise.resolve()   // sérialise les écritures concurrentes
  private abonnes = new Set<() => void>()
  constructor(private stockage: Stockage, private now: () => number = () => Math.floor(Date.now() / 1000)) {}

  subscribe(f: () => void) { this.abonnes.add(f); return () => { this.abonnes.delete(f) } }

  /** Écrit l'entrée ou lève. Les appelants écrivent AVANT d'afficher / d'émettre. */
  ajouterEntree(s: Saisie): Promise<Entree> {
    const run = async () => {
      const toutes = await this.stockage.lire()
      const prev = toutes.length ? toutes[toutes.length - 1].hash : ZERO
      const base: Omit<Entree, 'hash' | 'sig'> = {
        i: toutes.length, t: this.now(), action: s.action, cible: s.cible, rubriques: s.rubriques,
        ...(s.etab ? { etab: s.etab } : {}), ...(s.signataire ? { acteur: s.signataire.kid } : {}),
        ...(s.motif && (MOTIFS_LECTURE as readonly string[]).includes(s.motif) ? { motif: s.motif } : {}), prev,
      }
      const hash = await sha256(contenu(base))
      const e: Entree = { ...base, hash, ...(s.signataire ? { sig: hex(nacl.sign.detached(unhex(hash), s.signataire.secretKey)) } : {}) }
      await this.stockage.ecrire([...toutes, e])
      this.abonnes.forEach(f => f())
      return e
    }
    const p = this.file.then(run, run)
    this.file = p.catch(() => undefined)
    return p
  }

  async listerEntrees(cible?: string): Promise<Entree[]> {
    const toutes = await this.stockage.lire()
    return (cible ? toutes.filter(e => e.cible === cible) : toutes).slice().reverse()   // plus récent d'abord
  }

  async toutes(): Promise<Entree[]> { return this.stockage.lire() }
}

export type Verdict = {
  ok: boolean
  premiereRupture?: number          // rang de la première entrée incohérente
  raison?: 'HASH' | 'CHAINE' | 'RANG' | 'SIGNATURE'
  nonSignees: number                // entrées sans signature (lecteur sans badge)
  inconnues: number                 // signées par un kid absent du registre ou révoqué : signature non vérifiable
}

/** Vérifie la chaîne COMPLÈTE (ordre d'origine). La clé publique vient du registre, jamais de l'entrée. */
export async function verifierChaine(entrees: Entree[], registre: Registry): Promise<Verdict> {
  let prev = ZERO, nonSignees = 0, inconnues = 0
  for (let k = 0; k < entrees.length; k++) {
    const e = entrees[k]
    const rupture = (raison: NonNullable<Verdict['raison']>): Verdict => ({ ok: false, premiereRupture: k, raison, nonSignees, inconnues })
    if (e.i !== k) return rupture('RANG')
    if (e.prev !== prev) return rupture('CHAINE')
    const { hash, sig, ...base } = e
    if (hash !== await sha256(contenu(base))) return rupture('HASH')
    if (e.acteur) {
      const r = registre[e.acteur]
      if (!sig) return rupture('SIGNATURE')
      if (!r || r.revoked) inconnues++
      else if (!nacl.sign.detached.verify(unhex(hash), unhex(sig), unhex(r.pub))) return rupture('SIGNATURE')
    } else { nonSignees++ }
    prev = hash
  }
  return { ok: true, nonSignees, inconnues }
}
export type StatutEntree = 'signee' | 'sans_badge' | 'badge_inconnu' | 'invalide'

/**
 * Vérifie UNE entrée isolée (reçue du serveur) : son empreinte et, si elle a un auteur, sa signature.
 * La continuité de la chaîne ne peut pas être vérifiée ici (les autres entrées de l'appareil lecteur concernent
 * d'autres patients) : c'est le serveur qui la contrôle à la réception.
 */
export async function verifierEntreeSeule(e: Entree, registre: Registry): Promise<StatutEntree> {
  const { hash, sig, ...base } = e
  if (hash !== await sha256(contenu(base))) return 'invalide'
  if (!e.acteur) return sig ? 'invalide' : 'sans_badge'
  if (!sig) return 'invalide'
  const r = registre[e.acteur]
  if (!r || r.revoked) return 'badge_inconnu'
  return nacl.sign.detached.verify(unhex(hash), unhex(sig), unhex(r.pub)) ? 'signee' : 'invalide'
}
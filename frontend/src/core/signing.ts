import nacl from 'tweetnacl'
import { Encoder, Decoder } from 'cbor-x'
import { zlibSync, unzlibSync } from 'fflate'
import { b45decode, b45encode } from './base45'
import { C0Payload, MAX_QR_CHARS, FUTURE_SKEW_S, STALE_DAYS, SchemaError, VERSION, validate, type Role } from './schema'

// cbor-x en mode "maps as objects", sans extension d'enregistrements : sortie CBOR standard, lisible par cbor2.
const enc = new Encoder({ useRecords: false, mapsAsObjects: true, variableMapSize: true, tagUint8Array: false })
const dec = new Decoder({ useRecords: false, mapsAsObjects: true })

const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join('')
const unhex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], x => parseInt(x, 16))
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0))

// ---------- transport ----------
export function pack(raw: Uint8Array, linkBase?: string): string {
  const z = zlibSync(raw, { level: 9 })
  return linkBase ? `${linkBase}#L2B:${b64u(z)}` : `L2:${b45encode(z)}`
}
export function unpack(text: string): Uint8Array {
  let s = text.trim()
  if (s.includes('#')) s = decodeURIComponent(s.slice(s.indexOf('#') + 1))   // lien : seul le fragment compte
  if (s.startsWith('L2B:')) return unzlibSync(unb64u(s.slice(4)))
  if (s.startsWith('L2:')) return unzlibSync(b45decode(s.slice(3)))
  throw new Error('préfixe LAFIA absent')
}

// ---------- registre de confiance (le RÔLE vient d'ici, jamais du payload) ----------
export type RegistryEntry = { pub: string; role: Role; label?: string; revoked?: boolean; etab?: string }
export type Registry = Record<string, RegistryEntry>

// ---------- cycle brouillon -> relu -> signé ----------
export type Draft = { payload: C0Payload; origin: 'human' | 'ai'; status: 'draft' | 'reviewed' | 'signed'; reviewedBy?: string }
export class NotReviewedError extends Error {}

export function newDraft(payload: C0Payload, origin: 'human' | 'ai' = 'human'): Draft {
  validate(payload)
  return { payload, origin, status: 'draft' }
}
export function review(d: Draft, reviewerKid: string): Draft {
  return { ...d, status: 'reviewed', reviewedBy: reviewerKid }
}

export type Badge = { kid: string; secretKey: Uint8Array }
export function badgeFromSeed(seedHex: string): Badge {
  const kp = nacl.sign.keyPair.fromSeed(unhex(seedHex))
  return { kid: hex(kp.publicKey.slice(0, 8)), secretKey: kp.secretKey }
}

const strip = (v: unknown): unknown => JSON.parse(JSON.stringify(v))     // retire les `undefined`

export function sign(d: Draft, badge: Badge, linkBase?: string): { text: string; draft: Draft } {
  if (d.status !== 'reviewed') throw new NotReviewedError('refus : brouillon non relu par un humain')
  if (d.reviewedBy !== badge.kid) throw new NotReviewedError('refus : le signataire doit être le relecteur')
  const payload = strip(d.payload) as C0Payload
  validate(payload)
  const body = enc.encode(payload)
  const sig = nacl.sign.detached(body, badge.secretKey)
  const text = pack(enc.encode([VERSION, unhex(badge.kid), body, sig]), linkBase)
  if (text.length > MAX_QR_CHARS) throw new SchemaError(`carte trop volumineuse (${text.length} > ${MAX_QR_CHARS} caractères)`)
  return { text, draft: { ...d, status: 'signed' } }
}

// ---------- vérification ----------
export type VerifyCode = 'UNREADABLE' | 'UNKNOWN_SIGNER' | 'BAD_SIGNATURE' | 'BAD_SCHEMA' | 'FUTURE_DATE'
export type Verified =
  | { ok: true; payload: C0Payload; kid: string; role: Role; label?: string; etab?: string; iat: number; ageDays: number; warnings: string[] }
  | { ok: false; code: VerifyCode; reason: string }

const fail = (code: VerifyCode, reason: string) => ({ ok: false as const, code, reason })

export function verify(text: string, registry: Registry, now = Math.floor(Date.now() / 1000)): Verified {
  let ver: unknown, kidB: unknown, body: unknown, sig: unknown
  try {
    ;[ver, kidB, body, sig] = dec.decode(unpack(text)) as unknown[]
    if (!(kidB instanceof Uint8Array) || !(body instanceof Uint8Array) || !(sig instanceof Uint8Array)) throw new Error('enveloppe')
  } catch (e) {
    return fail('UNREADABLE', 'QR illisible')
  }
  if (ver !== VERSION) return fail('UNREADABLE', 'version non supportée')
  const kid = hex(kidB as Uint8Array)
  const entry = registry[kid]
  if (!entry || entry.revoked) return fail('UNKNOWN_SIGNER', 'signataire inconnu ou révoqué')
  if (!nacl.sign.detached.verify(body as Uint8Array, sig as Uint8Array, unhex(entry.pub)))
    return fail('BAD_SIGNATURE', 'signature invalide : carte modifiée')
  let payload: unknown
  try {
    payload = dec.decode(body as Uint8Array)
    validate(payload)
  } catch (e) {
    return fail('BAD_SCHEMA', e instanceof Error ? e.message : 'schéma invalide')
  }
  if (payload.iat > now + FUTURE_SKEW_S) return fail('FUTURE_DATE', "date d'émission dans le futur (horloge ?)")
  const ageDays = Math.max(0, Math.floor((now - payload.iat) / 86400))
  const warnings = ageDays > STALE_DAYS ? [`carte émise il y a ${ageDays} jours : des données plus récentes peuvent exister`] : []
  return { ok: true, payload, kid, role: entry.role, label: entry.label, etab: entry.etab, iat: payload.iat, ageDays, warnings }
}

// ---------- liens (ouverture par l'appareil photo normal) ----------
const isLoopback = (h: string) => h === 'localhost' || h === '::1' || h === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(h)

/** Refuse une adresse qui ne peut pas fonctionner sur un téléphone (localhost, schéma inattendu). */
export function assertShareableBase(base: string): URL {
  let url: URL
  try { url = new URL(base) } catch { throw new Error('Adresse invalide : une URL complète est attendue (https://…)') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error("L'adresse doit commencer par http:// ou https://")
  if (isLoopback(url.hostname)) throw new Error("localhost ne s'ouvre pas sur un téléphone : utilisez une adresse publique ou du réseau local")
  return url
}

/** Transforme une carte `L2:…` en lien `<base>#L2B:…`. Les données restent dans le fragment : jamais envoyées au serveur. */
export function toLink(text: string, base: string): string {
  const url = assertShareableBase(base)
  url.hash = ''
  const link = pack(unpack(text), url.toString())
  if (link.length > MAX_QR_CHARS) throw new SchemaError(`lien trop long pour le QR (${link.length} > ${MAX_QR_CHARS} caractères)`)
  return link
}
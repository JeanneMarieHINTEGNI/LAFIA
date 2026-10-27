import nacl from 'tweetnacl'
import { Encoder } from 'cbor-x'
import { describe, expect, it } from 'vitest'
import {
  MAX_QR_CHARS, NotReviewedError, SchemaError, VERSION,
  b45decode, b45encode, badgeFromSeed, newDraft, pack, review, sign, toLink, unpack, verify, type C0Payload,
} from '../src/core'
import { ETAB, NOW, REGISTRY, SECRETS, infirmier, intrus, medecin, payload, signed } from './helpers'

const enc = new Encoder({ useRecords: false, mapsAsObjects: true, variableMapSize: true, tagUint8Array: false })
const unhex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], x => parseInt(x, 16))

describe('Base45 (RFC 9285)', () => {
  it('encode les vecteurs de la RFC', () => {
    const t = new TextEncoder()
    expect(b45encode(t.encode('AB'))).toBe('BB8')
    expect(b45encode(t.encode('Hello!!'))).toBe('%69 VD92EX0')
    expect(b45encode(t.encode('ietf!'))).toBe('QED8WEX0')
  })
  it('fait l’aller-retour sur des octets arbitraires', () => {
    const b = nacl.randomBytes(257)
    expect(b45decode(b45encode(b))).toEqual(b)
  })
  it('transport L2: et L2B: réversibles', () => {
    const raw = nacl.randomBytes(100)
    expect(unpack(pack(raw))).toEqual(raw)
    expect(unpack(pack(raw, 'https://lafia.example/'))).toEqual(raw)
    expect(() => unpack('pas une carte')).toThrow()
  })
})

describe('Badges de démo et registre', () => {
  it('chaque kid = 8 premiers octets de la clé publique', () => {
    for (const [kid, e] of Object.entries(REGISTRY)) expect(e.pub.slice(0, 16)).toBe(kid)
  })
  it('chaque graine de démo correspond à son entrée du registre', () => {
    for (const [nom, f] of Object.entries(SECRETS)) {
      const b = badgeFromSeed(f.seed)
      expect(b.kid).toBe(f.kid)
      expect(REGISTRY[b.kid]?.role).toBe(nom)
    }
  })
})

describe('Signature et vérification', () => {
  it('une carte valide est acceptée avec le rôle du REGISTRE', () => {
    const v = verify(signed(), REGISTRY, NOW)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.role).toBe('medecin')
    expect(v.kid).toBe(medecin.kid)
    expect(v.etab).toBe(ETAB)
    expect(v.payload).toEqual(payload())
    expect(v.warnings).toEqual([])
  })

  it('le lien #L2B: se vérifie comme le texte L2:', () => {
    const link = toLink(signed(), 'https://lafia.example/app')
    expect(link.startsWith('https://lafia.example/app#L2B:')).toBe(true)
    expect(verify(link, REGISTRY, NOW).ok).toBe(true)
  })

  it('toLink refuse localhost et les schémas inattendus', () => {
    expect(() => toLink(signed(), 'http://localhost:5173/')).toThrow()
    expect(() => toLink(signed(), 'http://127.0.0.1/')).toThrow()
    expect(() => toLink(signed(), 'ftp://lafia.example/')).toThrow()
  })

  it('un caractère modifié = refus, aucune donnée rendue', () => {
    const t = signed()
    const i = Math.floor(t.length / 2)
    const alt = t.slice(0, i) + (t[i] === 'A' ? 'B' : 'A') + t.slice(i + 1)
    const v = verify(alt, REGISTRY, NOW)
    expect(v.ok).toBe(false)
    expect(v).not.toHaveProperty('payload')
  })

  it('signataire hors registre → UNKNOWN_SIGNER', () => {
    const v = verify(signed(payload({}, intrus), intrus), REGISTRY, NOW)
    expect(v).toMatchObject({ ok: false, code: 'UNKNOWN_SIGNER' })
  })

  it('badge révoqué → UNKNOWN_SIGNER', () => {
    const revoque = { ...REGISTRY, [medecin.kid]: { ...REGISTRY[medecin.kid], revoked: true } }
    expect(verify(signed(), revoque, NOW)).toMatchObject({ ok: false, code: 'UNKNOWN_SIGNER' })
  })

  it('signature d’un autre badge sur le même kid → BAD_SIGNATURE', () => {
    const body = enc.encode(payload())
    const forged = pack(enc.encode([VERSION, unhex(medecin.kid), body, nacl.sign.detached(body, infirmier.secretKey)]))
    expect(verify(forged, REGISTRY, NOW)).toMatchObject({ ok: false, code: 'BAD_SIGNATURE' })
  })

  it('corps authentiquement signé mais hors schéma → BAD_SCHEMA', () => {
    const body = enc.encode({ ...payload(), pr: { gs: 'Z+' } })
    const t = pack(enc.encode([VERSION, unhex(medecin.kid), body, nacl.sign.detached(body, medecin.secretKey)]))
    expect(verify(t, REGISTRY, NOW)).toMatchObject({ ok: false, code: 'BAD_SCHEMA' })
  })

  it('texte illisible → UNREADABLE', () => {
    expect(verify('L2:%%%%', REGISTRY, NOW)).toMatchObject({ ok: false, code: 'UNREADABLE' })
    expect(verify('bonjour', REGISTRY, NOW)).toMatchObject({ ok: false, code: 'UNREADABLE' })
  })

  it('iat > maintenant + 24 h → FUTURE_DATE', () => {
    expect(verify(signed(payload({ iat: NOW + 25 * 3600 })), REGISTRY, NOW)).toMatchObject({ ok: false, code: 'FUTURE_DATE' })
    expect(verify(signed(payload({ iat: NOW + 23 * 3600 })), REGISTRY, NOW).ok).toBe(true)
  })

  it('carte de plus de 30 jours → acceptée avec avertissement', () => {
    const v = verify(signed(), REGISTRY, NOW + 31 * 86400)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.warnings.length).toBe(1)
  })
})

describe('Cycle brouillon → relu → signé', () => {
  it('refuse un brouillon non relu', () => {
    expect(() => sign(newDraft(payload()), medecin)).toThrow(NotReviewedError)
  })
  it('exige signataire = relecteur', () => {
    expect(() => sign(review(newDraft(payload()), infirmier.kid), medecin)).toThrow(NotReviewedError)
  })
  it('un brouillon IA relu par un humain peut être signé par ce relecteur', () => {
    const { draft } = sign(review(newDraft(payload(), 'ai'), medecin.kid), medecin)
    expect(draft.status).toBe('signed')
  })
})

describe('Schéma', () => {
  it('catégorie sensible sans choix du patient → refus', () => {
    expect(() => newDraft(payload({ pr: { ah: ['DREPANO'] } }))).toThrow(SchemaError)
    expect(() => newDraft(payload({ pr: { tx: [{ c: 'ARV' }] } }))).toThrow(SchemaError)
  })
  it('catégorie sensible déclarée dans pr.vs → acceptée', () => {
    expect(verify(signed(payload({ pr: { ah: ['DREPANO'], vs: ['DREPANO'] } })), REGISTRY, NOW).ok).toBe(true)
  })
  it('dose = référence de table uniquement', () => {
    expect(() => newDraft(payload({ pr: { tx: [{ c: 'PARA', d: '500mg' }] } }))).toThrow(SchemaError)
  })
  it('poids sans date de mesure → refus ; température hors bornes → refus', () => {
    const co = (c: object) => payload({ co: [{ t: NOW, f: ETAB, a: medecin.kid, m: 'FIEV', c }] })
    expect(() => newDraft(co({ poids: 650 }))).toThrow(SchemaError)
    expect(() => newDraft(co({ temp: 39 }))).toThrow(SchemaError)
    expect(() => newDraft(co({ poids: 650, pt: NOW }))).not.toThrow()
  })
  it('établissement non hexadécimal → refus', () => {
    expect(() => newDraft(payload({ co: [{ t: NOW, f: 'etab-1', a: medecin.kid, m: 'FIEV' }] }))).toThrow(SchemaError)
  })
  it(`le pire payload valide tient dans ${MAX_QR_CHARS} caractères`, () => {
    const c6 = ['PEN', 'SULFA', 'ARACH', 'LATEX', 'ASPIR', 'IODE']
    const consult = (k: number) => ({
      t: NOW - k, f: ETAB, a: medecin.kid, m: 'EVAC',
      c: { temp: 412, poids: 2999, pt: NOW - k },
      x: [{ k: 'TDR', v: 'POS' }, { k: 'TDR', v: 'NEG' }, { k: 'TDR', v: 'POS' }],
      adm: [0, 1, 2, 3].map(j => ({ c: 'ARTESUNATE' + j, h: NOW - k - j })),
      o: { k: 'EVAC', d: 'ffffffff' },
    })
    const pire: C0Payload = {
      v: 2, id: 'p-ffffffffffffffff', iat: NOW,
      pr: {
        al: c6, ah: ['HTA', 'DIAB', 'ASTHME', 'EPILEP', 'DREPANO', 'GROSSESSE'],
        tx: ['PARA', 'ARTE', 'AMOX', 'SRO', 'ACFOL', 'IBU'].map(c => ({ c, d: 'T99:L99' })),
        ec: { n: 'X'.repeat(30), tel: '+229 01 23 45 67 89' }, gs: 'AB-', yb: 1950, sx: 'M', vs: ['DREPANO', 'GROSSESSE'],
      },
      co: [consult(1), consult(2), consult(3)],
    }
    const t = signed(pire)
    expect(t.length).toBeLessThanOrEqual(MAX_QR_CHARS)
    expect(verify(t, REGISTRY, NOW).ok).toBe(true)
  })
})

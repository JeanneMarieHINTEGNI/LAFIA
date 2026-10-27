import medecinFile from '../demo/secrets/medecin.json'
import infirmierFile from '../demo/secrets/infirmier.json'
import relaisFile from '../demo/secrets/relais.json'
import { badgeFromSeed, newDraft, review, sign, type Badge, type C0Payload } from '../src/core'
import { REGISTRY, FACILITIES } from '../src/ui/trust'

export const SECRETS = { medecin: medecinFile, infirmier: infirmierFile, relais: relaisFile }
export const medecin = badgeFromSeed(medecinFile.seed)
export const infirmier = badgeFromSeed(infirmierFile.seed)
export const ETAB = Object.keys(FACILITIES)[0]
export { REGISTRY }

/** Badge hors registre (même format, graine différente). */
export const intrus = badgeFromSeed('11'.repeat(32))

export const NOW = 1_790_000_000

export function payload(over: Partial<C0Payload> = {}, signer: Badge = medecin): C0Payload {
  return {
    v: 2, id: 'p-0123456789abcdef', iat: NOW,
    pr: { al: ['PEN'], tx: [{ c: 'ARTE', d: 'T1:L3' }], ah: ['HTA'], gs: 'O+', yb: 1990, sx: 'F' },
    co: [{ t: NOW - 3600, f: ETAB, a: signer.kid, m: 'FIEV', c: { temp: 390 } }],
    ...over,
  }
}

export function signed(p: C0Payload = payload(), badge: Badge = medecin, linkBase?: string): string {
  return sign(review(newDraft(p), badge.kid), badge, linkBase).text
}

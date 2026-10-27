import { beforeEach, describe, expect, it, vi } from 'vitest'
import nacl from 'tweetnacl'
import { createHash } from 'node:crypto'
import { verify } from '../src/core'
import { REGISTRY, appliquerRegistre, infoRegistre, ouvrirRegistre } from '../src/ui/trust'
import { medecin, signed } from './helpers'
import embarque from '../src/data/registre_signe.json'

// Même clé de démonstration que le backend (python -m lafia.registre cle-demo) : SHA-256("lafia-demo:autorite").
const AUTORITE = nacl.sign.keyPair.fromSeed(createHash('sha256').update('lafia-demo:autorite').digest())
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')

function signerRegistre(badges: object, version: number, cle = AUTORITE) {
  const contenu = JSON.stringify({ badges, emis: 1_790_000_000 + version, version })
  return { v: 1 as const, autorite: hex(cle.publicKey).slice(0, 16), contenu, sig: hex(nacl.sign.detached(new TextEncoder().encode(contenu), cle.secretKey)) }
}
const badgesEmbarques = () => JSON.parse((embarque as { contenu: string }).contenu).badges

describe('Registre signé par l’autorité', () => {
  beforeEach(() => localStorage.clear())

  it('le registre intégré au site (signé par le backend Python) est valide', () => {
    expect(ouvrirRegistre(embarque)?.version).toBeGreaterThanOrEqual(1)
    expect(REGISTRY[medecin.kid]?.role).toBe('medecin')
  })

  it('refuse un registre modifié ou signé par une autre autorité', () => {
    const doc = signerRegistre(badgesEmbarques(), 50)
    expect(appliquerRegistre({ ...doc, contenu: doc.contenu.replace('"medecin"', '"relais"') })).toBe('invalide')
    expect(appliquerRegistre(signerRegistre(badgesEmbarques(), 50, nacl.sign.keyPair()))).toBe('invalide')
  })

  it('révocation : une carte signée par le badge révoqué est refusée, et on ne revient jamais en arrière', () => {
    const carte = signed()
    expect(verify(carte, REGISTRY).ok).toBe(true)
    const b = badgesEmbarques(); b[medecin.kid].revoked = true
    const version = infoRegistre().version + 1
    expect(appliquerRegistre(signerRegistre(b, version))).toBe('applique')
    expect(verify(carte, REGISTRY)).toMatchObject({ ok: false, code: 'UNKNOWN_SIGNER' })
    expect(ouvrirRegistre(JSON.parse(localStorage.getItem('lafia.registre')!))?.version).toBe(version)   // gardé pour le hors-ligne
    // Un ancien registre (où le badge était actif) est refusé, même authentique.
    expect(appliquerRegistre(signerRegistre(badgesEmbarques(), version - 1))).toBe('deja_a_jour')
    expect(verify(carte, REGISTRY).ok).toBe(false)
  })

  it('au démarrage, le registre gardé sur l’appareil remplace l’intégré s’il est plus récent (lecture hors ligne)', async () => {
    const b = badgesEmbarques(); b[medecin.kid].revoked = true
    localStorage.setItem('lafia.registre', JSON.stringify(signerRegistre(b, 999)))
    vi.resetModules()
    const frais = await import('../src/ui/trust')
    expect(frais.infoRegistre().version).toBe(999)
    expect(frais.REGISTRY[medecin.kid].revoked).toBe(true)
  })
})

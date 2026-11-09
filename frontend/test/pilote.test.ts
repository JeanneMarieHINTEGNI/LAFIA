import nacl from 'tweetnacl'
import { describe, expect, it } from 'vitest'
import { exigeAutoriteReelle, registreSigneValide } from '../scripts/pilote'

const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

function creerRegistre() {
  const autorite = nacl.sign.keyPair()
  const contenu = JSON.stringify({ version: 1, emis: 1, badges: {} })
  const document = {
    v: 1,
    autorite: hex(autorite.publicKey).slice(0, 16),
    contenu,
    sig: hex(nacl.sign.detached(new TextEncoder().encode(contenu), autorite.secretKey)),
  }
  return { document, publicKey: hex(autorite.publicKey) }
}

describe('préflight du registre pilote', () => {
  it('exige une autorité réelle en production, mais pas pour les previews', () => {
    expect(exigeAutoriteReelle({}, 'production')).toBe(true)
    expect(exigeAutoriteReelle({}, 'preview')).toBe(false)
    expect(exigeAutoriteReelle({}, undefined)).toBe(false)
    expect(exigeAutoriteReelle({ LAFIA_REQUIRE_REAL_AUTHORITY: 'true' }, undefined)).toBe(true)
  })

  it('accepte un registre signé par la clé publique fournie', () => {
    const { document, publicKey } = creerRegistre()
    expect(registreSigneValide(document, publicKey)).toBe(true)
  })

  it('refuse un registre altéré ou signé par une autre autorité', () => {
    const { document, publicKey } = creerRegistre()
    const autreAutorite = nacl.sign.keyPair()
    expect(registreSigneValide({ ...document, contenu: `${document.contenu} ` }, publicKey)).toBe(false)
    expect(registreSigneValide(document, hex(autreAutorite.publicKey))).toBe(false)
  })
})
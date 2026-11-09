import nacl from 'tweetnacl'

type DocumentRegistre = { v: number; autorite: string; contenu: string; sig: string }
type ContenuRegistre = { version: number; emis: number; badges: Record<string, { pub: string }> }

const unhex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], byte => parseInt(byte, 16))

export function exigeAutoriteReelle(env: Record<string, string | undefined>, vercelEnv?: string): boolean {
  return env.LAFIA_REQUIRE_REAL_AUTHORITY === 'true' || vercelEnv === 'production'
}

export function registreSigneValide(document: unknown, publicKey: string): boolean {
  try {
    if (!/^[\da-f]{64}$/i.test(publicKey)) return false
    const doc = document as DocumentRegistre
    if (doc?.v !== 1 || doc.autorite !== publicKey.slice(0, 16) || typeof doc.contenu !== 'string' || !/^[\da-f]{128}$/i.test(doc.sig)) return false
    if (!nacl.sign.detached.verify(new TextEncoder().encode(doc.contenu), unhex(doc.sig), unhex(publicKey))) return false

    const contenu = JSON.parse(doc.contenu) as ContenuRegistre
    if (!Number.isInteger(contenu.version) || contenu.version < 1 || !contenu.badges || typeof contenu.badges !== 'object' || Array.isArray(contenu.badges)) return false
    return Object.entries(contenu.badges).every(([kid, badge]) => typeof badge.pub === 'string' && badge.pub.slice(0, 16) === kid)
  } catch {
    return false
  }
}
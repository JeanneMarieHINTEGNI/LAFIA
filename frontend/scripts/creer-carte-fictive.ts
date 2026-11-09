import { readFileSync, writeFileSync } from 'node:fs'
import { renderSVG } from 'uqr'
import { badgeFromSeed, newDraft, review, sign, verify, type C0Payload, type Registry } from '../src/core'

const badgeFile = JSON.parse(readFileSync(new URL('../demo/secrets/medecin.json', import.meta.url), 'utf8')) as { seed: string }
const registry = JSON.parse(readFileSync(new URL('../demo/registry.json', import.meta.url), 'utf8')) as Registry
const badge = badgeFromSeed(badgeFile.seed)
const etab = registry[badge.kid]?.etab

if (!etab) throw new Error('Badge médical absent du registre de démonstration.')

const maintenant = Math.floor(Date.now() / 1000)
const payload: C0Payload = {
  v: 2,
  id: 'p-0123456789abcdef',
  iat: maintenant,
  pr: {
    al: ['PEN'],
    tx: [{ c: 'ARTE', d: 'T1:L3' }],
    ah: ['HTA'],
    gs: 'O+',
    yb: 1990,
    sx: 'F',
  },
  co: [{ t: maintenant - 3600, f: etab, a: badge.kid, m: 'FIEV', c: { temp: 390 } }],
}

const carte = sign(review(newDraft(payload), badge.kid), badge).text
if (!verify(carte, registry).ok) throw new Error('La carte fictive générée ne passe pas sa vérification.')

const sortie = new URL('../demo/carte-fictive.svg', import.meta.url)
writeFileSync(sortie, renderSVG(carte, { ecc: 'M', border: 4 }))
console.log(`QR fictif généré et vérifié : ${sortie.pathname}`)
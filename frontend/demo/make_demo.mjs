// Génère les badges de DÉMO : graine = SHA-256("lafia-demo:" + nom). INTERDIT en production.
// Usage : node demo/make_demo.mjs "$PWD"   (depuis frontend/)
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const root = process.argv[2]
const nacl = createRequire(root + '/package.json')('tweetnacl')
const hex = b => Buffer.from(b).toString('hex')
const ETAB = createHash('sha256').update('lafia-demo:etab').digest('hex').slice(0, 6)
const badges = [
  ['medecin', 'medecin', 'Dr Démo (médecin)'],
  ['infirmier', 'infirmier', 'Infirmier Démo'],
  ['relais', 'relais', 'Relais Démo'],
]
const registry = {}
for (const [file, role, label] of badges) {
  const seed = createHash('sha256').update('lafia-demo:' + file).digest('hex')
  const kp = nacl.sign.keyPair.fromSeed(Uint8Array.from(Buffer.from(seed, 'hex')))
  const kid = hex(kp.publicKey.slice(0, 8))
  registry[kid] = { pub: hex(kp.publicKey), role, label, etab: ETAB }
  writeFileSync(`${root}/demo/secrets/${file}.json`, JSON.stringify({ _avertissement: 'BADGE DE DÉMONSTRATION — INTERDIT EN PRODUCTION', kid, role, seed }, null, 2) + '\n')
}
writeFileSync(`${root}/demo/registry.json`, JSON.stringify(registry, null, 2) + "\n")   // source NON signée : à signer avec « python -m lafia.registre signer » (backend)
const fac = JSON.stringify({ [ETAB]: 'Centre hospitalier de référence (démo)' }, null, 2) + '\n'
writeFileSync(`${root}/src/data/facilities.json`, fac)
writeFileSync(`${root}/demo/facilities.json`, fac)
console.log(JSON.stringify(registry, null, 1))

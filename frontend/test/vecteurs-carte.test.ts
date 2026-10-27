import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import nacl from 'tweetnacl'
import { Encoder } from 'cbor-x'
import { describe, expect, it } from 'vitest'
import { VERSION, pack, toLink, verify, type C0Payload } from '../src/core'
import { ETAB, NOW, REGISTRY, intrus, medecin, infirmier, payload, signed } from './helpers'

// Vecteurs de CARTE partagés avec le backend Python (lafia/c0.py), dans les deux sens :
//   demo/vecteurs_carte.json         produits ICI (navigateur) → vérifiés par backend/tests/test_c0.py
//   demo/vecteurs_carte_python.json  produits par le Python   → vérifiés ICI
// Régénérer après un changement VOULU du format :
//   LAFIA_ECRIRE_VECTEURS=1 bunx vitest run test/vecteurs-carte.test.ts   puis copier dans backend/tests/
//   (côté Python : LAFIA_ECRIRE_VECTEURS=1 .venv/bin/python -m pytest tests/test_c0.py, puis copier ici dans demo/)
const ICI = resolve(process.cwd(), 'demo/vecteurs_carte.json')
const PYTHON = resolve(process.cwd(), 'demo/vecteurs_carte_python.json')
const enc = new Encoder({ useRecords: false, mapsAsObjects: true, variableMapSize: true, tagUint8Array: false })
const unhex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], x => parseInt(x, 16))

function corpsSigne(p: unknown, badge = medecin) {
  const body = enc.encode(p)
  return pack(enc.encode([VERSION, unhex(badge.kid), body, nacl.sign.detached(body, badge.secretKey)]))
}

function complet(): C0Payload {
  return {
    v: 2, id: 'p-0123456789abcdef', iat: NOW,
    pr: {
      al: ['PEN', 'QUIN'], tx: [{ c: 'AVK', d: 'T1:L3' }, { c: 'INSUL' }], ah: ['HTA', 'DREPANO'], vs: ['DREPANO'],
      ec: { n: 'Kossi Dossou é', tel: '+229 97 00 00 41' }, gs: 'O+', yb: 1951, sx: 'F',
    },
    co: [
      { t: NOW - 7200, f: ETAB, a: medecin.kid, m: 'FIEV', c: { temp: 392, poids: 620, pt: NOW - 7200 }, x: [{ k: 'TDR', v: 'POS' }], adm: [{ c: 'ARTE', h: NOW - 7000 }], o: { k: 'EVAC', d: 'ffffff' } },
      { t: NOW - 86400 * 40, f: ETAB, a: infirmier.kid, m: 'CTRL' },
    ],
  }
}

type Cas = { nom: string; texte: string; maintenant: number; attendu: ReturnType<typeof verify> }

function produire(): Cas[] {
  const carte = signed(complet())
  const t = carte.slice(0, Math.floor(carte.length / 2)) + (carte[Math.floor(carte.length / 2)] === 'A' ? 'B' : 'A') + carte.slice(Math.floor(carte.length / 2) + 1)
  const cas: Omit<Cas, 'attendu'>[] = [
    { nom: 'complète, signée médecin', texte: carte, maintenant: NOW + 60 },
    { nom: 'minimale', texte: signed({ v: 2, id: 'p-00000000', iat: NOW }), maintenant: NOW },
    { nom: 'lien #L2B', texte: toLink(carte, 'https://lafia.example/app'), maintenant: NOW + 60 },
    { nom: 'ancienne (> 30 jours) : avertissement', texte: carte, maintenant: NOW + 86400 * 45 },
    { nom: 'falsifiée (1 caractère)', texte: t, maintenant: NOW },
    { nom: 'signataire hors registre', texte: signed(payload({}, intrus), intrus), maintenant: NOW },
    { nom: 'signature d’un autre badge', texte: (() => { const b = enc.encode(payload()); return pack(enc.encode([VERSION, unhex(medecin.kid), b, nacl.sign.detached(b, infirmier.secretKey)])) })(), maintenant: NOW },
    { nom: 'hors schéma (groupe inventé)', texte: corpsSigne({ ...payload(), pr: { gs: 'Z+' } }), maintenant: NOW },
    { nom: 'hors schéma (sensible sans accord)', texte: corpsSigne({ ...payload(), pr: { ah: ['VIH'] } }), maintenant: NOW },
    { nom: 'hors schéma (clé inconnue)', texte: corpsSigne({ ...payload(), secret: 1 }), maintenant: NOW },
    { nom: 'hors schéma (poids sans date)', texte: corpsSigne({ ...payload(), co: [{ t: NOW, f: ETAB, a: medecin.kid, m: 'FIEV', c: { poids: 600 } }] }), maintenant: NOW },
    { nom: 'datée dans le futur', texte: signed(payload({ iat: NOW + 3 * 86400 })), maintenant: NOW },
    { nom: 'illisible', texte: 'L2:%%%%', maintenant: NOW },
    { nom: 'sans préfixe', texte: 'bonjour', maintenant: NOW },
  ]
  return cas.map(c => ({ ...c, attendu: verify(c.texte, REGISTRY, c.maintenant) }))
}

describe('Vecteurs de carte partagés avec le backend Python', () => {
  it('le navigateur produit exactement les vecteurs enregistrés (sauf signatures non déterministes : aucune ici)', () => {
    const cas = produire()
    if (process.env.LAFIA_ECRIRE_VECTEURS === '1') writeFileSync(ICI, JSON.stringify({ registre: REGISTRY, cas }, null, 2) + '\n')
    const enregistres = JSON.parse(readFileSync(ICI, 'utf-8')) as { cas: Cas[] }
    // Ed25519 est déterministe et zlib aussi : mêmes entrées → mêmes textes.
    expect(cas.map(c => c.texte)).toEqual(enregistres.cas.map(c => c.texte))
    for (const c of enregistres.cas) expect(verify(c.texte, REGISTRY, c.maintenant)).toEqual(c.attendu)
    expect(enregistres.cas.filter(c => c.attendu.ok).length).toBe(4)
  })

  it('les cartes produites par le Python sont acceptées par le navigateur, à l’identique', () => {
    if (!existsSync(PYTHON)) throw new Error('demo/vecteurs_carte_python.json manquant : copiez-le depuis backend/tests/')
    const { cas } = JSON.parse(readFileSync(PYTHON, 'utf-8')) as { cas: { nom: string; texte: string; maintenant: number; attendu: { ok: boolean; code?: string; payload?: unknown } }[] }
    expect(cas.length).toBeGreaterThan(0)
    for (const c of cas) {
      const v = verify(c.texte, REGISTRY, c.maintenant)
      expect({ nom: c.nom, ok: v.ok }).toEqual({ nom: c.nom, ok: c.attendu.ok })
      if (v.ok) expect(v.payload).toEqual(c.attendu.payload)
      else expect((v as { code: string }).code).toBe(c.attendu.code)
    }
  })
})
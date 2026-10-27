import { describe, expect, it } from 'vitest'
import { Journal, MemoireStockage, verifierChaine } from '../src/journal'
import { REGISTRY, medecin, intrus } from './helpers'

async function troisEntrees() {
  const s = new MemoireStockage()
  const j = new Journal(s, () => 1_790_000_000)
  await j.ajouterEntree({ action: 'LECTURE', cible: 'p-01', rubriques: ['C0'], signataire: medecin })
  await j.ajouterEntree({ action: 'LECTURE', cible: 'p-01', rubriques: ['C0'] })
  await j.ajouterEntree({ action: 'ECRITURE', cible: 'p-02', rubriques: ['C0'], signataire: medecin })
  return { s, j }
}

describe('Journal d’accès', () => {
  it('chaîne intacte : valide, entrée sans badge comptée comme non signée', async () => {
    const { s } = await troisEntrees()
    expect(await verifierChaine(s.data, REGISTRY)).toEqual({ ok: true, nonSignees: 1, inconnues: 0 })
  })

  it('listerEntrees filtre par patient, plus récent d’abord', async () => {
    const { j } = await troisEntrees()
    const e = await j.listerEntrees('p-01')
    expect(e.map(x => x.i)).toEqual([1, 0])
  })

  it('modification au milieu → HASH', async () => {
    const { s } = await troisEntrees()
    s.data[1].cible = 'p-99'
    expect(await verifierChaine(s.data, REGISTRY)).toMatchObject({ ok: false, premiereRupture: 1, raison: 'HASH' })
  })

  it('suppression au milieu → rupture détectée', async () => {
    const { s } = await troisEntrees()
    expect((await verifierChaine([s.data[0], s.data[2]], REGISTRY)).ok).toBe(false)
  })

  it('entrée attribuée à un badge mais sans signature → SIGNATURE', async () => {
    const { s } = await troisEntrees()
    delete s.data[0].sig
    expect(await verifierChaine(s.data, REGISTRY)).toMatchObject({ ok: false, raison: 'SIGNATURE' })
  })

  it('signataire hors registre : compté comme inconnu, jamais comme vérifié', async () => {
    const s = new MemoireStockage()
    await new Journal(s).ajouterEntree({ action: 'LECTURE', cible: 'p-01', rubriques: ['C0'], signataire: intrus })
    expect(await verifierChaine(s.data, REGISTRY)).toEqual({ ok: true, nonSignees: 0, inconnues: 1 })
  })
})

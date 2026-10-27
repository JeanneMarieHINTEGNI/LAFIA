import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Journal, MemoireStockage, verifierChaine, type Entree } from '../src/journal'
import { ETAB, REGISTRY, infirmier, medecin } from './helpers'

// Vecteurs PARTAGÉS avec le backend Python (backend/tests/vecteurs_journal.json) : le serveur doit accepter
// exactement ces entrées, produites par le code du navigateur. Pour les régénérer après un changement VOULU du format :
//   LAFIA_ECRIRE_VECTEURS=1 bunx vitest run test/vecteurs-journal.test.ts   puis copier le fichier dans le backend.
const FICHIER = resolve(process.cwd(), 'demo/vecteurs_journal.json')   // vitest s'exécute depuis la racine du frontend

async function produire(): Promise<Entree[]> {
  let t = 1_790_000_000
  const s = new MemoireStockage()
  const j = new Journal(s, () => (t += 60))
  await j.ajouterEntree({ action: 'LECTURE', cible: 'p-0123456789abcdef', rubriques: ['C0'], etab: ETAB, signataire: medecin })
  await j.ajouterEntree({ action: 'LECTURE', cible: 'p-0123456789abcdef', rubriques: ['C0'] })
  await j.ajouterEntree({ action: 'LECTURE', cible: 'p-fedcba9876543210', rubriques: ['C0'], etab: ETAB, signataire: infirmier })
  await j.ajouterEntree({ action: 'ECRITURE', cible: 'p-0123456789abcdef', rubriques: ['C0'], etab: ETAB, signataire: medecin })
  // Lecture sans badge avec motif (ajouté après coup : les 4 premières entrées gardent leurs empreintes d'origine).
  await j.ajouterEntree({ action: 'LECTURE', cible: 'p-fedcba9876543210', rubriques: ['C0'], motif: 'INCONSCIENT' })
  return s.data
}

describe('Vecteurs du journal partagés avec le backend', () => {
  it('le code actuel produit exactement les vecteurs enregistrés', async () => {
    const entrees = await produire()
    if (process.env.LAFIA_ECRIRE_VECTEURS === '1') writeFileSync(FICHIER, JSON.stringify({ registre: REGISTRY, entrees }, null, 2) + '\n')
    const enregistres = JSON.parse(readFileSync(FICHIER, 'utf-8'))
    expect(entrees).toEqual(enregistres.entrees)
    expect(await verifierChaine(enregistres.entrees, REGISTRY)).toEqual({ ok: true, nonSignees: 2, inconnues: 0 })
  })
})
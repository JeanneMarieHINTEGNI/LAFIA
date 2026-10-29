import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { appareil, enCsv, enTexte, resumer, secondes, type Essai } from '../src/terrain/g1'
import TestTerrain from '../src/terrain/TestTerrain'

const essai = (n: number, ms: number, p: Partial<Essai> = {}): Essai => ({ n, t: 1793260000 + n, ms, ok: true, condition: 'Lumière normale', horsLigne: true, ...p })
const dix = (ms = 1500) => Array.from({ length: 10 }, (_, i) => essai(i + 1, ms + i * 100))

describe('Test terrain G1 : calcul', () => {
  it('objectif atteint : 10 lectures valides, hors ligne, toutes sous 5 s', () => {
    const r = resumer(dix())
    expect(r).toMatchObject({ total: 10, valides: 10, sousObjectif: 10, horsLigne: 10, atteint: true, max: 2400 })
    expect(r.mediane).toBe(1950)
  })

  it('non atteint si une lecture est lente, refusée, faite en ligne, ou s’il en manque', () => {
    const lente = dix(); lente[4] = essai(5, 5000)
    expect(resumer(lente).atteint).toBe(false)                                   // 5,0 s n'est pas « moins de 5 s »
    const refusee = dix(); refusee[2] = essai(3, 900, { ok: false, raison: 'signataire inconnu' })
    expect(resumer(refusee)).toMatchObject({ valides: 9, atteint: false })
    const enLigne = dix(); enLigne[0] = essai(1, 900, { horsLigne: false })
    expect(resumer(enLigne).atteint).toBe(false)
    expect(resumer(dix().slice(0, 9)).atteint).toBe(false)
    expect(resumer([])).toMatchObject({ total: 0, mediane: null, max: null, atteint: false })
  })

  it('résumé WhatsApp et tableau, lisibles en français', () => {
    const l = [...dix().slice(0, 2), essai(3, 800, { ok: false, raison: 'carte illisible', condition: 'Pénombre' })]
    const t = enTexte(l, { appareil: 'Android 13 (SM-A145F) · Chrome', testeur: 'Chloé', lieu: 'CS de Bassila' })
    expect(t).toMatch(/^Test terrain G1 LAFIA : test en cours \(3\/10 lectures\)/)
    expect(enTexte(dix(), { appareil: 'x', testeur: '', lieu: '' })).toMatch(/^Test terrain G1 LAFIA : OBJECTIF ATTEINT/)
    expect(t).toMatch(/Lectures valides : 2\/3 · sous 5 s : 2\/3/)
    expect(t).toMatch(/3\. REFUSÉE \(carte illisible\) · Pénombre/)
    const csv = enCsv(l, { appareil: 'x', testeur: 'Chloé', lieu: 'CS "Nord"' }).split('\n')
    expect(csv[0]).toBe('n;date;temps_ms;valide;raison;condition;hors_ligne;telephone;testeur;lieu')
    expect(csv[3]).toMatch(/"non";"carte illisible";"Pénombre";"oui";"x";"Chloé";"CS ""Nord"""/)
    expect(secondes(1234)).toBe('1,2 s')
  })

  it('téléphone reconnu depuis le navigateur', () => {
    expect(appareil('Mozilla/5.0 (Linux; Android 13; SM-A145F Build/TP1A) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBe('Android 13 (SM-A145F) · Chrome')
    expect(appareil('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBe('Android 10 · Chrome')
    expect(appareil('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1')).toBe('iOS · Safari')
  })
})

describe('Test terrain G1 : page', () => {
  beforeEach(() => localStorage.clear())

  it('n’affiche jamais le contenu de la carte ; montre l’état du réseau et le bilan', () => {
    localStorage.setItem('lafia:test-g1', JSON.stringify(dix()))
    render(<TestTerrain />)
    expect(screen.getByText('Objectif G1 atteint')).toBeTruthy()
    expect(screen.getByText(/Lecture n° 11/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Allergies|Groupe sanguin|Pénicilline/)
    expect(screen.getByRole('status').textContent).toMatch(/EN LIGNE|Mode avion/)
  })

  it('« Recommencer » efface les lectures après confirmation', () => {
    localStorage.setItem('lafia:test-g1', JSON.stringify(dix()))
    window.confirm = () => true
    render(<TestTerrain />)
    fireEvent.click(screen.getByRole('button', { name: 'Recommencer' }))
    expect(screen.queryByText('Objectif G1 atteint')).toBeNull()
    expect(JSON.parse(localStorage.getItem('lafia:test-g1')!)).toEqual([])
  })
})
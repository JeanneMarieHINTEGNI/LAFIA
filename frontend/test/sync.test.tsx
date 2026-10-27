import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { journal } from '../src/journal/usejournal'
import { envoyerJournal, idChaine } from '../src/journal/sync'
import { JournalView } from '../src/patient/JournalView'
import { Journal, MemoireStockage, type Entree } from '../src/journal'
import { ETAB, infirmier } from './helpers'

const ID = 'p-0123456789abcdef'
const repondre = (corps: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } }))

/** Une lecture faite sur un AUTRE appareil (chaîne distincte), telle que le serveur la renverrait. */
async function lectureAilleurs(): Promise<Entree> {
  const s = new MemoireStockage()
  await new Journal(s, () => 1_790_000_000).ajouterEntree({ action: 'LECTURE', cible: ID, rubriques: ['C0'], etab: ETAB, signataire: infirmier })
  return s.data[0]
}

describe('Synchronisation du journal', () => {
  beforeEach(() => { localStorage.clear(); localStorage.setItem('lafia:c0-id', JSON.stringify(ID)) })

  it('envoie les lectures locales à la chaîne de cet appareil, puis seulement les nouvelles', async () => {
    const fetch = vi.fn((_url: string, init?: RequestInit) => repondre({ acceptees: JSON.parse(String(init?.body)).entrees.length, deja_recues: 0, prochain_rang: 2 }))
    vi.stubGlobal('fetch', fetch)
    await journal.ajouterEntree({ action: 'LECTURE', cible: ID, rubriques: ['C0'] })
    await journal.ajouterEntree({ action: 'LECTURE', cible: ID, rubriques: ['C0'] })
    await envoyerJournal()
    const [url, init] = fetch.mock.calls[fetch.mock.calls.length - 1]
    expect(url).toBe(`/api/journal/chaines/${idChaine()}/entrees`)
    expect(JSON.parse(String(init?.body)).entrees.map((e: Entree) => e.i)).toEqual([0, 1])
    fetch.mockClear()
    await envoyerJournal()
    expect(fetch).not.toHaveBeenCalled()       // rien de nouveau : aucun envoi
  })

  it('hors ligne : aucune erreur, l’envoi sera retenté', async () => {
    await journal.ajouterEntree({ action: 'LECTURE', cible: ID, rubriques: ['C0'] })
    await expect(envoyerJournal()).resolves.toBeUndefined()
    expect(localStorage.getItem('lafia.chaine.envoye')).toBeNull()
  })

  it('« Mon journal » affiche une lecture faite sur un autre appareil, revérifiée localement', async () => {
    const e = await lectureAilleurs()
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.endsWith('/patients') ? repondre({ id: ID, cree: true }, 201) : repondre({ entrees: [{ ...e, chaine: 'c-' + 'b2'.repeat(16), statut: 'signee' }] }))))
    render(<JournalView />)
    await screen.findByText(/lue sur un autre appareil/)
    expect(screen.getByText('Signé par son badge')).toBeTruthy()
    expect(screen.getByText('Infirmier Démo')).toBeTruthy()
  })

  it('une entrée modifiée sur le serveur est signalée comme falsifiée, même si le serveur dit « signee »', async () => {
    const e = { ...(await lectureAilleurs()), etab: 'ffffff' }
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.endsWith('/patients') ? repondre({ id: ID, cree: true }, 201) : repondre({ entrees: [{ ...e, chaine: 'c-' + 'b2'.repeat(16), statut: 'signee' }] }))))
    render(<JournalView />)
    await screen.findByText('Entrée falsifiée')
  })

  it('serveur injoignable : on le dit, et le journal local reste affiché', async () => {
    await journal.ajouterEntree({ action: 'LECTURE', cible: ID, rubriques: ['C0'] })
    render(<JournalView />)
    await screen.findByText(/Serveur injoignable/)
    expect(screen.getByText(/lue sur cet appareil/)).toBeTruthy()
  })
})

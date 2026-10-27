import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { JournalView } from '../src/patient/JournalView'
import { journal } from '../src/journal/usejournal'
import { ETAB, medecin } from './helpers'

const ID = 'p-0123456789abcdef'

describe('« Mon journal » (vrai journal de l’appareil)', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('lafia:c0-id', JSON.stringify(ID))
  })

  it('sans carte : invite à la faire créer, sans aucune donnée fictive', async () => {
    render(<JournalView />)
    await screen.findByText('Votre carte n’a pas encore été créée.')
    expect(screen.queryByText(/Bris de glace|fictif/i)).toBeNull()
  })

  it('carte signée mais jamais lue : le dit simplement', async () => {
    localStorage.setItem('lafia:c0-carte', JSON.stringify('L2:XYZ'))
    render(<JournalView />)
    await screen.findByText('Personne n’a encore lu votre carte.')
  })

  it('affiche les vraies lectures : signée par badge, ou sans badge (non vérifiée)', async () => {
    await journal.ajouterEntree({ action: 'LECTURE', cible: ID, rubriques: ['C0'], etab: ETAB, signataire: { ...medecin } })
    await journal.ajouterEntree({ action: 'LECTURE', cible: ID, rubriques: ['C0'] })
    await journal.ajouterEntree({ action: 'LECTURE', cible: 'p-ffffffffffffffff', rubriques: ['C0'] })   // autre patient : pas affiché
    render(<JournalView />)
    await screen.findByText('Journal intègre')
    expect(screen.getByText('Signé par son badge')).toBeTruthy()
    expect(screen.getByText('Lecteur sans badge')).toBeTruthy()
    expect(screen.getByText(/Centre hospitalier de référence/)).toBeTruthy()
    expect(screen.getAllByRole('listitem').length).toBe(2)
  })

  it('lecture sans badge : le patient voit le motif déclaré', async () => {
    await journal.ajouterEntree({ action: 'LECTURE', cible: ID, rubriques: ['C0'], motif: 'NE_PARLE_PAS' })
    render(<JournalView />)
    await screen.findByText('Non vérifié · motif : Ne peut pas s’exprimer')
  })

  it('« Simuler une altération » montre la rupture, sans modifier le vrai journal', async () => {
    for (let k = 0; k < 3; k++) await journal.ajouterEntree({ action: 'LECTURE', cible: ID, rubriques: ['C0'] })
    const avant = localStorage.getItem('lafia.journal')
    render(<JournalView />)
    fireEvent.click(await screen.findByText('Simuler une altération'))
    await screen.findByText('Altération détectée (simulation)')
    expect(localStorage.getItem('lafia.journal')).toBe(avant)
    fireEvent.click(screen.getByText('Revenir au vrai journal'))
    await waitFor(() => expect(screen.getByText('Journal intègre')).toBeTruthy())
  })
})
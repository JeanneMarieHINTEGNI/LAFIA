import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, useEffect } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { verifierChaine } from '../src/journal'
import { journal } from '../src/journal/usejournal'
import { BadgeProvider, useBadge } from '../src/ui/BadgeContext'
import { ScanJournalise } from '../src/ui/ScanJournalise'
import { REGISTRY, SECRETS, payload, signed } from './helpers'

const QR = signed(payload({ id: 'p-0123456789abcdef', iat: Math.floor(Date.now() / 1000) - 60 }))

function AvecBadge() {
  const { loadBadge } = useBadge()
  useEffect(() => { loadBadge(SECRETS.medecin) }, [loadBadge])
  return null
}

beforeEach(() => localStorage.clear())

describe('« Qui lit ? »', () => {
  it('sans badge : la carte n’est pas affichée avant le choix', () => {
    render(<BadgeProvider><ScanJournalise initialText={QR} /></BadgeProvider>)
    expect(screen.getByText('Qui lit cette carte ?')).toBeTruthy()
    expect(screen.queryByText(/Signature valide/)).toBeNull()
    expect(screen.getAllByRole('button').map(b => b.textContent))
      .toEqual(expect.arrayContaining(['Patient inconscient', 'Ne peut pas s’exprimer', 'Urgence vitale', 'Autre urgence']))
  })

  it('urgence sans badge : un toucher, la carte s’affiche, la lecture est inscrite non signée avec le motif', async () => {
    render(<BadgeProvider><ScanJournalise initialText={QR} /></BadgeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Patient inconscient' }))
    await screen.findByText(/Signature valide/)
    expect(screen.getByText(/Lecture sans badge · motif : Patient inconscient/)).toBeTruthy()
    const [e] = await journal.listerEntrees('p-0123456789abcdef')
    expect(e).toMatchObject({ action: 'LECTURE', motif: 'INCONSCIENT' })
    expect(e.acteur).toBeUndefined()
    expect(await verifierChaine(JSON.parse(localStorage.getItem('lafia.journal')!), REGISTRY)).toMatchObject({ ok: true, nonSignees: 1 })
  })

  it('badge déjà chargé : pas d’écran, lecture signée, aucun motif', async () => {
    render(<BadgeProvider><AvecBadge /><ScanJournalise initialText={QR} /></BadgeProvider>)
    await screen.findByText(/Signature valide/)
    expect(screen.queryByText('Qui lit cette carte ?')).toBeNull()
    await waitFor(async () => expect((await journal.listerEntrees('p-0123456789abcdef')).length).toBe(1))
    const [e] = await journal.listerEntrees('p-0123456789abcdef')
    expect(e.acteur).toBeTruthy()
    expect(e.motif).toBeUndefined()
    expect(await verifierChaine(JSON.parse(localStorage.getItem('lafia.journal')!), REGISTRY)).toMatchObject({ ok: true, nonSignees: 0 })
  })

  it('mode strict (effets rejoués) : une lecture = une seule entrée', async () => {
    render(<StrictMode><BadgeProvider><ScanJournalise initialText={QR} /></BadgeProvider></StrictMode>)
    fireEvent.click(screen.getByRole('button', { name: 'Urgence vitale' }))
    await screen.findByText(/Signature valide/)
    await new Promise(r => setTimeout(r, 200))
    expect(await journal.listerEntrees('p-0123456789abcdef')).toHaveLength(1)
  })
})
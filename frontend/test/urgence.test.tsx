import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BadgeProvider, useBadge, type BadgeFile } from '../src/ui/BadgeContext'
import { ScanUrgence } from '../src/ui/ScanUrgence'
import { SECRETS, intrus, signed, payload } from './helpers'

function BadgeProbe({ file }: { file: BadgeFile }) {
  const { badge, role, roleLabel, loadBadge, clearBadge } = useBadge()
  return (
    <div>
      <button type="button" onClick={() => loadBadge(file)}>load</button>
      <button type="button" onClick={() => clearBadge()}>clear</button>
      <span data-testid="role">{role ?? 'none'}</span>
      <span data-testid="label">{roleLabel ?? 'none'}</span>
      <span data-testid="kid">{badge?.kid ?? 'none'}</span>
    </div>
  )
}

const mount = (file: BadgeFile) => render(<BadgeProvider><BadgeProbe file={file} /></BadgeProvider>)
const text = (id: string) => screen.getByTestId(id).textContent

describe('BadgeContext', () => {
  it.each([
    ['medecin', 'Médecin'],
    ['infirmier', 'Infirmier(ère)'],
    ['relais', 'Relais communautaire'],
  ] as const)('charge le badge %s ; le rôle vient du registre', (nom, libelle) => {
    mount(SECRETS[nom])
    fireEvent.click(screen.getByText('load'))
    expect(text('role')).toBe(nom)
    expect(text('label')).toBe(libelle)
    expect(text('kid')).toBe(SECRETS[nom].kid)
  })

  it('refuse un badge absent du registre', () => {
    mount({ seed: '11'.repeat(32) })
    fireEvent.click(screen.getByText('load'))
    expect(text('role')).toBe('none')
  })

  it('refuse un fichier dont le kid ne correspond pas à la graine', () => {
    mount({ kid: SECRETS.infirmier.kid, seed: SECRETS.medecin.seed })
    fireEvent.click(screen.getByText('load'))
    expect(text('role')).toBe('none')
  })

  it('refuse une graine mal formée', () => {
    mount({ seed: 'medecin-demo-seed' })
    fireEvent.click(screen.getByText('load'))
    expect(text('role')).toBe('none')
  })

  it('efface le badge sur demande', () => {
    mount(SECRETS.medecin)
    fireEvent.click(screen.getByText('load'))
    fireEvent.click(screen.getByText('clear'))
    expect(text('role')).toBe('none')
    expect(text('kid')).toBe('none')
  })
})

describe('ScanUrgence', () => {
  it('carte valide : journal appelé AVANT l’affichage, puis contenu rendu', async () => {
    const ordre: string[] = []
    const beforeDisplay = vi.fn(async () => {
      ordre.push(screen.queryByText(/Signature valide/) ? 'déjà affiché' : 'journal')
    })
    render(<ScanUrgence initialText={signed(payload({ iat: Math.floor(Date.now() / 1000) }))} beforeDisplay={beforeDisplay} />)
    await screen.findByText(/Signature valide/)
    expect(beforeDisplay).toHaveBeenCalledTimes(1)
    expect(ordre).toEqual(['journal'])
    expect(screen.getByText(/Pénicilline/)).toBeTruthy()
  })

  it('journal indisponible : lecture possible avec bandeau « non journalisée »', async () => {
    render(<ScanUrgence initialText={signed(payload({ iat: Math.floor(Date.now() / 1000) }))} beforeDisplay={() => Promise.reject(new Error('plein'))} />)
    await screen.findByText(/Signature valide/)
    expect(screen.getByText(/NON journalisée/)).toBeTruthy()
  })

  it('carte d’un signataire inconnu : refusée, aucune donnée médicale rendue', async () => {
    const beforeDisplay = vi.fn()
    await act(async () => {
      render(<ScanUrgence initialText={signed(payload({}, intrus), intrus)} beforeDisplay={beforeDisplay} />)
    })
    await waitFor(() => expect(screen.getByText(/Carte refusée/)).toBeTruthy())
    expect(screen.queryByText(/Pénicilline/)).toBeNull()
    expect(beforeDisplay).not.toHaveBeenCalled()
  })
})

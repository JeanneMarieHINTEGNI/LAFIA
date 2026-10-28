import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verify } from '../src/core'
import { falsifier } from '../src/patient/carte'
import { RecevoirCarte, accepterNouvelleCarte } from '../src/patient/RecevoirCarte'
import EspaceSoignant from '../src/soignant/EspaceSoignant'
import { BadgeProvider, useBadge } from '../src/ui/BadgeContext'
import { journal } from '../src/journal/usejournal'
import { REGISTRY, SECRETS, medecin, payload, signed } from './helpers'

const ID = 'p-0123456789abcdef'
const maintenant = () => Math.floor(Date.now() / 1000)
const carte = (iat: number, id = ID) => signed(payload({ id, iat, co: [] }))

function AvecBadge() {
  const { loadBadge } = useBadge()
  useEffect(() => { loadBadge(SECRETS.medecin) }, [loadBadge])
  return null
}

beforeEach(() => localStorage.clear())

describe('Patient : recevoir une nouvelle carte', () => {
  const t = maintenant()
  it('accepte une carte plus récente du même patient', () => {
    expect(accepterNouvelleCarte(carte(t - 60), REGISTRY, ID, carte(t - 3600))).toMatchObject({ ok: true })
  })
  it('refuse la carte d’un autre patient, une plus ancienne, la même, une falsifiée, et sans espace', () => {
    expect(accepterNouvelleCarte(carte(t - 60, 'p-1111111111111111'), REGISTRY, ID, '')).toMatchObject({ ok: false, erreur: expect.stringMatching(/autre patient/) })
    expect(accepterNouvelleCarte(carte(t - 3600), REGISTRY, ID, carte(t - 60))).toMatchObject({ ok: false, erreur: expect.stringMatching(/plus ancienne/) })
    const c = carte(t - 60)
    expect(accepterNouvelleCarte(c, REGISTRY, ID, c)).toMatchObject({ ok: false, erreur: expect.stringMatching(/déjà votre carte/) })
    expect(accepterNouvelleCarte(falsifier(carte(t - 60)), REGISTRY, ID, '')).toMatchObject({ ok: false, erreur: expect.stringMatching(/Carte refusée/) })
    expect(accepterNouvelleCarte(carte(t - 60), REGISTRY, '', '')).toMatchObject({ ok: false })
  })
  it('écran : coller la nouvelle carte la remet au patient avec son profil', () => {
    const onRecue = vi.fn()
    render(<RecevoirCarte idPatient={ID} carteActuelle={carte(t - 3600)} onRecue={onRecue} />)
    fireEvent.click(screen.getByText(/Pas de caméra/))
    fireEvent.change(screen.getByPlaceholderText(/L2:… ou https/), { target: { value: carte(t - 60) } })
    fireEvent.click(screen.getByText('Enregistrer cette carte'))
    expect(onRecue).toHaveBeenCalledOnce()
    expect(onRecue.mock.calls[0][2].al).toEqual({ etat: 'connu', codes: ['PEN'] })
    expect(screen.getByRole('status').textContent).toMatch(/Nouvelle carte enregistrée/)
  })
})

describe('Espace soignant', () => {
  it('sans badge : rien d’autre que le chargement du badge', () => {
    render(<BadgeProvider><EspaceSoignant /></BadgeProvider>)
    expect(screen.getByText('Chargez votre badge pour commencer.')).toBeTruthy()
    expect(screen.queryByText('Scanner la carte du patient')).toBeNull()
  })

  it('parcours complet : lecture signée, consultation ajoutée, émission journalisée, nouvelle carte valide', async () => {
    render(<BadgeProvider><AvecBadge /><EspaceSoignant /></BadgeProvider>)
    await screen.findByText('✓ Badge chargé')
    fireEvent.click(screen.getByText(/Pas de caméra/))
    fireEvent.change(screen.getByPlaceholderText(/L2:… ou https/), { target: { value: carte(maintenant() - 3600) } })
    fireEvent.click(screen.getByText('Lire cette carte'))
    await screen.findByText(/Signature valide/)

    fireEvent.click(screen.getByRole('button', { name: 'Fièvre' }))
    fireEvent.click(screen.getByText('Relire avant signature'))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByText('Signer la carte'))
    await screen.findByText('3. Nouvelle carte signée')

    const entrees = await journal.listerEntrees(ID)
    expect(entrees.map(e => e.action)).toEqual(['ECRITURE', 'LECTURE'])            // plus récente d'abord
    expect(entrees.every(e => e.acteur === medecin.kid)).toBe(true)                 // tout est signé par le badge
    await waitFor(() => expect(screen.getAllByText(ID).length).toBeGreaterThan(0))  // « Mes signatures récentes »

    // La carte émise est valide, pour le même patient, avec la consultation ajoutée, signée par ce badge.
    const emise = verify((screen.getByTestId('nouvelle-carte') as HTMLTextAreaElement).value, REGISTRY)
    if (!emise.ok) throw new Error(emise.reason)
    expect(emise.payload.id).toBe(ID)
    expect(emise.kid).toBe(medecin.kid)
    expect(emise.payload.co?.map(c => c.m)).toEqual(['FIEV'])
    expect(emise.payload.pr?.al).toEqual(['PEN'])                                   // le profil lu est conservé
  })

  it('carte falsifiée : refusée, aucune donnée affichée, rien n’est journalisé', async () => {
    render(<BadgeProvider><AvecBadge /><EspaceSoignant /></BadgeProvider>)
    await screen.findByText('✓ Badge chargé')
    fireEvent.click(screen.getByText(/Pas de caméra/))
    fireEvent.change(screen.getByPlaceholderText(/L2:… ou https/), { target: { value: falsifier(carte(maintenant() - 60)) } })
    fireEvent.click(screen.getByText('Lire cette carte'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Carte refusée/)
    expect(screen.queryByText(/Signature valide/)).toBeNull()
    expect(await journal.listerEntrees(ID)).toHaveLength(0)
  })
})
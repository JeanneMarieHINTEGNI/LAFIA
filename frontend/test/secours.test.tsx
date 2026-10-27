import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verify } from '../src/core'
import { construireProfil, falsifier } from '../src/patient/carte'
import {
  carteEnTexte, codeSecours, enregistrerCarteRestauree, lireCodeSecours, profilDepuisCarte, restaurerCarte,
} from '../src/patient/secours'
import { RestaurerEspace, SauvegardeSecours } from '../src/patient/Secours'
import EspacePatient from '../src/patient/EspacePatient'
import { BadgeProvider } from '../src/ui/BadgeContext'
import { verifierJeton } from '../src/journal/sync'
import { REGISTRY, payload, signed } from './helpers'

const ID = 'p-0123456789abcdef'
const JETON = 'j'.repeat(43)
const maintenant = () => Math.floor(Date.now() / 1000)
const carteDe = (id = ID) => signed(payload({ id, iat: maintenant() - 60, pr: { al: ['PEN'], tx: [{ c: 'ARTE' }], ah: [], gs: 'O+', yb: 1990, ec: { n: 'Kossi', tel: '+229 97 00 00 41' } } }))

/** Faux serveur : reconnaît JETON pour ID, refuse le reste. */
function serveur() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get('Authorization')
    if (String(url).includes(`/journal/patients/${ID}`)) {
      return auth === `Bearer ${JETON}` ? new Response(JSON.stringify({ entrees: [] }), { status: 200 }) : new Response('{}', { status: 401 })
    }
    if (String(url).endsWith('/patients')) return new Response(JSON.stringify({ cree: false }), { status: 200 })
    return new Response('{}', { status: 404 })
  }))
}

beforeEach(() => localStorage.clear())

describe('Code de secours', () => {
  it('aller-retour, espaces et retours à la ligne tolérés', async () => {
    const code = await codeSecours(ID, JETON)
    expect(code.startsWith('LAFIA-SECOURS:p-0123456789abcdef:')).toBe(true)
    expect(await lireCodeSecours(` ${code.slice(0, 30)}\n${code.slice(30)} `)).toEqual({ ok: true, id: ID, jeton: JETON })
  })
  it('une faute de frappe est détectée par le contrôle', async () => {
    const code = await codeSecours(ID, JETON)
    const faute = code.replace(':jjj', ':jjk')
    expect(await lireCodeSecours(faute)).toMatchObject({ ok: false, erreur: expect.stringMatching(/mal recopié/) })
  })
  it('un texte quelconque est refusé', async () => {
    expect((await lireCodeSecours('bonjour')).ok).toBe(false)
    expect((await lireCodeSecours('L2:ABC')).ok).toBe(false)
  })
})

describe('Serveur : vérification du secret', () => {
  it('ok, refusé, injoignable', async () => {
    serveur()
    expect(await verifierJeton(ID, JETON)).toBe('ok')
    expect(await verifierJeton(ID, 'x'.repeat(43))).toBe('refuse')
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('hors ligne'))))
    expect(await verifierJeton(ID, JETON)).toBe('injoignable')
  })
})

describe('Carte restaurée', () => {
  it('un lien #L2B: redonne exactement la même carte que le texte L2:', () => {
    const texte = carteDe()
    const lien = signed(payload({ id: ID, iat: maintenant() - 60 }), undefined, 'https://lafia.example/')
    const t2 = carteEnTexte(lien)
    expect(t2.startsWith('L2:')).toBe(true)
    expect(verify(t2, REGISTRY)).toMatchObject({ ok: true })
    expect(carteEnTexte(texte)).toBe(texte)
  })
  it('refuse une carte falsifiée ou celle d’un autre identifiant', () => {
    expect(restaurerCarte(falsifier(carteDe()), REGISTRY)).toMatchObject({ ok: false, erreur: expect.stringMatching(/Carte refusée/) })
    expect(restaurerCarte(carteDe('p-1111111111111111'), REGISTRY, ID)).toMatchObject({ ok: false, erreur: expect.stringMatching(/autre identifiant/) })
  })
  it('le profil revient dans le formulaire sans rien perdre (aller-retour)', () => {
    const pr = { al: ['PEN'], ah: [], tx: [{ c: 'ARTE' }], gs: 'O+', yb: 1990, sx: 'F' as const, ec: { n: 'Kossi', tel: '+229 97 00 00 41' } }
    expect(construireProfil(profilDepuisCarte(pr))).toEqual(pr)
    expect(profilDepuisCarte({}).al.etat).toBe('inconnu')          // non renseigné reste non renseigné
  })
  it('écrit la carte, le profil et les consultations là où l’espace patient les lit', () => {
    const r = restaurerCarte(carteDe(), REGISTRY)
    if (!r.ok) throw new Error(r.erreur)
    enregistrerCarteRestauree(r.carte, r.payload)
    expect(JSON.parse(localStorage.getItem('lafia:c0-id')!)).toBe(ID)
    expect(JSON.parse(localStorage.getItem('lafia:c0-carte')!)).toBe(r.carte)
    expect(JSON.parse(localStorage.getItem('lafia:c0-profil')!).al).toEqual({ etat: 'connu', codes: ['PEN'] })
    expect(JSON.parse(localStorage.getItem('lafia:c0-consultations')!)).toHaveLength(1)
  })
})

describe('Écrans', () => {
  it('« Afficher mon code de secours » montre un code valide pour cet identifiant', async () => {
    localStorage.setItem('lafia:patient-jeton', JETON)
    render(<SauvegardeSecours id={ID} />)
    fireEvent.click(screen.getByText('Afficher mon code de secours'))
    const code = (await screen.findByTestId('code-secours')).textContent!
    expect(await lireCodeSecours(code)).toEqual({ ok: true, id: ID, jeton: JETON })
  })

  it('restauration refusée sans réseau : rien n’est écrit', async () => {
    const onRestaure = vi.fn()
    render(<RestaurerEspace onRestaure={onRestaure} />)
    fireEvent.click(screen.getByText(/J’avais déjà un espace/))
    fireEvent.change(screen.getByPlaceholderText('LAFIA-SECOURS:p-…'), { target: { value: await codeSecours(ID, JETON) } })
    fireEvent.click(screen.getByText('Vérifier et restaurer'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Pas de connexion/)
    expect(onRestaure).not.toHaveBeenCalled()
    expect(localStorage.getItem('lafia:patient-jeton')).toBeNull()
  })

  it('code refusé par le serveur : message clair, rien n’est écrit', async () => {
    serveur()
    render(<RestaurerEspace onRestaure={vi.fn()} />)
    fireEvent.click(screen.getByText(/J’avais déjà un espace/))
    fireEvent.change(screen.getByPlaceholderText('LAFIA-SECOURS:p-…'), { target: { value: await codeSecours(ID, 'x'.repeat(43)) } })
    fireEvent.click(screen.getByText('Vérifier et restaurer'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/ne reconnaît pas/)
    expect(localStorage.getItem('lafia:patient-jeton')).toBeNull()
  })

  it('nouveau téléphone : code + carte → l’espace reprend le même identifiant et la carte', async () => {
    serveur()
    render(<BadgeProvider><EspacePatient tab="carte" /></BadgeProvider>)
    fireEvent.click(screen.getByText(/J’avais déjà un espace/))
    fireEvent.change(screen.getByPlaceholderText('LAFIA-SECOURS:p-…'), { target: { value: await codeSecours(ID, JETON) } })
    fireEvent.change(screen.getByPlaceholderText(/L2:… ou https/), { target: { value: carteDe() } })
    fireEvent.click(screen.getByText('Vérifier et restaurer'))
    await screen.findByText(/Espace retrouvé/)
    expect(screen.getByDisplayValue('1990')).toBeTruthy()             // année reprise de la carte
    fireEvent.change(screen.getByPlaceholderText('Prénom'), { target: { value: 'Awa' } })
    fireEvent.change(screen.getByPlaceholderText('Nom'), { target: { value: 'Dossou' } })
    fireEvent.click(screen.getByText('Créer mon espace'))
    await waitFor(() => expect(screen.getAllByText(ID).length).toBeGreaterThan(0))
    expect(localStorage.getItem('lafia:patient-jeton')).toBe(JETON)
    expect(JSON.parse(localStorage.getItem('lafia:patient-profile')!).healthId).toBe(ID)
    expect(JSON.parse(localStorage.getItem('lafia:c0-carte')!).startsWith('L2:')).toBe(true)
  })
})
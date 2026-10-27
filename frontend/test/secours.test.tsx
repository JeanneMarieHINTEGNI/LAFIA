import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verify } from '../src/core'
import { construireProfil, falsifier } from '../src/patient/carte'
import {
  carteEnTexte, codeSecours, enregistrerCarteRestauree, estCodeSecours, lireCodeSecours, profilDepuisCarte, restaurerCarte,
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

describe('Carte restaurée (seulement après le code de secours)', () => {
  it('un lien #L2B: redonne exactement la même carte que le texte L2:', () => {
    const texte = carteDe()
    const lien = signed(payload({ id: ID, iat: maintenant() - 60 }), undefined, 'https://lafia.example/')
    const t2 = carteEnTexte(lien)
    expect(t2.startsWith('L2:')).toBe(true)
    expect(verify(t2, REGISTRY)).toMatchObject({ ok: true })
    expect(carteEnTexte(texte)).toBe(texte)
  })
  it('refuse une carte falsifiée, et une carte d’un autre espace que le code', () => {
    expect(restaurerCarte(falsifier(carteDe()), REGISTRY, ID)).toMatchObject({ ok: false, erreur: expect.stringMatching(/Carte refusée/) })
    expect(restaurerCarte(carteDe('p-1111111111111111'), REGISTRY, ID)).toMatchObject({ ok: false, erreur: expect.stringMatching(/autre espace/) })
  })
  it('le profil revient dans le formulaire sans rien perdre (aller-retour)', () => {
    const pr = { al: ['PEN'], ah: [], tx: [{ c: 'ARTE' }], gs: 'O+', yb: 1990, sx: 'F' as const, ec: { n: 'Kossi', tel: '+229 97 00 00 41' } }
    expect(construireProfil(profilDepuisCarte(pr))).toEqual(pr)
    expect(profilDepuisCarte({}).al.etat).toBe('inconnu')
  })
  it('écrit la carte, le profil et les consultations là où l’espace patient les lit', () => {
    const r = restaurerCarte(carteDe(), REGISTRY, ID)
    if (!r.ok) throw new Error(r.erreur)
    enregistrerCarteRestauree(r.carte, r.payload)
    expect(JSON.parse(localStorage.getItem('lafia:c0-id')!)).toBe(ID)
    expect(JSON.parse(localStorage.getItem('lafia:c0-profil')!).al).toEqual({ etat: 'connu', codes: ['PEN'] })
    expect(JSON.parse(localStorage.getItem('lafia:c0-consultations')!)).toHaveLength(1)
  })
  it('le QR d’un code de secours est reconnu, celui d’une carte non', async () => {
    expect(estCodeSecours(await codeSecours(ID, JETON))).toBe(true)
    expect(estCodeSecours(carteDe())).toBe(false)
  })
})

/** Ouvre « Retrouver mon espace » et colle un code de secours. */
async function collerCode(code: string) {
  fireEvent.click(screen.getByText('Pas de caméra ? Coller le code'))
  fireEvent.change(screen.getByPlaceholderText('LAFIA-SECOURS:p-…'), { target: { value: code } })
  fireEvent.click(screen.getByText('Vérifier ce code'))
}

describe('Écrans : la carte ouvre l’urgence, jamais le compte', () => {
  it('« Afficher mon code de secours » montre un code valide, et prévient si l’espace n’est pas encore enregistré', async () => {
    localStorage.setItem('lafia:patient-jeton', JETON)
    render(<SauvegardeSecours id={ID} />)
    fireEvent.click(screen.getByText('Afficher mon code de secours'))
    const code = (await screen.findByTestId('code-secours')).textContent!
    expect(await lireCodeSecours(code)).toEqual({ ok: true, id: ID, jeton: JETON })
    expect(screen.getByRole('alert').textContent).toMatch(/pas encore enregistré/)    // hors ligne dans les tests
    expect(screen.getByText('Imprimer la fiche de secours')).toBeTruthy()
  })

  it('aucune voie « carte seule » : sans code confirmé, la carte ne peut même pas être proposée', () => {
    render(<RestaurerEspace onRestaure={vi.fn()} onAnnuler={vi.fn()} />)
    expect(screen.queryByText('Scanner ma carte')).toBeNull()
    expect(screen.queryByPlaceholderText(/L2:… ou https/)).toBeNull()
    expect((screen.getByText('Retrouver mon espace') as HTMLButtonElement).disabled).toBe(true)
  })

  it('code bien formé mais SANS réseau : refusé (seul le serveur peut le confirmer), rien n’est écrit', async () => {
    const onRestaure = vi.fn()
    render(<RestaurerEspace onRestaure={onRestaure} onAnnuler={vi.fn()} />)
    await collerCode(await codeSecours(ID, JETON))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Connexion nécessaire/)
    expect(onRestaure).not.toHaveBeenCalled()
    expect(localStorage.getItem('lafia:patient-jeton')).toBeNull()
  })

  it('code fabriqué pour l’identifiant d’une carte (secret inventé) : refusé par le serveur', async () => {
    serveur()
    render(<RestaurerEspace onRestaure={vi.fn()} onAnnuler={vi.fn()} />)
    await collerCode(await codeSecours(ID, 'x'.repeat(43)))          // contrôle valide : n'importe qui sait le calculer
    expect((await screen.findByRole('alert')).textContent).toMatch(/ne reconnaît pas/)
    expect(localStorage.getItem('lafia:patient-jeton')).toBeNull()
  })

  it('code confirmé puis carte d’un AUTRE espace : la carte est refusée', async () => {
    serveur()
    render(<RestaurerEspace onRestaure={vi.fn()} onAnnuler={vi.fn()} />)
    await collerCode(await codeSecours(ID, JETON))
    await screen.findByText(/Code confirmé par le serveur/)
    fireEvent.click(screen.getByText('Coller le texte ou le lien de la carte'))
    fireEvent.change(screen.getByPlaceholderText(/L2:… ou https/), { target: { value: carteDe('p-1111111111111111') } })
    fireEvent.click(screen.getByText('Utiliser ce texte'))
    expect(screen.getByRole('alert').textContent).toMatch(/autre espace/)
  })

  it('l’accueil propose deux choix clairs et rappelle que scanner une carte n’ouvre pas l’espace', () => {
    render(<BadgeProvider><EspacePatient tab="carte" /></BadgeProvider>)
    expect(screen.getByText('Créer votre espace')).toBeTruthy()
    expect(screen.getByText('Retrouver votre espace')).toBeTruthy()
    expect(screen.getByText(/Scanner une carte ne donne jamais accès à l’espace d’un patient/)).toBeTruthy()
  })

  it('nouveau téléphone : code confirmé + carte → même identifiant, carte et historique retrouvés', async () => {
    serveur()
    render(<BadgeProvider><EspacePatient tab="carte" /></BadgeProvider>)
    fireEvent.click(screen.getByText('Retrouver mon espace'))
    await collerCode(await codeSecours(ID, JETON))
    await screen.findByText(/Code confirmé par le serveur/)
    fireEvent.click(screen.getByText('Coller le texte ou le lien de la carte'))
    fireEvent.change(screen.getByPlaceholderText(/L2:… ou https/), { target: { value: carteDe() } })
    fireEvent.click(screen.getByText('Utiliser ce texte'))
    await screen.findByText('✓ Carte reconnue')
    fireEvent.click(screen.getByRole('button', { name: 'Retrouver mon espace' }))
    await screen.findByText(/Espace retrouvé/)
    expect(screen.getByDisplayValue('1990')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Prénom'), { target: { value: 'Awa' } })
    fireEvent.change(screen.getByPlaceholderText('Nom'), { target: { value: 'Dossou' } })
    fireEvent.click(screen.getByText('Ouvrir mon espace'))
    await waitFor(() => expect(screen.getAllByText(ID).length).toBeGreaterThan(0))
    expect(localStorage.getItem('lafia:patient-jeton')).toBe(JETON)
    expect(JSON.parse(localStorage.getItem('lafia:patient-profile')!).healthId).toBe(ID)
    expect(JSON.parse(localStorage.getItem('lafia:c0-carte')!).startsWith('L2:')).toBe(true)
  })
})
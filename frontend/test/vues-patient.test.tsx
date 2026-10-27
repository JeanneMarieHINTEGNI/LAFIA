import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AidantView, CompartimentsView } from '../src/patient/views'
import { PROFIL_VIDE } from '../src/patient/carte'
import { ETAB, medecin, payload, signed } from './helpers'

const maintenant = () => Math.floor(Date.now() / 1000)
const FICTIF = /Hépatite|Acénocoumarol|Sertraline|Kossi A\.|Fils|CHU de Parakou|Rappel Lafia/

function poserCarte(pr = payload().pr) {
  const carte = signed(payload({ iat: maintenant() - 60, pr, co: [{ t: maintenant() - 3600, f: ETAB, a: medecin.kid, m: 'FIEV' }] }))
  localStorage.setItem('lafia:c0-carte', JSON.stringify(carte))
}

beforeEach(() => localStorage.clear())

describe('« Mes compartiments » : la vraie carte, rien d’inventé', () => {
  it('sans carte : invite à la créer, aucune donnée d’exemple', () => {
    render(<CompartimentsView />)
    expect(screen.getByText('Votre carte n’a pas encore été créée.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(FICTIF)
  })

  it('avec une carte : son contenu exact, qui l’a signée, et les compartiments à venir', () => {
    poserCarte({ al: ['PEN'], ah: ['HTA', 'DREPANO'], tx: [{ c: 'AVK' }], gs: 'O+', vs: ['DREPANO'], ec: { n: 'Awa', tel: '+229 97 00 00 41' } })
    render(<CompartimentsView />)
    expect(screen.getByText('Pénicilline')).toBeTruthy()
    expect(screen.getByText('O+')).toBeTruthy()
    expect(screen.getByText(/Hypertension, Drépanocytose/)).toBeTruthy()
    expect(screen.getByText(/visible en urgence parce que vous l’avez choisi/)).toBeTruthy()   // catégorie sensible
    expect(screen.getByText(/Signée par : .*Centre hospitalier de référence/)).toBeTruthy()
    expect(screen.getByText(/Dernières consultations \(1\)/)).toBeTruthy()
    expect(screen.getAllByText('Bientôt')).toHaveLength(2)                                      // compartiments 1 et 2
    expect(document.body.textContent).not.toMatch(FICTIF)
  })

  it('« aucune allergie connue » (liste vide) est affiché comme tel, pas comme absent', () => {
    poserCarte({ al: [] })
    render(<CompartimentsView />)
    expect(screen.getByText('Aucune allergie connue')).toBeTruthy()
  })

  it('efface les données d’exemple laissées par d’anciennes versions', () => {
    localStorage.setItem('lafia:caregiver', JSON.stringify({ name: 'Kossi A.' }))
    localStorage.setItem('lafia:compartments', '{}')
    render(<CompartimentsView />)
    expect(localStorage.getItem('lafia:caregiver')).toBeNull()
    expect(localStorage.getItem('lafia:compartments')).toBeNull()
  })
})

describe('« Aidant et rappels »', () => {
  it('l’aidant est le contact d’urgence de la carte, appelable', () => {
    poserCarte({ ec: { n: 'Awa Dossou', tel: '+229 97 00 00 41' }, tx: [{ c: 'INSUL' }] })
    render(<AidantView />)
    expect(screen.getByText(/Awa Dossou/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '+229 97 00 00 41' }).getAttribute('href')).toBe('tel:+22997000041')
    expect(screen.getByText('Bientôt')).toBeTruthy()
    expect(screen.getByText(/Ils concerneront les traitements de votre carte : Insuline/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(FICTIF)
  })

  it('contact modifié mais pas encore signé : le dit clairement', () => {
    poserCarte({ ec: { n: 'Awa Dossou', tel: '+229 97 00 00 41' } })
    localStorage.setItem('lafia:c0-profil', JSON.stringify({ ...PROFIL_VIDE, ecNom: 'Yao', ecTel: '+229 96 11 22 33' }))
    render(<AidantView />)
    expect(screen.getByText(/Contact modifié \(Yao · \+229 96 11 22 33\) mais pas encore sur la carte/)).toBeTruthy()
  })

  it('sans carte : aucun aidant inventé', () => {
    render(<AidantView />)
    expect(screen.getByText('Votre carte n’a pas encore été créée.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(FICTIF)
  })
})
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RappelInvalide, annulerPrise, dosesDuJour, jourCle, marquerPrise, nettoyer, nomAffiche, nouveauRappel, suiviSemaine, texteRappels,
  type Prises, type Rappel,
} from '../src/patient/rappels'
import { RappelsView } from '../src/patient/Rappels'
import { payload, signed } from './helpers'

const a = (iso: string) => new Date(iso)          // heure LOCALE du téléphone
const avk = (cree = '2026-10-20'): Rappel => ({ id: 'r1', nom: 'Anticoagulant AVK', code: 'AVK', couleur: 'blanc', heures: ['08:00', '20:00'], cree })

describe('Rappels : logique', () => {
  it('un rappel valide ; messages clairs sinon', () => {
    const r = nouveauRappel({ nom: '  Fer   ', couleur: 'rouge', heures: ['20:00', '08:00', '08:00'] }, [], a('2026-10-28T10:00'), 'x')
    expect(r).toEqual({ id: 'x', nom: 'Fer', couleur: 'rouge', heures: ['08:00', '20:00'], cree: '2026-10-28' })
    const err = (s: Parameters<typeof nouveauRappel>[0], ex: Rappel[] = []) => { try { nouveauRappel(s, ex); return '' } catch (e) { expect(e).toBeInstanceOf(RappelInvalide); return (e as Error).message } }
    expect(err({ nom: '', couleur: 'blanc', heures: ['08:00'] })).toMatch(/Choisissez le médicament/)
    expect(err({ nom: 'Fer', couleur: 'blanc', heures: [] })).toMatch(/au moins une heure/)
    expect(err({ nom: 'Fer', couleur: 'blanc', heures: ['25:00'] })).toMatch(/Heure invalide/)
    expect(err({ nom: 'fer', couleur: 'blanc', heures: ['08:00'] }, [r])).toMatch(/déjà un rappel/)
  })

  it('état des doses dans la journée : à venir, maintenant (30 min avant à 3 h après), oubliée, prise', () => {
    const r = avk()
    const etat = (iso: string, prises: Prises = {}) => dosesDuJour([r], prises, a(iso)).map(d => `${d.heure}:${d.etat}`)
    expect(etat('2026-10-28T07:00')).toEqual(['08:00:a_venir', '20:00:a_venir'])
    expect(etat('2026-10-28T07:35')).toEqual(['08:00:maintenant', '20:00:a_venir'])
    expect(etat('2026-10-28T10:59')).toEqual(['08:00:maintenant', '20:00:a_venir'])
    expect(etat('2026-10-28T11:01')).toEqual(['08:00:oubliee', '20:00:a_venir'])
    const p = marquerPrise({}, 'r1@08:00', a('2026-10-28T08:12'))
    expect(etat('2026-10-28T12:00', p)).toEqual(['08:00:pris', '20:00:a_venir'])
    expect(etat('2026-10-29T08:00', p)).toEqual(['08:00:maintenant', '20:00:a_venir'])      // le lendemain, tout recommence
    expect(etat('2026-10-28T12:00', annulerPrise(p, 'r1@08:00', a('2026-10-28T12:00')))[0]).toBe('08:00:oubliee')
  })

  it('le jour est celui du téléphone (heure locale), et on ne garde que 30 jours', () => {
    expect(jourCle(a('2026-10-28T23:30'))).toBe('2026-10-28')
    const vieux = { '2026-09-01': { x: 1 }, '2026-10-27': { y: 2 } }
    expect(Object.keys(nettoyer(vieux, a('2026-10-28T10:00')))).toEqual(['2026-10-27'])
  })

  it('suivi des 7 jours : les jours avant la création ne comptent pas, les prises à venir non plus', () => {
    const r = avk('2026-10-26')
    let p: Prises = {}
    p = marquerPrise(p, 'r1@08:00', a('2026-10-26T08:05'))
    p = marquerPrise(p, 'r1@20:00', a('2026-10-26T20:05'))
    p = marquerPrise(p, 'r1@08:00', a('2026-10-27T08:05'))
    const s = suiviSemaine([r], p, a('2026-10-28T09:00'))
    expect(s.map(j => [j.jour.slice(5), j.prises, j.prevues])).toEqual([
      ['10-22', 0, 0], ['10-23', 0, 0], ['10-24', 0, 0], ['10-25', 0, 0],
      ['10-26', 2, 2], ['10-27', 1, 2], ['10-28', 0, 1],              // aujourd'hui : seule la prise de 8 h est due
    ])
  })

  it('mode discret : la couleur, jamais le nom ; voix : ce qui reste à prendre', () => {
    const r = avk()
    expect(nomAffiche(r, true)).toBe('Médicament blanc')
    const doses = dosesDuJour([r], marquerPrise({}, 'r1@08:00', a('2026-10-28T08:10')), a('2026-10-28T19:45'))
    const dit = texteRappels(doses, false).join(' ')
    expect(dit).toMatch(/il reste 1 prise\./)
    expect(dit).toMatch(/À 8 heures : Anticoagulant A V K, blanc\. C’est pris\./)
    expect(dit).toMatch(/À 20 heures : .*À prendre maintenant\./)
    expect(texteRappels(doses, true).join(' ')).not.toMatch(/Anticoagulant|A V K/)
  })
})

describe('Rappels : écran', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(a('2026-10-28T07:50')) })
  afterEach(() => vi.useRealTimers())

  it('ajouter un traitement de la carte, le cocher, et le retrouver après rechargement', () => {
    localStorage.setItem('lafia:c0-carte', JSON.stringify(signed(payload({ iat: Math.floor(Date.now() / 1000) - 60, pr: { tx: [{ c: 'AVK' }] } }))))
    const { unmount } = render(<RappelsView />)
    expect(screen.getByText(/Aucun rappel pour l’instant/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un médicament/ }))
    fireEvent.click(screen.getByRole('button', { name: /Anticoagulant AVK/ }))           // proposé depuis la carte
    fireEvent.click(screen.getByRole('button', { name: 'Couleur bleu' }))
    fireEvent.click(screen.getByRole('button', { name: /Matin · 8 h$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le rappel' }))
    const ligne = screen.getByText(/À prendre maintenant/).closest('li')!
    fireEvent.click(within(ligne).getByRole('button', { name: /Je l’ai pris/ }))
    expect(screen.getByText(/Pris à 07:50/)).toBeTruthy()
    unmount()
    render(<RappelsView />)                                                                   // gardé sur le téléphone
    expect(screen.getByText(/Pris à 07:50/)).toBeTruthy()
    expect(screen.getByText('1 prise sur 1.')).toBeTruthy()
  })

  it('erreur claire si on enregistre sans heure', () => {
    render(<RappelsView />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un médicament/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Autre médicament' }))
    fireEvent.change(screen.getByPlaceholderText(/Nom, ou ce qui vous aide/), { target: { value: 'Fer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le rappel' }))
    expect(screen.getByRole('alert').textContent).toMatch(/au moins une heure/)
  })
})
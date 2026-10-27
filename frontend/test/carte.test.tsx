import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { verify } from '../src/core'
import {
  CONSULTATION_VIDE, PROFIL_VIDE, SaisieError, construireCarte, construireConsultation, construireProfil,
  falsifier, signerCarte, texteQr, type ProfilSaisi,
} from '../src/patient/carte'
import { BadgeProvider } from '../src/ui/BadgeContext'
import App from '../src/App'
import { ETAB, NOW, REGISTRY, intrus, medecin } from './helpers'

const badge = { ...medecin, etab: ETAB }
const profil = (patch: Partial<ProfilSaisi>): ProfilSaisi => ({ ...PROFIL_VIDE, ...patch })

describe('Profil d’urgence → C0', () => {
  it('non renseigné = absent ; aucun connu = liste vide', () => {
    expect(construireProfil(PROFIL_VIDE)).toEqual({})
    expect(construireProfil(profil({ al: { etat: 'aucun', codes: ['PEN'] } }))).toEqual({ al: [] })
  })
  it('renseigné sans élément coché → refus explicite', () => {
    expect(() => construireProfil(profil({ al: { etat: 'connu', codes: [] } }))).toThrow(SaisieError)
  })
  it('traitements → objets { c } ; groupe et contact', () => {
    expect(construireProfil(profil({ tx: { etat: 'connu', codes: ['ARTE'] }, gs: 'O+', ecNom: 'Kossi', ecTel: '+229 97 00 00 41' })))
      .toEqual({ tx: [{ c: 'ARTE' }], gs: 'O+', ec: { n: 'Kossi', tel: '+229 97 00 00 41' } })
  })
  it('contact incomplet → refus', () => {
    expect(() => construireProfil(profil({ ecNom: 'Kossi' }))).toThrow(SaisieError)
  })
  it('catégorie sensible : refus sans accord, pr.vs avec accord', () => {
    const p = profil({ ah: { etat: 'connu', codes: ['HTA', 'DREPANO'] } })
    expect(() => construireProfil(p)).toThrow(SaisieError)
    expect(construireProfil({ ...p, accordSensible: true })).toEqual({ ah: ['HTA', 'DREPANO'], vs: ['DREPANO'] })
  })
})

describe('Consultation → C0', () => {
  it('convertit les unités, date le poids, prend établissement et auteur du badge', () => {
    const c = construireConsultation({ ...CONSULTATION_VIDE, motif: 'FIEV', temp: '38,5', poids: '62', tdr: 'POS', meds: ['ARTE'], orientation: 'EVAC' }, badge, NOW)
    expect(c).toEqual({
      t: NOW, f: ETAB, a: medecin.kid, m: 'FIEV',
      c: { temp: 385, poids: 620, pt: NOW }, x: [{ k: 'TDR', v: 'POS' }], adm: [{ c: 'ARTE', h: NOW }], o: { k: 'EVAC' },
    })
  })
  it('refuse sans motif, hors bornes, ou sans établissement', () => {
    expect(() => construireConsultation({ ...CONSULTATION_VIDE, temp: '38' }, badge, NOW)).toThrow(SaisieError)
    expect(() => construireConsultation({ ...CONSULTATION_VIDE, motif: 'FIEV', temp: '3.8' }, badge, NOW)).toThrow(SaisieError)
    expect(() => construireConsultation({ ...CONSULTATION_VIDE, motif: 'FIEV' }, { kid: medecin.kid }, NOW)).toThrow(SaisieError)
  })
  it('la carte garde les 3 consultations les plus récentes', () => {
    const co = [1, 2, 3, 4].map(k => construireConsultation({ ...CONSULTATION_VIDE, motif: 'CONS' }, badge, NOW - 1000 * (5 - k)))
    expect(construireCarte('p-0123456789abcdef', {}, co, NOW).co?.map(c => c.t)).toEqual([NOW - 3000, NOW - 2000, NOW - 1000])
  })
})

describe('Carte signée de bout en bout', () => {
  const payload = construireCarte('p-0123456789abcdef', construireProfil(profil({ al: { etat: 'connu', codes: ['PEN'] }, gs: 'O+' })),
    [construireConsultation({ ...CONSULTATION_VIDE, motif: 'FIEV', temp: '39' }, badge, NOW)], NOW)

  it('signée par un badge du registre → acceptée, rôle lu dans le registre', () => {
    const v = verify(signerCarte(payload, medecin), REGISTRY, NOW)
    expect(v).toMatchObject({ ok: true, role: 'medecin', etab: ETAB })
  })
  it('signée par un badge hors registre → refusée', () => {
    expect(verify(signerCarte({ ...payload, co: [] }, intrus), REGISTRY, NOW)).toMatchObject({ ok: false, code: 'UNKNOWN_SIGNER' })
  })
  it('falsifiée → refusée', () => {
    expect(verify(falsifier(signerCarte(payload, medecin)), REGISTRY, NOW).ok).toBe(false)
  })
  it('QR : lien #L2B: avec adresse publique, texte L2: seul sinon', () => {
    const carte = signerCarte(payload, medecin)
    const avecLien = texteQr(carte, 'https://lafia.example/')
    expect(avecLien.lien).toBe(true)
    expect(avecLien.qr.startsWith('https://lafia.example/#L2B:')).toBe(true)
    expect(verify(avecLien.qr, REGISTRY, NOW).ok).toBe(true)
    const local = texteQr(carte, 'http://localhost:5173/')
    expect(local).toMatchObject({ qr: carte, lien: false })
    expect(local.avertissement).not.toBe('')
  })
})

describe('Routeur', () => {
  const carte = signerCarte(construireCarte('p-0123456789abcdef', { al: ['PEN'] }, [], Math.floor(Date.now() / 1000)), medecin)

  it('un lien #L2B: ouvert depuis l’appareil photo demande « Qui lit ? » puis affiche la carte vérifiée', async () => {
    window.location.hash = texteQr(carte, 'https://lafia.example/').qr.split('#')[1]
    render(<BadgeProvider><App /></BadgeProvider>)
    expect(screen.getByText('Qui lit cette carte ?')).toBeTruthy()
    expect(screen.queryByText(/Pénicilline/)).toBeNull()          // rien d'affiché avant le choix
    fireEvent.click(screen.getByRole('button', { name: 'Urgence vitale' }))
    await screen.findByText(/Signature valide/)
    expect(screen.getByText(/Pénicilline/)).toBeTruthy()
  })
  it('#/lire ouvre le lecteur d’urgence sans espace patient (soignant, passant)', () => {
    localStorage.clear()
    window.location.hash = '/lire'
    render(<BadgeProvider><App /></BadgeProvider>)
    expect(screen.getByText('Qui lit cette carte ?')).toBeTruthy()
    expect(screen.queryByText('Votre espace')).toBeNull()
  })
  it('un ancien lien #L1: est refusé sans afficher de données', () => {
    window.location.hash = 'L1:z.abc'
    render(<BadgeProvider><App /></BadgeProvider>)
    expect(screen.getByRole('alert').textContent).toMatch(/ancien format/)
  })
})

describe('Informations d’urgence complétées', () => {
  it('année de naissance et sexe entrent dans le C0 ; vides = absents', () => {
    expect(construireProfil(profil({ yb: '1988', sx: 'F' }))).toEqual({ yb: 1988, sx: 'F' })
    expect(construireProfil(profil({ yb: '', sx: '' }))).toEqual({})
    expect(() => construireProfil(profil({ yb: '88' }))).toThrow(SaisieError)
    expect(() => construireProfil(profil({ yb: '2999' }))).toThrow(SaisieError)
  })

  it('écran du médecin : âge, sexe, groupe en tête, traitements à risque et dispositif signalés', async () => {
    const now = Math.floor(Date.now() / 1000)
    const pr = construireProfil(profil({
      yb: '1951', sx: 'F', gs: 'O+',
      al: { etat: 'connu', codes: ['PEN'] }, tx: { etat: 'connu', codes: ['AVK', 'INSUL'] }, ah: { etat: 'connu', codes: ['HTA', 'PACEM'] },
      ecNom: 'Kossi', ecTel: '+229 97 00 00 41',
    }))
    const { UrgenceView } = await import('../src/ui/UrgenceView')
    const v = verify(signerCarte(construireCarte('p-0123456789abcdef', pr, [], now), medecin), REGISTRY, now)
    if (!v.ok) throw new Error(v.reason)
    render(<UrgenceView card={v} facilities={{}} now={now} />)
    expect(screen.getByText(`${new Date().getFullYear() - 1951} ans`)).toBeTruthy()
    expect(screen.getByText('Femme')).toBeTruthy()
    expect(screen.getByText('O+')).toBeTruthy()
    const attention = screen.getByLabelText('Points d\'attention').textContent ?? ''
    expect(attention).toMatch(/Anticoagulant AVK.*risque hémorragique/)
    expect(attention).toMatch(/Insuline.*hypoglycémie/)
    expect(attention).toMatch(/Stimulateur cardiaque/)
    expect(screen.getByRole('link', { name: '+229 97 00 00 41' }).getAttribute('href')).toBe('tel:+22997000041')
  })

  it('identité non renseignée : affichée comme telle, jamais devinée', async () => {
    const now = Math.floor(Date.now() / 1000)
    const { UrgenceView } = await import('../src/ui/UrgenceView')
    const v = verify(signerCarte(construireCarte('p-0123456789abcdef', {}, [], now), medecin), REGISTRY, now)
    if (!v.ok) throw new Error(v.reason)
    render(<UrgenceView card={v} facilities={{}} now={now} />)
    expect(screen.getAllByText('non renseigné').length).toBe(3)
    expect(screen.queryByLabelText('Points d\'attention')).toBeNull()
  })
})
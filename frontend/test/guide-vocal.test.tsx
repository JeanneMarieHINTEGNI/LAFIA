import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verify, type Verified } from '../src/core'
import { GuideVocal } from '../src/patient/GuideVocal'
import { BAS_ECRAN, GUIDE_BIENVENUE, accueilVocal, guideOnglet, type Contexte } from '../src/patient/guides'
import { FACILITIES } from '../src/ui/trust'
import { REGISTRY, payload, signed } from './helpers'

type Ok = Extract<Verified, { ok: true }>
const maintenant = Math.floor(Date.now() / 1000)
const texteCarte = () => signed(payload({ iat: maintenant - 60, pr: { al: ['PEN'], ec: { n: 'Kossi', tel: '+229 01 97 00 00 41' } } }))
const carte = (): Ok => { const v = verify(texteCarte(), REGISTRY); if (!v.ok) throw new Error(v.reason); return v }
const ctx = (p: Partial<Contexte> = {}): Contexte => ({ prenom: 'Awa', carte: null, etablissements: FACILITIES, rappels: [], prises: {}, ...p })

describe('Aide vocale : textes', () => {
  it('accueil : bonjour, puis les cinq boutons du bas dans l’ordre de l’écran', () => {
    expect(accueilVocal('Awa')[0]).toBe('Bonjour Awa.')
    expect(accueilVocal('')[0]).toBe('Bonjour.')
    expect(BAS_ECRAN).toMatch(/mon journal, ma carte, urgence, compartiments, et rappels/)
  })

  it('chaque onglet dit où l’on est et quoi faire ; « Ma carte » lit directement la carte', () => {
    for (const id of ['journal', 'carte', 'lecture', 'compartiments', 'aidant']) expect(guideOnglet(id, ctx()).length).toBeGreaterThan(1)
    const dit = guideOnglet('carte', ctx({ carte: carte() })).join(' ')
    expect(dit).toMatch(/^Ma carte\./)
    expect(dit).toMatch(/Allergies : Pénicilline/)
    expect(dit).not.toMatch(/Voici ce que montre/)                // pas de double introduction
    expect(guideOnglet('carte', ctx()).join(' ')).toMatch(/pas encore faite/)
  })

  it('« Urgence » explique que c’est pour la carte d’une AUTRE personne', () => {
    expect(guideOnglet('lecture', ctx()).join(' ')).toMatch(/AUTRE personne/)
  })

  it('« Rappels » lit les prises du jour et la personne à prévenir', () => {
    const r = { id: 'r1', nom: 'Fer', couleur: 'rouge' as const, heures: ['08:00'], cree: '2026-01-01' }
    const dit = guideOnglet('aidant', ctx({ carte: carte(), rappels: [r], maintenant: new Date('2026-10-28T08:05') })).join(' ')
    expect(dit).toMatch(/À 8 heures : Fer, rouge\. À prendre maintenant\./)
    expect(dit).toMatch(/bouton vert « Je l’ai pris »/)
    expect(dit).toMatch(/personne à prévenir en cas d’urgence : Kossi/)
  })

  it('bienvenue : les boutons sont nommés par leur couleur', () => {
    expect(GUIDE_BIENVENUE.join(' ')).toMatch(/bouton orange « Créer mon espace »/)
  })
})

/* ---------- avec une synthèse vocale simulée ---------- */

class FausseUtterance { text: string; lang = ''; voice: unknown = null; rate = 1; onend?: () => void; onerror?: () => void; constructor(t: string) { this.text = t } }
let dites: string[] = []
beforeEach(() => {
  localStorage.clear(); dites = []
  vi.stubGlobal('SpeechSynthesisUtterance', FausseUtterance)
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: (u: FausseUtterance) => dites.push(u.text), cancel: vi.fn(), getVoices: () => [] } })
})
afterEach(() => { vi.unstubAllGlobals(); delete (window as { speechSynthesis?: unknown }).speechSynthesis })

describe('Aide vocale : comportement', () => {
  it('muette tant qu’on ne l’active pas ; activée, elle salue puis dit l’écran ; le réglage reste sur le téléphone', () => {
    localStorage.setItem('lafia:c0-carte', JSON.stringify(texteCarte()))
    const { rerender, unmount } = render(<GuideVocal onglet="journal" prenom="Awa" />)
    rerender(<GuideVocal onglet="carte" prenom="Awa" />)
    expect(dites).toEqual([])                                     // pas activée : rien n'est dit
    fireEvent.click(screen.getByRole('button', { name: /Activer l’aide vocale/ }))
    expect(dites[0]).toBe('Bonjour Awa.')
    expect(dites).toContain('Ma carte.')
    expect(localStorage.getItem('lafia:aide-vocale')).toBe('true')
    dites = []
    rerender(<GuideVocal onglet="lecture" prenom="Awa" />)        // changement d'onglet : le nouvel écran est dit
    expect(dites[0]).toBe('Urgence.')
    dites = []
    fireEvent.click(screen.getByRole('button', { name: /Répéter/ }))
    expect(dites[0]).toBe('Urgence.')
    unmount()
    dites = []
    render(<GuideVocal onglet="journal" prenom="Awa" />)
    expect(screen.getByRole('button', { name: /Aide vocale activée/ }).getAttribute('aria-pressed')).toBe('true')
    expect(dites).toEqual([])                                     // pas de parole au simple affichage (aucun toucher)
  })

  it('désactivée d’un toucher : la voix se tait et ne reprend plus aux changements d’onglet', () => {
    localStorage.setItem('lafia:aide-vocale', 'true')
    const { rerender } = render(<GuideVocal onglet="journal" prenom="Awa" />)
    fireEvent.click(screen.getByRole('button', { name: /Aide vocale activée/ }))
    dites = []
    rerender(<GuideVocal onglet="aidant" prenom="Awa" />)
    expect(dites).toEqual([])
  })
})
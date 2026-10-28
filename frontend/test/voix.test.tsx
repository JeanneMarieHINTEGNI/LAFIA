import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { verify, type Profile, type Verified } from '../src/core'
import { Ecouter } from '../src/ui/Ecouter'
import { FACILITIES } from '../src/ui/trust'
import { dire, groupeDit, pourLaVoix, telephoneDit, texteCarte, texteJournal, voixFrancaise } from '../src/ui/voix'
import { REGISTRY, payload, signed } from './helpers'

type Ok = Extract<Verified, { ok: true }>
const maintenant = Math.floor(Date.now() / 1000)
const ok = (pr: Profile): Ok => {
  const v = verify(signed(payload({ iat: maintenant - 60, pr })), REGISTRY)
  if (!v.ok) throw new Error(v.reason)
  return v
}

describe('Texte dit à voix haute', () => {
  it('se lit bien : parenthèses retirées, sigles épelés, groupe et téléphone dits en clair', () => {
    expect(pourLaVoix('Anticoagulant AVK (acénocoumarol…)')).toBe('Anticoagulant A V K')
    expect(pourLaVoix('Infirmier(ère)')).toBe('Infirmier')
    expect(groupeDit('O+')).toBe('O positif')
    expect(groupeDit('AB-')).toBe('A B négatif')
    expect(telephoneDit('+229 01 97 00 00 41')).toBe('plus, 2 2 9, 0 1, 9 7, 0 0, 0 0, 4 1')
  })

  it('carte : ordre de l’urgence, allergies puis attention puis groupe puis personne à prévenir', () => {
    const t = texteCarte(ok({ al: ['PEN'], tx: [{ c: 'AVK' }], ah: ['HTA'], gs: 'O+', ec: { n: 'Kossi', tel: '+229 01 97 00 00 41' }, yb: 1979, sx: 'F' }), FACILITIES)
    const tout = t.join(' ')
    const pos = (s: string) => tout.indexOf(s)
    expect(pos('Allergies : Pénicilline')).toBeGreaterThan(-1)
    expect(pos('Attention : Anticoagulant A V K, risque hémorragique')).toBeGreaterThan(pos('Allergies'))
    expect(pos('Groupe sanguin : O positif')).toBeGreaterThan(pos('Attention'))
    expect(pos('Personne à prévenir : Kossi')).toBeGreaterThan(pos('Groupe sanguin'))
    expect(tout).toMatch(/Maladies de fond : Hypertension/)
    expect(tout).toMatch(/femme/)
    expect(tout).toMatch(/Carte signée par un médecin/)
    expect(tout).not.toMatch(/[()…]/)                           // rien qui se lise mal
  })

  it('carte : trois états des allergies, comme à l’écran ; jamais « aucune » quand ce n’est pas renseigné', () => {
    expect(texteCarte(ok({}), FACILITIES).join(' ')).toMatch(/Allergies : non renseignées\. Ne pas supposer/)
    expect(texteCarte(ok({ al: [] }), FACILITIES).join(' ')).toMatch(/aucune allergie connue/)
    expect(texteCarte(ok({}), FACILITIES, { pourLePatient: true })[0]).toMatch(/votre carte/)
  })

  it('journal : qui, où, quand ; une lecture sans badge est dite non vérifiée, une ligne falsifiée est signalée', () => {
    const t = texteJournal([
      { t: maintenant, qui: 'sans_badge', motif: 'INCONSCIENT', action: 'LECTURE', lieu: 'Centre hospitalier de référence (démo)' },
      { t: maintenant - 3600, qui: 'badge', role: 'infirmier', action: 'ECRITURE' },
      { t: maintenant - 7200, qui: 'invalide', action: 'LECTURE' },
    ]).join(' ')
    expect(t).toMatch(/3 fois/)
    expect(t).toMatch(/à Centre hospitalier de référence : une personne sans badge a lu votre carte\. Raison donnée : patient inconscient\. Ce n’est pas vérifié\./)
    expect(t).toMatch(/un infirmier ou une infirmière a signé une nouvelle carte/)
    expect(t).toMatch(/une ligne falsifiée/)
    expect(texteJournal([])).toEqual(['Personne n’a encore lu votre carte.'])
  })
})

/* ---------- synthèse vocale simulée ---------- */

class FausseUtterance { text: string; lang = ''; voice: unknown = null; rate = 1; onend?: () => void; onerror?: () => void; constructor(t: string) { this.text = t } }
const voix = (lang: string, localService: boolean, name = lang) => ({ lang, localService, name }) as SpeechSynthesisVoice

function fausseSynthese(liste: SpeechSynthesisVoice[] = [voix('en-US', true), voix('fr-FR', false, 'réseau'), voix('fr-FR', true, 'locale')]) {
  const dites: FausseUtterance[] = []
  const s = { speak: vi.fn((u: FausseUtterance) => dites.push(u)), cancel: vi.fn(), getVoices: () => liste }
  vi.stubGlobal('SpeechSynthesisUtterance', FausseUtterance)
  Object.defineProperty(window, 'speechSynthesis', { value: s, configurable: true })
  return { s, dites }
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as { speechSynthesis?: unknown }).speechSynthesis
})

describe('Synthèse vocale', () => {
  it('préfère une voix française installée sur le téléphone (marche sans réseau)', () => {
    expect(voixFrancaise([voix('en-US', true), voix('fr-FR', false, 'réseau'), voix('fr-CA', true, 'qc')])?.name).toBe('qc')
    expect(voixFrancaise([voix('fr-FR', false, 'réseau'), voix('fr-FR', true, 'locale')])?.name).toBe('locale')
    expect(voixFrancaise([voix('en-US', true)])).toBeNull()
  })

  it('dit les phrases une par une, en français, et prévient à la fin', () => {
    const { s, dites } = fausseSynthese()
    const fin = vi.fn()
    expect(dire(["Un.", "Deux."], fin, s as unknown as SpeechSynthesis)).toBe(true)
    expect(s.cancel).toHaveBeenCalled()                      // ce qui était en cours est coupé
    expect(dites.map(u => u.text)).toEqual(['Un.', 'Deux.'])
    expect(dites.every(u => u.lang === 'fr-FR' && (u.voice as SpeechSynthesisVoice).name === 'locale')).toBe(true)
    dites[1].onend?.()
    expect(fin).toHaveBeenCalledOnce()
    expect(dire(['x'], undefined, null)).toBe(false)         // téléphone sans synthèse vocale
  })

  it('bouton : un toucher pour écouter, le même pour arrêter', () => {
    const { s, dites } = fausseSynthese()
    render(<Ecouter phrases={['Allergies : Pénicilline.']} libelle="Écouter la carte" />)
    fireEvent.click(screen.getByRole('button', { name: /Écouter la carte/ }))
    expect(dites[0].text).toBe('Allergies : Pénicilline.')
    const bouton = screen.getByRole('button', { name: /Arrêter/ })
    expect(bouton.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(bouton)
    expect(s.cancel).toHaveBeenCalledTimes(2)                // au départ, puis à l'arrêt
    expect(screen.getByRole('button', { name: /Écouter la carte/ })).toBeTruthy()
  })

  it('sans synthèse vocale, le bouton est remplacé par une phrase claire', () => {
    render(<Ecouter phrases={['x']} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/pas disponible sur ce téléphone/)).toBeTruthy()
  })
})
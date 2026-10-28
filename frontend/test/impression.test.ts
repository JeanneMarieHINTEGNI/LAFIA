import { describe, expect, it } from 'vitest'
import { verify, type Profile, type Verified } from '../src/core'
import { carteImprimableHtml, lignesResume, resumeHtml } from '../src/patient/impressionCarte'
import { FACILITIES } from '../src/ui/trust'
import { REGISTRY, payload, signed } from './helpers'

type Ok = Extract<Verified, { ok: true }>
const maintenant = () => Math.floor(Date.now() / 1000)
const ok = (pr: Profile): Ok => {
  const v = verify(signed(payload({ iat: maintenant() - 60, pr })), REGISTRY)
  if (!v.ok) throw new Error(v.reason)
  return v
}

describe('Carte imprimable', () => {
  const carte = ok({ al: ['PEN'], tx: [{ c: 'AVK' }], ah: [], gs: 'O+', ec: { n: 'Kossi', tel: '+229 97 00 00 41' } })

  it('recto : QR, consigne, nom ; verso : résumé, signataire, « le QR fait foi »', () => {
    const html = carteImprimableHtml({ qr: 'L2:ABC', carte, etablissements: FACILITIES, nom: 'Awa Dossou', avecResume: true })
    expect(html).toContain('<svg')
    expect(html).toContain('Awa Dossou')
    expect(html).toContain('Scannez ce code')
    expect(html).toContain('Pénicilline')
    expect(html).toMatch(/Anticoagulant AVK.*risque hémorragique/)
    expect(html).toContain('Kossi · +229 97 00 00 41')
    expect(html).toContain('le QR fait foi')
    expect(html).toContain('width: 85.6mm')                  // format carte bancaire
  })

  it('sans nom et sans résumé si le patient le choisit', () => {
    const html = carteImprimableHtml({ qr: 'L2:ABC', carte, etablissements: FACILITIES, nom: '', avecResume: false })
    expect(html).not.toContain('class="nom"')
    expect(html).not.toContain('Pénicilline')
    expect(html).toContain('Toutes les informations sont dans le QR')
  })

  it('un nom piégé est neutralisé (pas d’injection dans la page d’impression)', () => {
    const html = carteImprimableHtml({ qr: 'L2:ABC', carte, etablissements: FACILITIES, nom: '<img src=x onerror=alert(1)>', avecResume: true })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('allergies : trois états distincts, comme à l’écran', () => {
    expect(lignesResume(ok({}))[0].texte).toMatch(/non renseigné/)
    expect(lignesResume(ok({ al: [] }))[0].texte).toBe('aucune connue')
  })

  it('verso trop chargé : petite police, puis « liste incomplète » plutôt qu’un texte coupé en silence', () => {
    const lourde = ok({
      al: ['PEN', 'SULFA', 'ARACH', 'LATEX', 'ASPIR', 'IODE'],
      tx: ['AVK', 'INSUL', 'ANTIEP', 'CORTIC', 'AOD', 'AAP'].map(c => ({ c })),
      ah: ['PACEM', 'VALVE', 'INSREN', 'GROSSESSE'], vs: ['GROSSESSE'], gs: 'AB-',
      ec: { n: 'X'.repeat(30), tel: '+229 01 23 45 67 89' },
    })
    const html = resumeHtml(lignesResume(lourde))
    expect(html).toContain('dense')
    expect(html).toContain('Liste incomplète')
    expect(html).toContain('+229 01 23 45 67 89')            // la personne à prévenir n'est jamais sacrifiée
    expect(resumeHtml(lignesResume(carte))).not.toContain('Liste incomplète')
  })
})
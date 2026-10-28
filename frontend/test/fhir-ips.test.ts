import { describe, expect, it } from 'vitest'
import { verify, type Consultation, type Profile, type Verified } from '../src/core'
import { carteVersIps, narratif, nomFichierIps } from '../src/patient/fhirIps'
import { FACILITIES } from '../src/ui/trust'
import { REGISTRY, payload, signed } from './helpers'

type Ok = Extract<Verified, { ok: true }>
type R = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const maintenant = Math.floor(Date.now() / 1000)
const ok = (pr: Profile, co: Consultation[] = []): Ok => {
  const v = verify(signed(payload({ iat: maintenant - 60, pr, co })), REGISTRY)
  if (!v.ok) throw new Error(v.reason)
  return v
}
let n = 0
const ips = (c: Ok, nom = '') => carteVersIps(c, { etablissements: FACILITIES, nom, maintenant, uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }) as R
const ressources = (b: R, type: string): R[] => b.entry.map((e: R) => e.resource).filter((r: R) => r.resourceType === type)
const section = (b: R, loinc: string): R => b.entry[0].resource.section.find((s: R) => s.code.coding[0].code === loinc)

describe('Export FHIR IPS', () => {
  const carte = ok(
    { al: ['PEN'], tx: [{ c: 'AVK' }], ah: ['HTA'], gs: 'O+', yb: 1979, sx: 'F', ec: { n: 'Kossi', tel: '+229 01 97 00 00 41' } },
    [{ t: maintenant - 3600, f: Object.keys(FACILITIES)[0], a: '0123456789abcdef', m: 'CTRL', c: { temp: 372, poids: 680, pt: maintenant - 3600 }, x: [{ k: 'TDR', v: 'POS' }] }],
  )

  it('un document IPS : Bundle « document », Composition en premier, références toutes résolues', () => {
    const b = ips(carte)
    expect(b.resourceType).toBe('Bundle')
    expect(b.type).toBe('document')
    const comp = b.entry[0].resource
    expect(comp.resourceType).toBe('Composition')
    expect(comp.type.coding[0]).toMatchObject({ system: 'http://loinc.org', code: '60591-5' })
    const urls = new Set(b.entry.map((e: R) => e.fullUrl))
    const refs = JSON.stringify(b).match(/"reference":"([^"]+)"/g)!.map(r => r.slice(13, -1))
    expect(refs.length).toBeGreaterThan(5)
    expect(refs.every(r => urls.has(r))).toBe(true)              // rien ne pointe dans le vide
    expect(urls.size).toBe(b.entry.length)                       // identifiants uniques
  })

  it('les trois sections obligatoires, et le contenu de la carte, rien de plus', () => {
    const b = ips(carte)
    for (const code of ['48765-2', '10160-0', '11450-4']) expect(section(b, code)).toBeTruthy()
    expect(ressources(b, 'AllergyIntolerance')[0].code.text).toBe('Pénicilline')
    expect(ressources(b, 'MedicationStatement')[0].medicationCodeableConcept.text).toMatch(/Anticoagulant AVK/)
    expect(section(b, '10160-0').text.div).toMatch(/attention : risque hémorragique/)
    expect(ressources(b, 'Condition')[0].code.text).toBe('Hypertension')
    const obs = ressources(b, 'Observation').map(o => o.code.coding[0].code ?? o.code.text)
    expect(obs).toEqual(expect.arrayContaining(['882-1', '8310-5', '29463-7', 'TDR']))
    const temp = ressources(b, 'Observation').find(o => o.code.coding[0].code === '8310-5')!
    expect(temp.valueQuantity).toEqual({ value: 37.2, unit: 'Cel', system: 'http://unitsofmeasure.org', code: 'Cel' })
  })

  it('patient pseudonyme : identifiant LAFIA, année de naissance, contact d’urgence ; le nom seulement si choisi', () => {
    const p = ressources(ips(carte), 'Patient')[0]
    expect(p.identifier[0].value).toBe(carte.payload.id)
    expect(p.birthDate).toBe('1979')
    expect(p.gender).toBe('female')
    expect(p.contact[0].telecom[0].value).toBe('+2290197000041')
    expect(p.contact[0].relationship[0].coding[0].code).toBe('C')
    expect(p.name[0].text).toBeUndefined()
    expect(p.name[0].extension[0].valueCode).toBe('masked')
    expect(ressources(ips(carte, 'Awa Dossou'), 'Patient')[0].name[0].text).toBe('Awa Dossou')
  })

  it('les trois états d’une liste sont gardés : non renseigné ≠ aucun connu', () => {
    const inconnu = ips(ok({}))
    expect(ressources(inconnu, 'AllergyIntolerance')[0].code.coding[0].code).toBe('no-allergy-info')
    expect(ressources(inconnu, 'MedicationStatement')[0].medicationCodeableConcept.coding[0].code).toBe('no-medication-info')
    expect(ressources(inconnu, 'Condition')[0].code.coding[0].code).toBe('no-problem-info')
    const aucun = ips(ok({ al: [], tx: [], ah: [] }))
    expect(ressources(aucun, 'AllergyIntolerance')[0].code.coding[0].code).toBe('no-known-allergies')
    expect(ressources(aucun, 'MedicationStatement')[0].medicationCodeableConcept.coding[0].code).toBe('no-known-medications')
    expect(ressources(aucun, 'Condition')[0].code.coding[0].code).toBe('no-known-problems')
    expect(ressources(aucun, 'AllergyIntolerance')[0].clinicalStatus).toBeUndefined()
  })

  it('auteur = le soignant signataire (badge) et son établissement', () => {
    const b = ips(carte)
    const comp = b.entry[0].resource
    const auteurs = comp.author.map((a: R) => b.entry.find((e: R) => e.fullUrl === a.reference).resource)
    expect(auteurs[0].resourceType).toBe('Practitioner')
    expect(auteurs[0].identifier[0].value).toBe(carte.kid)
    if (carte.etab) expect(auteurs[1].name).toBe(FACILITIES[carte.etab] ?? `Établissement ${carte.etab}`)
  })

  it('narratif échappé : un texte piégé ne devient pas du HTML', () => {
    const div = narratif(['<img src=x onerror=alert(1)>', 'A & B']).div
    expect(div.startsWith('<div xmlns="http://www.w3.org/1999/xhtml">')).toBe(true)
    expect(div).not.toContain('<img')
    expect(div).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(div).toContain('A &amp; B')
  })

  it('nom de fichier sans nom propre', () => {
    expect(nomFichierIps(carte)).toMatch(/^lafia-ips-p-[0-9a-f]+-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
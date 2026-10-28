import type { Consultation, Verified } from '../core'
import { ALERTES, ALLERGENS, ANTECEDENTS, MEDS, MOTIFS, ROLE_LABEL, label } from '../ui/labels'

/**
 * Export de la carte d'urgence au format **FHIR R4 « International Patient Summary » (IPS)**, le résumé patient
 * international que lisent les logiciels hospitaliers. Tout se fait sur le téléphone, à partir de la carte VÉRIFIÉE :
 * rien n'est ajouté, rien n'est envoyé. Le fichier n'est pas signé : c'est le QR signé qui fait foi.
 *
 * Ce que l'export garde de la carte :
 * - les trois états d'une liste (non renseigné / aucun connu / liste) → codes IPS « absent-unknown » ;
 * - le signataire (rôle, badge, établissement) → auteur du document ;
 * - le groupe sanguin, les mesures et le TDR des consultations → observations.
 *
 * Limite assumée : nos codes (PEN, AVK…) sont exportés dans NOTRE système de codes, avec le libellé en clair. Leur
 * correspondance avec SNOMED CT / ATC doit être établie et validée par un spécialiste avant un usage en production.
 */

type Ok = Extract<Verified, { ok: true }>
type Ressource = Record<string, unknown> & { resourceType: string }

/** Adresse de nos systèmes de codes. À remplacer par le domaine définitif du projet. */
export const BASE_FHIR = 'https://lafia-1nkp.vercel.app/fhir'
const LOINC = 'http://loinc.org'
const UCUM = 'http://unitsofmeasure.org'
const ABSENT = 'http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips'
const IPS = 'http://hl7.org/fhir/uv/ips/StructureDefinition'

const loinc = (code: string, display: string) => ({ coding: [{ system: LOINC, code, display }] })
const nous = (systeme: string, code: string, texte: string) => ({ coding: [{ system: `${BASE_FHIR}/CodeSystem/${systeme}`, code, display: texte }], text: texte })
const absent = (code: string, texte: string) => ({ coding: [{ system: ABSENT, code, display: texte }], text: texte })
const iso = (t: number) => new Date(t * 1000).toISOString()
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
export const narratif = (lignes: string[]) => ({
  status: 'generated',
  div: `<div xmlns="http://www.w3.org/1999/xhtml">${lignes.length ? `<ul>${lignes.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p>Aucune donnée.</p>'}</div>`,
})

export type OptionsIps = {
  etablissements: Record<string, string>
  /** Nom du patient, s'il choisit de l'inclure (la carte elle-même n'en contient pas). */
  nom?: string
  maintenant?: number
  /** Générateur d'identifiants (injectable pour les tests). */
  uuid?: () => string
}

export function carteVersIps(carte: Ok, o: OptionsIps): Ressource {
  const uuid = o.uuid ?? (() => crypto.randomUUID())
  const maintenant = o.maintenant ?? Math.floor(Date.now() / 1000)
  const pr = carte.payload.pr ?? {}
  const entrees: { fullUrl: string; resource: Ressource }[] = []
  const ajouter = (r: Ressource) => { const fullUrl = `urn:uuid:${uuid()}`; entrees.push({ fullUrl, resource: r }); return fullUrl }

  /* ---- patient (pseudonyme : l'identifiant LAFIA, pas d'état civil sauf choix du patient) ---- */
  const nom = (o.nom ?? '').trim()
  const patient = ajouter({
    resourceType: 'Patient',
    meta: { profile: [`${IPS}/Patient-uv-ips`] },
    identifier: [{ system: `${BASE_FHIR}/identifiant-patient`, value: carte.payload.id }],
    name: [nom ? { text: nom } : { extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason', valueCode: 'masked' }] }],
    ...(pr.sx ? { gender: pr.sx === 'F' ? 'female' : 'male' } : {}),
    ...(pr.yb ? { birthDate: String(pr.yb) } : { _birthDate: { extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason', valueCode: 'unknown' }] } }),
    ...(pr.ec ? {
      contact: [{
        relationship: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0131', code: 'C', display: 'Emergency Contact' }] }],
        name: { text: pr.ec.n },
        telecom: [{ system: 'phone', value: pr.ec.tel.replace(/\s/g, '') }],
      }],
    } : {}),
  })
  const sujet = { reference: patient }

  /* ---- auteur : le soignant qui a signé, et son établissement ---- */
  const organisation = carte.etab ? ajouter({
    resourceType: 'Organization',
    identifier: [{ system: `${BASE_FHIR}/etablissement`, value: carte.etab }],
    name: o.etablissements[carte.etab] ?? `Établissement ${carte.etab}`,
  }) : undefined
  const soignant = ajouter({
    resourceType: 'Practitioner',
    identifier: [{ system: `${BASE_FHIR}/badge`, value: carte.kid }],
    name: [{ text: carte.label ?? ROLE_LABEL[carte.role] ?? carte.role }],
  })

  /* ---- allergies ---- */
  const allergies: string[] = []
  const lignesAl: string[] = []
  const allergie = (code: Record<string, unknown>, actif: boolean) => ajouter({
    resourceType: 'AllergyIntolerance',
    meta: { profile: [`${IPS}/AllergyIntolerance-uv-ips`] },
    ...(actif ? { clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] } } : {}),
    code, patient: sujet, recordedDate: iso(carte.iat),
  })
  if (pr.al === undefined) { allergies.push(allergie(absent('no-allergy-info', 'Allergies non renseignées'), false)); lignesAl.push('Non renseigné : ne pas supposer l’absence d’allergie') }
  else if (pr.al.length === 0) { allergies.push(allergie(absent('no-known-allergies', 'Aucune allergie connue'), false)); lignesAl.push('Aucune allergie connue') }
  else for (const c of pr.al) { allergies.push(allergie(nous('allergenes', c, label(ALLERGENS, c)), true)); lignesAl.push(label(ALLERGENS, c)) }

  /* ---- traitements ---- */
  const traitements: string[] = []
  const lignesTx: string[] = []
  const traitement = (code: Record<string, unknown>, statut: string, dose?: string) => ajouter({
    resourceType: 'MedicationStatement',
    meta: { profile: [`${IPS}/MedicationStatement-uv-ips`] },
    status: statut, medicationCodeableConcept: code, subject: sujet, effectiveDateTime: iso(carte.iat),
    ...(dose ? { dosage: [{ text: `Dose : table ${dose}` }] } : {}),
  })
  if (pr.tx === undefined) { traitements.push(traitement(absent('no-medication-info', 'Traitements non renseignés'), 'unknown')); lignesTx.push('Non renseigné') }
  else if (pr.tx.length === 0) { traitements.push(traitement(absent('no-known-medications', 'Aucun traitement au long cours'), 'active')); lignesTx.push('Aucun traitement au long cours') }
  else for (const t of pr.tx) {
    traitements.push(traitement(nous('traitements', t.c, label(MEDS, t.c)), 'active', t.d))
    lignesTx.push(`${label(MEDS, t.c)}${ALERTES[t.c] ? ` (attention : ${ALERTES[t.c]})` : ''}`)
  }

  /* ---- maladies de fond ---- */
  const problemes: string[] = []
  const lignesAh: string[] = []
  const probleme = (code: Record<string, unknown>, actif: boolean) => ajouter({
    resourceType: 'Condition',
    meta: { profile: [`${IPS}/Condition-uv-ips`] },
    ...(actif ? { clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] } } : {}),
    code, subject: sujet, recordedDate: iso(carte.iat),
  })
  if (pr.ah === undefined) { problemes.push(probleme(absent('no-problem-info', 'Antécédents non renseignés'), false)); lignesAh.push('Non renseigné') }
  else if (pr.ah.length === 0) { problemes.push(probleme(absent('no-known-problems', 'Aucun antécédent connu'), false)); lignesAh.push('Aucun antécédent connu') }
  else for (const c of pr.ah) {
    problemes.push(probleme(nous('antecedents', c, label(ANTECEDENTS, c)), true))
    lignesAh.push(`${label(ANTECEDENTS, c)}${pr.vs?.includes(c) ? ' (rendu lisible en urgence par choix du patient)' : ''}${ALERTES[c] ? ` (attention : ${ALERTES[c]})` : ''}`)
  }

  /* ---- résultats : groupe sanguin, TDR ---- */
  const resultats: string[] = []
  const lignesRes: string[] = []
  if (pr.gs) {
    resultats.push(ajouter({
      resourceType: 'Observation', status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
      code: loinc('882-1', 'ABO and Rh group [Type] in Blood'), subject: sujet, effectiveDateTime: iso(carte.iat),
      valueCodeableConcept: { text: pr.gs },
      note: [{ text: 'Recopié sur la carte d’urgence : contrôle prétransfusionnel obligatoire.' }],
    }))
    lignesRes.push(`Groupe sanguin : ${pr.gs} (contrôle prétransfusionnel obligatoire)`)
  }

  /* ---- consultations : signes vitaux, TDR ---- */
  const vitaux: string[] = []
  const lignesVit: string[] = []
  const consultations = [...(carte.payload.co ?? [])].sort((a, b) => b.t - a.t)
  for (const co of consultations) mesures(co)
  function mesures(co: Consultation) {
    const lieu = co.f ? o.etablissements[co.f] ?? co.f : ''
    const vital = (code: string, display: string, valeur: number, unite: string, t: number) => ajouter({
      resourceType: 'Observation', status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
      code: loinc(code, display), subject: sujet, effectiveDateTime: iso(t),
      valueQuantity: { value: valeur, unit: unite, system: UCUM, code: unite },
    })
    if (co.c?.temp !== undefined) { vitaux.push(vital('8310-5', 'Body temperature', co.c.temp / 10, 'Cel', co.t)); lignesVit.push(`${jour(co.t)} : température ${(co.c.temp / 10).toFixed(1)} °C${lieu ? ` (${lieu})` : ''}`) }
    if (co.c?.poids !== undefined) { const t = co.c.pt ?? co.t; vitaux.push(vital('29463-7', 'Body weight', co.c.poids / 10, 'kg', t)); lignesVit.push(`${jour(t)} : poids ${(co.c.poids / 10).toFixed(1)} kg`) }
    for (const x of co.x ?? []) {
      resultats.push(ajouter({
        resourceType: 'Observation', status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
        code: nous('tests', x.k, x.k === 'TDR' ? 'TDR paludisme' : x.k), subject: sujet, effectiveDateTime: iso(co.t),
        valueCodeableConcept: nous('resultats', x.v, x.v === 'POS' ? 'Positif' : 'Négatif'),
      }))
      lignesRes.push(`${jour(co.t)} : ${x.k === 'TDR' ? 'TDR paludisme' : x.k} ${x.v === 'POS' ? 'positif' : 'négatif'} (${label(MOTIFS, co.m)})`)
    }
  }

  /* ---- le document ---- */
  const section = (titre: string, code: [string, string], refs: string[], lignes: string[]) => ({
    title: titre, code: loinc(...code), text: narratif(lignes), entry: refs.map(reference => ({ reference })),
  })
  const sections = [
    section('Allergies et intolérances', ['48765-2', 'Allergies and adverse reactions Document'], allergies, lignesAl),
    section('Traitements', ['10160-0', 'History of Medication use Narrative'], traitements, lignesTx),
    section('Problèmes et antécédents', ['11450-4', 'Problem list - Reported'], problemes, lignesAh),
    ...(resultats.length ? [section('Résultats', ['30954-2', 'Relevant diagnostic tests/laboratory data Narrative'], resultats, lignesRes)] : []),
    ...(vitaux.length ? [section('Signes vitaux', ['8716-3', 'Vital signs'], vitaux, lignesVit)] : []),
  ]

  const composition: Ressource = {
    resourceType: 'Composition',
    meta: { profile: [`${IPS}/Composition-uv-ips`] },
    language: 'fr-FR',
    status: 'final',
    type: loinc('60591-5', 'Patient summary Document'),
    subject: sujet,
    date: iso(carte.iat),
    author: [{ reference: soignant }, ...(organisation ? [{ reference: organisation }] : [])],
    title: 'Résumé patient (IPS) issu de la carte d’urgence LAFIA',
    attester: [{ mode: 'professional', time: iso(carte.iat), party: { reference: soignant } }],
    ...(organisation ? { custodian: { reference: organisation } } : {}),
    section: sections,
  }
  const fullComposition = `urn:uuid:${uuid()}`

  return {
    resourceType: 'Bundle',
    meta: { profile: [`${IPS}/Bundle-uv-ips`] },
    identifier: { system: `${BASE_FHIR}/carte`, value: `${carte.payload.id}-${carte.iat}` },
    type: 'document',
    timestamp: iso(maintenant),
    entry: [{ fullUrl: fullComposition, resource: composition }, ...entrees],
  }
}

const jour = (t: number) => new Date(t * 1000).toLocaleDateString('fr-FR')

/** Nom du fichier exporté : sans nom propre, seulement l'identifiant pseudonyme et la date. */
export const nomFichierIps = (carte: Ok) => `lafia-ips-${carte.payload.id}-${new Date(carte.iat * 1000).toISOString().slice(0, 10)}.json`

/** Télécharge le résumé IPS (fichier JSON). */
export function telechargerIps(carte: Ok, o: OptionsIps) {
  const blob = new Blob([JSON.stringify(carteVersIps(carte, o), null, 2)], { type: 'application/fhir+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nomFichierIps(carte)
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
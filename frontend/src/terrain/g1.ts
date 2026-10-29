/**
 * Test terrain G1 : « une carte imprimée se lit hors ligne en moins de 5 secondes ».
 * Protocole : 10 lectures de suite, téléphone en mode avion, du toucher sur « Scanner » jusqu'à la carte vérifiée.
 * Objectif atteint si les 10 lectures sont valides ET toutes sous 5 s.
 *
 * Le mode test ne montre JAMAIS le contenu médical de la carte : il vérifie seulement la signature et chronomètre.
 * Il n'ouvre donc aucun accès aux données, et n'a pas à écrire dans le journal du patient.
 */

export const OBJECTIF = { lectures: 10, ms: 5000 } as const

export const CONDITIONS = ['Lumière normale', 'Pénombre', 'Plein soleil', 'Carte pliée ou abîmée', 'Sur un écran'] as const
export type Condition = (typeof CONDITIONS)[number]

export type Essai = {
  n: number
  t: number                // horodatage (s)
  ms: number               // du toucher à la carte vérifiée (ou au refus)
  ok: boolean              // signature valide
  raison?: string          // si refusée
  condition: Condition
  horsLigne: boolean       // navigator.onLine === false au moment de la lecture
}

export type Resume = {
  total: number
  valides: number
  sousObjectif: number     // valides ET < 5 s
  mediane: number | null
  max: number | null
  horsLigne: number
  atteint: boolean
}

export function resumer(essais: Essai[]): Resume {
  const valides = essais.filter(e => e.ok)
  const temps = valides.map(e => e.ms).sort((a, b) => a - b)
  const mediane = temps.length ? (temps.length % 2 ? temps[(temps.length - 1) / 2] : Math.round((temps[temps.length / 2 - 1] + temps[temps.length / 2]) / 2)) : null
  const sousObjectif = valides.filter(e => e.ms < OBJECTIF.ms).length
  const horsLigne = essais.filter(e => e.horsLigne).length
  return {
    total: essais.length,
    valides: valides.length,
    sousObjectif,
    mediane,
    max: temps.length ? temps[temps.length - 1] : null,
    horsLigne,
    // Les 10 premières lectures comptent ; elles doivent toutes être valides, sous 5 s, et faites hors ligne.
    atteint: essais.length >= OBJECTIF.lectures && essais.slice(0, OBJECTIF.lectures).every(e => e.ok && e.ms < OBJECTIF.ms && e.horsLigne),
  }
}

export const secondes = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`

/** Appareil, en clair et court (pour la fiche de résultats). */
export function appareil(ua: string): string {
  const android = /Android ([\d.]+)/.exec(ua)
  const modele = /Android [\d.]+; ([^;)]+)/.exec(ua)?.[1]?.replace(/ Build.*/, '').trim()
  const nav = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'navigateur inconnu'
  if (android) return `Android ${android[1]}${modele && modele !== 'K' ? ` (${modele})` : ''} · ${nav}`
  if (/iPhone|iPad/.test(ua)) return `iOS · ${nav}`
  if (/Linux|Windows|Mac OS/.test(ua)) return `Ordinateur · ${nav}`
  return nav
}

const jourHeure = (t: number) => new Date(t * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

/** Résumé à envoyer par WhatsApp à l'équipe. */
export function enTexte(essais: Essai[], o: { appareil: string; testeur: string; lieu: string }): string {
  const r = resumer(essais)
  const lignes = [
    `Test terrain G1 LAFIA : ${r.atteint ? 'OBJECTIF ATTEINT' : r.total < OBJECTIF.lectures ? `test en cours (${r.total}/${OBJECTIF.lectures} lectures)` : 'objectif NON atteint'}`,
    `${o.testeur ? `Testeur : ${o.testeur} · ` : ''}${o.lieu ? `Lieu : ${o.lieu} · ` : ''}${essais.length ? jourHeure(essais[0].t) : ''}`,
    `Téléphone : ${o.appareil}`,
    `Lectures valides : ${r.valides}/${r.total} · sous 5 s : ${r.sousObjectif}/${r.total} · hors ligne : ${r.horsLigne}/${r.total}`,
    r.mediane !== null ? `Temps médian : ${secondes(r.mediane)} · le plus long : ${secondes(r.max!)}` : 'Aucune lecture valide.',
    '',
    ...essais.map(e => `${e.n}. ${e.ok ? secondes(e.ms) : `REFUSÉE (${e.raison ?? '?'})`} · ${e.condition}${e.horsLigne ? '' : ' · EN LIGNE'}`),
  ]
  return lignes.filter((l, i) => l !== '' || i > 0).join('\n')
}

/** Tableau pour un tableur (séparateur « ; », comme Excel/LibreOffice en français). */
export function enCsv(essais: Essai[], o: { appareil: string; testeur: string; lieu: string }): string {
  const champ = (v: string | number | boolean) => `"${String(v).replace(/"/g, '""')}"`
  const tete = ['n', 'date', 'temps_ms', 'valide', 'raison', 'condition', 'hors_ligne', 'telephone', 'testeur', 'lieu']
  const lignes = essais.map(e => [e.n, jourHeure(e.t), e.ms, e.ok ? 'oui' : 'non', e.raison ?? '', e.condition, e.horsLigne ? 'oui' : 'non', o.appareil, o.testeur, o.lieu].map(champ).join(';'))
  return [tete.join(';'), ...lignes].join('\n')
}
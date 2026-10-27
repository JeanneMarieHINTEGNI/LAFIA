// Contrat v2 : miroir exact de lafia/c0.py. Toute divergence est détectée par test/vectors.test.ts.
export const VERSION = 2
export const MAX_QR_CHARS = 1400
export const MAX_CONSULTATIONS = 3
export const FUTURE_SKEW_S = 24 * 3600
export const STALE_DAYS = 30

export const CATALOG = {
  motifs: ['AUTR', 'CONS', 'CTRL', 'EVAC', 'FIEV', 'PREN', 'TRAU', 'VACC'],
  orientations: ['DOM', 'EVAC', 'SUIV'],
  tests: { TDR: ['NEG', 'POS'] } as Record<string, string[]>,
  groupes: ['A+', 'A-', 'AB+', 'AB-', 'B+', 'B-', 'O+', 'O-'],
  roles: ['infirmier', 'medecin', 'relais'],
  // Catégories sensibles par défaut : elles vivent dans le C1 et n'entrent dans le C0 que par choix explicite du patient (pr.vs).
  sensibles: ['ADDICT', 'ARV', 'DREPANO', 'GROSSESSE', 'IVG', 'PSY', 'VIH'],
}
export type Role = 'infirmier' | 'medecin' | 'relais'

const CODE = /^[A-Z0-9_]{2,12}$/
const FACILITY = /^[0-9a-f]{4,8}$/
const KID = /^[0-9a-f]{16}$/
const PID = /^p-[0-9a-f]{8,16}$/
const DOSE = /^T\d{1,2}:L\d{1,2}$/
const TEL = /^\+?[0-9 ]{6,18}$/

export type Consultation = {
  t: number; f: string; a: string; m: string
  c?: { temp?: number; poids?: number; pt?: number }
  x?: { k: string; v: string }[]
  adm?: { c: string; h: number }[]
  o?: { k: string; d?: string }
}
export type Profile = {
  al?: string[]; tx?: { c: string; d?: string }[]; ah?: string[]
  ec?: { n: string; tel: string }; gs?: string; yb?: number; sx?: 'F' | 'M'
  vs?: string[]   // catégories sensibles que le patient a CHOISI de rendre lisibles en urgence
}
export type C0Payload = { v: 2; id: string; iat: number; pr?: Profile; co?: Consultation[] }

export class SchemaError extends Error {}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
function keys(o: unknown, allowed: string[], where: string): Obj {
  if (!isObj(o)) throw new SchemaError(`${where}: objet attendu`)
  const bad = Object.keys(o).filter(k => !allowed.includes(k))
  if (bad.length) throw new SchemaError(`${where}: clés inconnues ${bad.join(',')}`)
  return o
}
function int(v: unknown, lo: number, hi: number, where: string) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) throw new SchemaError(`${where}: entier attendu entre ${lo} et ${hi}`)
}
function code(v: unknown, where: string, rx = CODE) {
  if (typeof v !== 'string' || !rx.test(v)) throw new SchemaError(`${where}: code invalide`)
}
function text(v: unknown, where: string, n: number) {
  // eslint-disable-next-line no-control-regex
  if (typeof v !== 'string' || v.length < 1 || v.length > n || /[\x00-\x1f]/.test(v)) throw new SchemaError(`${where}: texte de 1 à ${n} caractères sans contrôle`)
}
function list(v: unknown, where: string, n: number): unknown[] {
  if (!Array.isArray(v) || v.length > n) throw new SchemaError(`${where}: liste de ${n} éléments maximum`)
  return v
}
const EPOCH_MIN = 1_600_000_000, EPOCH_MAX = 4_000_000_000

export function validate(p: unknown): asserts p is C0Payload {
  const top = keys(p, ['v', 'id', 'iat', 'pr', 'co'], 'C0')
  if (top.v !== VERSION) throw new SchemaError('version non supportée')
  code(top.id, 'id', PID)
  int(top.iat, EPOCH_MIN, EPOCH_MAX, 'iat')
  const pr = keys(top.pr ?? {}, ['al', 'tx', 'ah', 'ec', 'gs', 'yb', 'sx', 'vs'], 'pr')
  for (const k of ['al', 'ah']) list(pr[k] ?? [], k, 6).forEach((c, i) => code(c, `${k}[${i}]`))
  list(pr.tx ?? [], 'tx', 6).forEach(t => {
    const o = keys(t, ['c', 'd'], 'tx')
    code(o.c, 'tx.c')
    if ('d' in o && !(typeof o.d === 'string' && DOSE.test(o.d))) throw new SchemaError('tx.d: la dose est une référence de table (ex. T1:L3)')
  })
  const vs = list(pr.vs ?? [], 'vs', 6)
  vs.forEach(c => { if (!CATALOG.sensibles.includes(c as string)) throw new SchemaError('vs: ne peut contenir que des catégories sensibles') })
  const shown = [...((pr.ah ?? []) as string[]), ...((pr.tx ?? []) as { c: string }[]).map(x => x.c)]
  shown.forEach(c => { if (CATALOG.sensibles.includes(c) && !vs.includes(c)) throw new SchemaError(`${c}: catégorie sensible hors C0 sans choix explicite du patient (pr.vs)`) })
  if ('ec' in pr) {
    const ec = keys(pr.ec, ['n', 'tel'], 'ec')
    text(ec.n, 'ec.n', 30)
    if (!(typeof ec.tel === 'string' && TEL.test(ec.tel))) throw new SchemaError('ec.tel invalide')
  }
  if ('gs' in pr && !CATALOG.groupes.includes(pr.gs as string)) throw new SchemaError('gs invalide')
  if ('yb' in pr) int(pr.yb, 1900, 2100, 'yb')
  if ('sx' in pr && pr.sx !== 'F' && pr.sx !== 'M') throw new SchemaError('sx invalide')
  list(top.co ?? [], 'co', MAX_CONSULTATIONS).forEach((raw, i) => {
    const w = `co[${i}]`
    const e = keys(raw, ['t', 'f', 'a', 'm', 'c', 'x', 'adm', 'o'], w)
    int(e.t, EPOCH_MIN, EPOCH_MAX, w + '.t')
    code(e.f, w + '.f', FACILITY)
    code(e.a, w + '.a', KID)
    if (!CATALOG.motifs.includes(e.m as string)) throw new SchemaError(`${w}.m: motif hors catalogue`)
    if ('c' in e) {
      const c = keys(e.c, ['temp', 'poids', 'pt'], w + '.c')
      if ('temp' in c) int(c.temp, 300, 450, w + '.c.temp')
      if ('poids' in c) { int(c.poids, 5, 3000, w + '.c.poids'); int(c.pt, EPOCH_MIN, EPOCH_MAX, w + '.c.pt') }
      else if ('pt' in c) throw new SchemaError(w + '.c.pt sans poids')
    }
    list(e.x ?? [], w + '.x', 3).forEach((xr, j) => {
      const x = keys(xr, ['k', 'v'], w + '.x')
      if (!(CATALOG.tests[x.k as string] ?? []).includes(x.v as string)) throw new SchemaError(`${w}.x[${j}]: test ou résultat hors catalogue`)
    })
    list(e.adm ?? [], w + '.adm', 4).forEach(ar => {
      const a = keys(ar, ['c', 'h'], w + '.adm')
      code(a.c, w + '.adm.c'); int(a.h, EPOCH_MIN, EPOCH_MAX, w + '.adm.h')
    })
    if ('o' in e) {
      const o = keys(e.o, ['k', 'd'], w + '.o')
      if (!CATALOG.orientations.includes(o.k as string)) throw new SchemaError(w + '.o.k hors catalogue')
      if ('d' in o) code(o.d, w + '.o.d', FACILITY)
    }
  })
}
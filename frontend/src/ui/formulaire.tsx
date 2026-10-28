import { useMemo, type ReactNode } from 'react'
import { renderSVG } from 'uqr'
import { CATALOG, type C0Payload } from '../core'
import { FACILITIES, REGISTRY, getRoleLabel } from './trust'
import { ALLERGENS, ANTECEDENTS, MEDS, MOTIFS, ORIENT, label } from './labels'
import type { Etat, Liste } from '../patient/carte'

// Éléments de formulaire partagés par « Ma carte » (patient) et l'espace soignant.

/* ---------- petits composants ---------- */

export function Chip({ on, onClick, children, tone = 'teal', disabled }: { on: boolean; onClick: () => void; children: ReactNode; tone?: 'teal' | 'amber' | 'red'; disabled?: boolean }) {
  const actif = { teal: 'border-[#4FB3AC] bg-[#4FB3AC]/15 text-[#C8F3EE]', amber: 'border-[#F2A93B] bg-[#F2A93B]/15 text-[#F2A93B]', red: 'border-[#D9534A] bg-[#D9534A]/15 text-[#FFB5AC]' }[tone]
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs disabled:opacity-40 ${on ? actif : 'border-white/15 text-[#F4F1EA]/65 hover:text-[#F4F1EA]'}`}>
      {children}
    </button>
  )
}

const ETATS: { e: Etat; f: string; m: string }[] = [
  { e: 'inconnu', f: 'Non renseignées', m: 'Non renseignés' },
  { e: 'aucun', f: 'Aucune connue', m: 'Aucun connu' },
  { e: 'connu', f: 'Renseignées', m: 'Renseignés' },
]

export function ChoixListe({ titre, valeur, onChange, catalogue, feminin, tone = 'teal' }: {
  titre: string; valeur: Liste; onChange: (l: Liste) => void; catalogue: Record<string, string>; feminin?: boolean; tone?: 'teal' | 'red'
}) {
  const bascule = (c: string) => onChange({ ...valeur, codes: valeur.codes.includes(c) ? valeur.codes.filter(x => x !== c) : [...valeur.codes, c].slice(0, 6) })
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-[#F4F1EA]/65">{titre}</legend>
      <div className="flex flex-wrap gap-2">
        {ETATS.map(({ e, f, m }) => (
          <Chip key={e} tone={tone} on={valeur.etat === e} onClick={() => onChange({ etat: e, codes: e === 'connu' ? valeur.codes : [] })}>{feminin ? f : m}</Chip>
        ))}
      </div>
      {valeur.etat === 'connu' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(catalogue).map(([c, l]) => (
            <Chip key={c} tone={tone} on={valeur.codes.includes(c)} onClick={() => bascule(c)}>
              {l}{CATALOG.sensibles.includes(c) ? ' · sensible' : ''}
            </Chip>
          ))}
        </div>
      )}
    </fieldset>
  )
}

export function Qr({ text }: { text: string }) {
  const svg = useMemo(() => {
    if (!text) return ''
    try { return renderSVG(text, { ecc: 'M', border: 4 }) } catch { return 'ERREUR' }
  }, [text])
  if (!text) return <p className="p-4 text-center text-sm text-[#0A1615]/60">La carte apparaîtra après sa signature par un soignant.</p>
  if (svg === 'ERREUR') return <p className="p-4 text-center text-sm text-[#D9534A]">QR impossible : contenu trop long.</p>
  return <div className="qr-render h-full w-full" role="img" aria-label="QR de la carte d’urgence" dangerouslySetInnerHTML={{ __html: svg }} />
}

export const champ = 'mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[#F4F1EA] outline-none placeholder:text-[#F4F1EA]/25 focus:border-[#4FB3AC]'
export const quand = (t: number) => new Date(t * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

/* ---------- aperçu de relecture (ce qui sera signé, rien d'autre) ---------- */

export function Apercu({ p }: { p: C0Payload }) {
  const pr = p.pr ?? {}
  const l3 = (v: string[] | undefined, m: Record<string, string>, aucun: string) => (v === undefined ? 'non renseigné' : v.length ? v.map(c => label(m, c)).join(' · ') : aucun)
  return (
    <ul className="space-y-1 text-sm text-[#F4F1EA]/80">
      <li><strong>Né(e) en :</strong> {pr.yb ?? 'non renseigné'} · <strong>Sexe :</strong> {pr.sx === 'F' ? 'femme' : pr.sx === 'M' ? 'homme' : 'non renseigné'}</li>
      <li><strong>Allergies :</strong> {l3(pr.al, ALLERGENS, 'aucune connue')}</li>
      <li><strong>Traitements :</strong> {l3(pr.tx?.map(t => t.c), MEDS, 'aucun')}</li>
      <li><strong>Antécédents :</strong> {l3(pr.ah, ANTECEDENTS, 'aucun connu')}</li>
      <li><strong>Groupe sanguin :</strong> {pr.gs ?? 'non renseigné'}</li>
      {pr.ec && <li><strong>Contact :</strong> {pr.ec.n} · {pr.ec.tel}</li>}
      {pr.vs?.length ? <li className="text-[#F2A93B]">Sensible rendu lisible au choix du patient : {pr.vs.map(c => label(ANTECEDENTS, c)).join(' · ')}</li> : null}
      {(p.co ?? []).map(c => (
        <li key={`${c.t}-${c.a}`} className="pt-1">
          <strong>{quand(c.t)} :</strong> {label(MOTIFS, c.m)}
          {c.c?.temp !== undefined && ` · ${(c.c.temp / 10).toFixed(1)} °C`}
          {c.c?.poids !== undefined && ` · ${(c.c.poids / 10).toFixed(1)} kg`}
          {c.x?.map(x => ` · ${x.k} ${x.v === 'POS' ? 'positif' : 'négatif'}`)}
          {c.adm?.length ? ` · donné : ${c.adm.map(a => label(MEDS, a.c)).join(', ')}` : ''}
          {c.o && ` · ${label(ORIENT, c.o.k)}`}
          <span className="text-[#F4F1EA]/45"> · {getRoleLabel(REGISTRY[c.a]?.role ?? '')} · {FACILITIES[c.f] ?? c.f}</span>
        </li>
      ))}
    </ul>
  )
}
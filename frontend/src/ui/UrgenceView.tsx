import type { Verified, Consultation } from '../core'
import { ALERTES, ALLERGENS, ANTECEDENTS, MEDS, MOTIFS, ORIENT, ROLE_LABEL, label } from './labels'

type Ok = Extract<Verified, { ok: true }>
const fmt = (t: number) => new Date(t * 1000).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const day = (t: number) => new Date(t * 1000).toLocaleDateString('fr-FR')
const WEIGHT_STALE_DAYS = 90

// Le C0 est lisible par quiconque tient la carte (principe des trois compartiments) : aucun filtre par rôle ici.
// Un filtre d'affichage par rôle n'a aucune base dans la documentation et donnerait une fausse impression de protection.

/** N'affiche que ce qui sort de verify() : l'appelant ne peut pas lui passer autre chose.
 *  Ordre = ordre de lecture en urgence : qui (âge, sexe, groupe) → allergies → traitements → antécédents → qui appeler → récent. */
export function UrgenceView({ card, facilities, now = Math.floor(Date.now() / 1000) }: { card: Ok; facilities: Record<string, string>; now?: number }) {
  const { payload: p, role } = card
  const pr = p.pr ?? {}
  const co = [...(p.co ?? [])].sort((a, b) => b.t - a.t)
  const where = (f?: string) => (f ? facilities[f] ?? `établissement ${f}` : '')
  const age = pr.yb ? new Date(now * 1000).getFullYear() - pr.yb : undefined
  const alertes = [...(pr.tx ?? []).map(t => t.c), ...(pr.ah ?? [])].filter(c => ALERTES[c])

  return (
    <div className="space-y-4 text-[#F4F1EA]">
      <div className="rounded-xl border border-[#4FB3AC]/40 bg-[#4FB3AC]/10 px-4 py-3 text-sm text-[#C8F3EE]">
        ✓ Signature valide · écrit par {ROLE_LABEL[role].toLowerCase()}{card.etab ? ` du ${where(card.etab)}` : ''} · émise le {fmt(card.iat)}
      </div>
      {card.warnings.map(w => <div key={w} className="rounded-xl border border-[#F2A93B]/40 bg-[#F2A93B]/10 px-4 py-3 text-sm text-[#F2A93B]">⚠ {w}</div>)}

      {/* 0. Identité clinique : lisible d'un coup d'œil. */}
      <section className="grid grid-cols-3 gap-2 text-center" aria-label="Identité clinique">
        <Fait titre="Âge" valeur={age !== undefined ? `${age} ans` : undefined} detail={pr.yb ? `né(e) en ${pr.yb}` : undefined} />
        <Fait titre="Sexe" valeur={pr.sx === 'F' ? 'Femme' : pr.sx === 'M' ? 'Homme' : undefined} />
        <Fait titre="Groupe sanguin" valeur={pr.gs} fort detail={pr.gs ? 'contrôle prétransfusionnel obligatoire' : undefined} />
      </section>

      {/* 1. Allergies : toujours avant les traitements. Trois états distincts. */}
      <section className={`rounded-2xl p-4 ${pr.al?.length ? 'bg-[#D9534A]/15 border border-[#D9534A]/50' : 'bg-white/5 border border-white/10'}`}>
        <h3 className="text-xs uppercase tracking-[0.14em] text-[#F4F1EA]/50 mb-1">Allergies</h3>
        {pr.al === undefined && <p className="text-[#F2A93B]">NON RENSEIGNÉ : ne pas supposer l'absence d'allergie</p>}
        {pr.al?.length === 0 && <p>Aucune allergie connue (déclarée par le soignant)</p>}
        {!!pr.al?.length && <p className="text-xl font-semibold text-[#FFD5CF]">{pr.al.map(c => label(ALLERGENS, c)).join(' · ')}</p>}
      </section>

      {alertes.length > 0 && (
        <section className="rounded-2xl border border-[#F2A93B]/50 bg-[#F2A93B]/10 p-4" aria-label="Points d'attention">
          <h3 className="text-xs uppercase tracking-[0.14em] text-[#F2A93B] mb-2">⚠ Points d'attention</h3>
          <ul className="space-y-1">
            {alertes.map(c => <li key={c}><b>{label(MEDS, c) === c ? label(ANTECEDENTS, c) : label(MEDS, c)}</b> <span className="text-[#F4F1EA]/70">: {ALERTES[c]}</span></li>)}
          </ul>
        </section>
      )}

      <Block title="Traitements en cours" empty={pr.tx === undefined} none={pr.tx?.length === 0}>
        {pr.tx?.map(t => <p key={t.c}>{label(MEDS, t.c)}{t.d ? <small className="text-[#F4F1EA]/50"> · dose : table {t.d}</small> : null}</p>)}
      </Block>

      <Block title="Maladies de fond / antécédents" empty={pr.ah === undefined} none={pr.ah?.length === 0}>
        <p>{pr.ah?.map(c => label(ANTECEDENTS, c) + (pr.vs?.includes(c) ? ' (affiché au choix de la personne)' : '')).join(' · ')}</p>
      </Block>

      {pr.ec ? (
        <Block title="Contact d'urgence">
          <p>{pr.ec.n} · <a className="font-semibold underline underline-offset-4" href={`tel:${pr.ec.tel.replace(/ /g, '')}`}>{pr.ec.tel}</a> <span className="text-xs text-[#F4F1EA]/45">(toucher pour appeler)</span></p>
        </Block>
      ) : <Block title="Contact d'urgence" empty />}

      <section>
        <h3 className="text-xs uppercase tracking-[0.14em] text-[#F4F1EA]/50 mb-2">Consultations récentes</h3>
        {co.length === 0 && <p className="text-[#F4F1EA]/50">Aucune consultation enregistrée.</p>}
        {co.map((e, i) => <Consult key={e.t + e.a} e={e} where={where} now={now} first={i === 0} />)}
      </section>

      <p className="text-xs text-[#F4F1EA]/35">Cette carte est lisible par toute personne qui la détient. Contenu signé par un humain ; elle ne remplace ni l'interrogatoire ni l'examen clinique.</p>
    </div>
  )
}

function Fait({ titre, valeur, detail, fort }: { titre: string; valeur?: string; detail?: string; fort?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-2 py-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[#F4F1EA]/50">{titre}</p>
      {valeur
        ? <p className={`mt-1 font-semibold ${fort ? 'text-3xl text-[#FFD5CF]' : 'text-xl'}`}>{valeur}</p>
        : <p className="mt-1 text-sm text-[#F2A93B]">non renseigné</p>}
      {detail && <p className="mt-0.5 text-[10px] leading-tight text-[#F4F1EA]/45">{detail}</p>}
    </div>
  )
}

function Block({ title, children, empty, none }: { title: string; children?: React.ReactNode; empty?: boolean; none?: boolean }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <h3 className="text-xs uppercase tracking-[0.14em] text-[#F4F1EA]/50 mb-1">{title}</h3>
      {empty ? <p className="text-[#F2A93B]">NON RENSEIGNÉ</p> : none ? <p className="text-[#F4F1EA]/70">Aucun connu (déclaré)</p> : children}
    </section>
  )
}

function Consult({ e, where, now, first }: { e: Consultation; where: (f?: string) => string; now: number; first: boolean }) {
  const weightAge = e.c?.pt ? Math.floor((now - e.c.pt) / 86400) : undefined
  return (
    <div className={`rounded-2xl border p-4 mb-3 ${first ? 'border-white/25 bg-white/[0.07]' : 'border-white/10 bg-white/[0.03]'}`}>
      <p className="font-medium">{fmt(e.t)} · {label(MOTIFS, e.m)} <span className="text-[#F4F1EA]/45">· {where(e.f)}</span></p>
      <ul className="mt-2 space-y-1 text-sm text-[#F4F1EA]/85">
        {e.c?.temp !== undefined && <li>Température : <b>{(e.c.temp / 10).toFixed(1)} °C</b></li>}
        {e.c?.poids !== undefined && (
          <li>Poids : <b>{(e.c.poids / 10).toFixed(1)} kg</b> <span className={weightAge !== undefined && weightAge > WEIGHT_STALE_DAYS ? 'text-[#F2A93B]' : 'text-[#F4F1EA]/45'}>
            (mesuré le {day(e.c.pt!)}{weightAge !== undefined && weightAge > WEIGHT_STALE_DAYS ? ' : ancien, ne pas dimensionner une dose dessus' : ''})</span></li>
        )}
        {e.x?.map(x => <li key={x.k}>{x.k} : <b>{x.v === 'POS' ? 'POSITIF' : 'négatif'}</b></li>)}
        {e.adm?.map(a => <li key={a.c + a.h}>Donné : <b>{label(MEDS, a.c)}</b> à {new Date(a.h * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</li>)}
        {e.o && <li>Orientation : <b>{label(ORIENT, e.o.k)}</b>{e.o.d ? ` → ${where(e.o.d)}` : ''}</li>}
      </ul>
    </div>
  )
}
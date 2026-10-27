import { useMemo, useState } from 'react'
import { CAREGIVER, ITEMS, REMINDERS, type Compartment, type Item } from './data'
import { useDeviceState } from './store'

// La vue « Ma carte » (C0 signé) est dans ./CarteView.tsx.

const COMP_NAMES: Record<Compartment, string> = { 0: 'Le bracelet', 1: 'Le sensible', 2: 'Le dossier' }
const COMP_REGIMES: Record<Compartment, string> = {
  0: "Signé, lisible par tout soignant qui tient votre carte, même sans réseau.",
  1: "Chiffré. S'ouvre avec le badge d'un médecin inscrit à l'Ordre, et vous en êtes prévenu.",
  2: 'Chiffré sur le serveur. Il faut le réseau et votre accord.',
}

// Placement of each item, decided by the patient and kept on the device.
function useCompartments() {
  const initial = useMemo(() => Object.fromEntries(ITEMS.map(i => [i.id, i.comp])) as Record<string, Compartment>, [])
  const [map, setMap] = useDeviceState('compartments', initial)
  const items = ITEMS.map(i => ({ ...i, comp: map[i.id] ?? i.comp }))
  return { items, move: (id: string, comp: Compartment) => setMap({ ...map, [id]: comp }), reset: () => setMap(initial) }
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="lg lg-switch shrink-0">
      <span />
    </button>
  )
}

// « Mon journal » est dans ./JournalView.tsx (vrai journal de l'appareil).

/* ---------- Compartiments ---------- */

function ItemRow({ item, onMove }: { item: Item; onMove?: () => void }) {
  return (
    <li className="py-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <p className="text-sm text-[#F4F1EA]/45">{item.label}</p>
        <p className="text-[#F4F1EA] mt-0.5">{item.value}</p>
        <p className="text-xs text-[#F4F1EA]/35 mt-1">
          {item.author} · {item.date}
        </p>
        {item.comp === 1 && item.critical && (
          <p className="text-xs text-[#F2A93B] mt-2">En urgence, un médecin ne le verra plus sans votre téléphone.</p>
        )}
      </div>
      {onMove && (
        <button
          onClick={onMove}
          className="shrink-0 self-start sm:self-auto text-sm text-[#F4F1EA]/70 border border-white/15 rounded-full px-4 py-2 hover:bg-white/10 transition-colors"
        >
          {item.comp === 0 ? 'Rendre sensible' : 'Rendre lisible en urgence'}
        </button>
      )}
    </li>
  )
}

export function CompartimentsView() {
  const { items, move, reset } = useCompartments()
  return (
    <div>
      {([0, 1, 2] as Compartment[]).map(c => {
        const list = items.filter(i => i.comp === c)
        return (
          <section key={c} className="mb-14">
            <div className="grid grid-cols-[auto_1fr] gap-6 items-baseline border-t border-white/10 pt-6 mb-2">
              <span className="font-display font-light text-5xl leading-none text-[#F4F1EA]/80">{c}</span>
              <div>
                <h3 className="font-display text-2xl font-light text-[#F4F1EA]">{COMP_NAMES[c]}</h3>
                <p className="text-[15px] text-[#F4F1EA]/50 mt-1 max-w-lg">{COMP_REGIMES[c]}</p>
              </div>
            </div>
            <ul>
              {list.map(i => (
                <ItemRow key={i.id} item={i} onMove={c === 2 ? undefined : () => move(i.id, c === 0 ? 1 : 0)} />
              ))}
              {list.length === 0 && <li className="py-5 text-sm text-[#F4F1EA]/40">Rien pour l'instant.</li>}
            </ul>
          </section>
        )
      })}
      <button onClick={reset} className="text-sm text-[#F4F1EA]/50 hover:text-[#F4F1EA] underline underline-offset-4 decoration-white/20">
        Rétablir le classement d'origine
      </button>
    </div>
  )
}

/* ---------- Aidant et rappels ---------- */

export function AidantView() {
  const [caregiver, setCaregiver] = useDeviceState('caregiver', CAREGIVER)
  const [double, setDouble] = useDeviceState('double-sms', true)
  const [reminders, setReminders] = useDeviceState('reminders', REMINDERS)
  const [editing, setEditing] = useState(false)
  const field = 'w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-[#F4F1EA] outline-none focus:border-[#4FB3AC]'

  return (
    <div className="max-w-2xl">
      <section className="border-t border-white/10 pt-6 mb-14">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-display text-2xl font-light text-[#F4F1EA]">Votre aidant</h3>
            <p className="text-[15px] text-[#F4F1EA]/50 mt-1">Il figure dans le compartiment 0 : un soignant peut l'appeler en urgence.</p>
          </div>
          <button onClick={() => setEditing(e => !e)} className="lg lg-button shrink-0 text-sm text-[#F4F1EA]/80 px-4 py-2">
            {editing ? 'Terminer' : 'Modifier'}
          </button>
        </div>
        {editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['name', 'relation', 'phone'] as const).map(k => (
              <label key={k} className="text-sm text-[#F4F1EA]/50">
                {k === 'name' ? 'Nom' : k === 'relation' ? 'Lien' : 'Téléphone'}
                <input className={`${field} mt-1.5`} value={caregiver[k]} onChange={e => setCaregiver({ ...caregiver, [k]: e.target.value })} />
              </label>
            ))}
          </div>
        ) : (
          <p className="text-lg text-[#F4F1EA]">
            {caregiver.name} <span className="text-[#F4F1EA]/45">· {caregiver.relation} · {caregiver.phone}</span>
          </p>
        )}
        <div className="flex items-center justify-between gap-6 mt-8 py-5 border-y border-white/10">
          <div>
            <p className="text-[#F4F1EA]">Envoyer aussi les rappels à {caregiver.name.split(' ')[0]}</p>
            <p className="text-sm text-[#F4F1EA]/45 mt-1">Le rappel qui marche le mieux est celui qu'une personne proche reçoit aussi.</p>
          </div>
          <Switch on={double} onChange={setDouble} label="Doubler les rappels vers l'aidant" />
        </div>
      </section>

      <section className="border-t border-white/10 pt-6">
        <h3 className="font-display text-2xl font-light text-[#F4F1EA]">Vos rappels</h3>
        <p className="text-[15px] text-[#F4F1EA]/50 mt-1 mb-4">Par SMS, sans smartphone. Le message ne nomme jamais la maladie ni le médicament.</p>
        <ul>
          {reminders.map(r => (
            <li key={r.id} className="flex items-center justify-between gap-6 py-5 border-b border-white/10">
              <div className={r.on ? '' : 'opacity-45'}>
                <p className="text-sm text-[#F4F1EA]/50">{r.when}</p>
                <p className="text-[#F4F1EA] mt-1">« {r.sms} »</p>
                {r.on && double && <p className="text-xs text-[#F4F1EA]/35 mt-1">Aussi envoyé à {caregiver.name}</p>}
              </div>
              <Switch on={r.on} onChange={on => setReminders(reminders.map(x => (x.id === r.id ? { ...x, on } : x)))} label={`Rappel : ${r.when}`} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

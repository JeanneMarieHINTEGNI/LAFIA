import { useEffect, useMemo, useState } from 'react'
import { journal, useJournal } from '../journal/usejournal'
import { verifierChaine, verifierEntreeSeule, type Entree, type StatutEntree, type Verdict } from '../journal'
import { journalDuServeur } from '../journal/sync'
import { FACILITIES, REGISTRY, getRoleLabel } from '../ui/trust'
import { useDeviceState } from './store'

// « Mon journal » : les VRAIS accès à la carte du patient, vérifiés avant affichage.
// - lectures faites sur CET appareil : journal local, chaîne entière vérifiée ici ;
// - lectures faites sur d'AUTRES appareils : reçues du serveur (qui a vérifié leur chaîne), empreinte et signature
//   revérifiées ici avec le registre. Serveur injoignable : on affiche le local seul, et on le dit.
// Limite : la suppression des dernières lignes n'est détectable qu'avec un ancrage externe (pas encore construit).

const ACTION: Record<Entree['action'], string> = { LECTURE: 'Lecture de la carte', ECRITURE: 'Nouvelle carte émise' }
const court = (h: string) => `${h.slice(0, 4)}…${h.slice(-4)}`

function quand(t: number) {
  const d = new Date(t * 1000)
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return `Aujourd'hui, ${hm}`
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${hm}`
}

/** Qui a lu : le rôle vient du registre et n'est affiché comme vérifié que si l'entrée est signée par un badge connu. */
function lecteur(e: Entree, statut?: StatutEntree): { qui: string; statut: string; ok: boolean } {
  if (statut === 'invalide') return { qui: 'Entrée falsifiée', statut: 'Empreinte ou signature invalide : à ignorer', ok: false }
  if (!e.acteur) return { qui: 'Lecteur sans badge', statut: 'Non vérifié : aucune signature', ok: false }
  const r = REGISTRY[e.acteur]
  if (!r || r.revoked) return { qui: 'Badge inconnu ou révoqué', statut: 'Signature non vérifiable', ok: false }
  return { qui: r.label ?? getRoleLabel(r.role), statut: 'Signé par son badge', ok: true }
}

/** Démo : réécrit le lieu d'une entrée du milieu, en mémoire seulement, comme le ferait quelqu'un qui modifie le stockage. */
function altere(toutes: Entree[]): Entree[] {
  const i = Math.floor((toutes.length - 1) / 2)
  return toutes.map((e, k) => (k === i ? { ...e, etab: 'ffffff', cible: e.cible } : e))
}

export function JournalView() {
  const [patientId] = useDeviceState('c0-id', '')
  const [carte] = useDeviceState('c0-carte', '')
  const { entrees, erreur } = useJournal(patientId || undefined)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [simulation, setSimulation] = useState<Verdict | null>(null)
  const [nbTotal, setNbTotal] = useState(0)
  // Lectures reçues du serveur (autres appareils), avec le statut revérifié ICI. null = pas encore / injoignable.
  const [distant, setDistant] = useState<{ e: Entree; chaine: string; statut: StatutEntree }[] | null>(null)
  const [serveur, setServeur] = useState<'attente' | 'ok' | 'injoignable'>('attente')

  useEffect(() => {
    if (!patientId) return
    let vivant = true
    journalDuServeur(patientId).then(async liste => {
      if (!vivant) return
      if (!liste) { setServeur('injoignable'); return }
      const verifiees = await Promise.all(liste.map(async ({ chaine, statut: _s, ...e }) => ({ e: e as Entree, chaine, statut: await verifierEntreeSeule(e as Entree, REGISTRY) })))
      if (vivant) { setDistant(verifiees); setServeur('ok') }
    })
    return () => { vivant = false }
  }, [patientId, entrees])

  // La chaîne se vérifie EN ENTIER (toutes les entrées de l'appareil, dans l'ordre), pas seulement celles du patient.
  useEffect(() => {
    let vivant = true
    setSimulation(null)
    journal.toutes().then(
      toutes => verifierChaine(toutes, REGISTRY).then(v => { if (vivant) { setVerdict(v); setNbTotal(toutes.length) } }),
      () => { if (vivant) setVerdict(null) },
    )
    return () => { vivant = false }
  }, [entrees])

  const simuler = async () => {
    if (simulation) return setSimulation(null)
    const toutes = await journal.toutes()
    setSimulation(await verifierChaine(altere(toutes), REGISTRY))
  }

  const affiche = simulation ?? verdict
  const rupture = affiche && !affiche.ok ? affiche.premiereRupture ?? 0 : -1
  // Fusion : une lecture faite ici et déjà envoyée au serveur n'apparaît qu'une fois (même empreinte).
  const lignes = useMemo(() => {
    const locales = (entrees ?? []).map(e => ({ e, origine: 'appareil' as const, statut: undefined as StatutEntree | undefined }))
    const vues = new Set(locales.map(l => l.e.hash))
    const autres = (distant ?? []).filter(d => !vues.has(d.e.hash)).map(d => ({ e: d.e, origine: 'serveur' as const, statut: d.statut }))
    return [...locales, ...autres].sort((a, b) => b.e.t - a.e.t)
  }, [entrees, distant])

  if (erreur) {
    return <p role="alert" className="text-[#F2A93B]">Le journal de cet appareil est illisible (stockage indisponible ou bloqué). Aucun accès ne peut être affiché.</p>
  }
  if (entrees === null) return <p className="text-[#F4F1EA]/55">Chargement du journal…</p>

  return (
    <div>
      {lignes.length > 0 && affiche && (
        <div className="lg lg-panel mb-6 flex flex-col justify-between gap-4 px-6 py-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${affiche.ok ? 'bg-[#4FB3AC]' : 'bg-[#D9534A]'}`} />
            <div>
              <p className="text-[#F4F1EA]">{affiche.ok ? 'Journal intègre' : simulation ? 'Altération détectée (simulation)' : 'Altération détectée'}</p>
              <p className="mt-0.5 text-sm text-[#F4F1EA]/50">
                {affiche.ok
                  ? `${nbTotal} entrée${nbTotal > 1 ? 's' : ''} vérifiée${nbTotal > 1 ? 's' : ''} sur cet appareil${affiche.nonSignees ? ` · ${affiche.nonSignees} sans badge` : ''}${affiche.inconnues ? ` · ${affiche.inconnues} d’un badge inconnu` : ''}`
                  : `L’entrée n°${rupture + 1} ne correspond plus à la chaîne : elle et toutes les suivantes sont invalides.`}
              </p>
            </div>
          </div>
          {nbTotal >= 2 && (
            <button onClick={() => void simuler()} className="self-start text-sm text-[#F4F1EA]/60 underline decoration-white/20 underline-offset-4 hover:text-[#F4F1EA] sm:self-auto">
              {simulation ? 'Revenir au vrai journal' : 'Simuler une altération'}
            </button>
          )}
        </div>
      )}

      {serveur === 'injoignable' && (
        <p className="mb-4 text-sm text-[#F2A93B]">Serveur injoignable : seules les lectures faites sur cet appareil sont affichées. Les autres apparaîtront au retour du réseau.</p>
      )}
      {lignes.length > 0 ? (
        <ol>
          {lignes.map(({ e, origine, statut }) => {
            const l = lecteur(e, statut)
            const invalide = statut === 'invalide' || (origine === 'appareil' && rupture !== -1 && e.i >= rupture)
            return (
              <li key={e.hash} className="grid grid-cols-1 gap-2 border-b border-white/10 py-7 md:grid-cols-[1fr_1.1fr_1.2fr] md:gap-8">
                <div>
                  <p className="font-display text-xl font-light text-[#F4F1EA]">{quand(e.t)}</p>
                  <p className="mt-1 text-[15px] text-[#F4F1EA]/55">{e.etab ? FACILITIES[e.etab] ?? `Établissement ${e.etab}` : 'Lieu non renseigné'}</p>
                </div>
                <div className="text-[15px]">
                  <p className="text-[#F4F1EA]/80">{l.qui}</p>
                  <p className={`mt-1 ${l.ok ? 'text-[#4FB3AC]' : 'text-[#F2A93B]'}`}>{l.statut}</p>
                </div>
                <div className="text-[15px]">
                  <p className="text-[#F4F1EA]/60">{ACTION[e.action]} ({e.rubriques.join(', ')})</p>
                  <p className={`mt-2 text-xs ${invalide ? 'text-[#D9534A]' : 'text-[#F4F1EA]/30'}`}>
                    {invalide ? 'Empreinte invalide' : `Empreinte ${court(e.hash)}`} · {origine === 'appareil' ? 'lue sur cet appareil' : 'lue sur un autre appareil'}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="lg lg-panel px-6 py-5">
          {carte ? (
            <>
              <p className="text-[#F4F1EA]">Personne n’a encore lu votre carte.</p>
              <p className="mt-1 text-sm text-[#F4F1EA]/55">
                Quand un soignant la lira avec Lafia, vous verrez ici quand, où et par qui. La ligne s’ajoute avant même que la carte ne s’affiche.
              </p>
            </>
          ) : (
            <>
              <p className="text-[#F4F1EA]">Votre carte n’a pas encore été créée.</p>
              <p className="mt-1 text-sm text-[#F4F1EA]/55">
                Lors de votre prochaine consultation, un soignant remplira et signera votre carte d’urgence. Ensuite, chaque lecture de votre carte
                apparaîtra ici.
              </p>
              <a href="/#/espace/carte" className="mt-3 inline-block text-sm text-[#F4F1EA]/80 underline underline-offset-4 hover:text-[#F4F1EA]">Voir ma carte</a>
            </>
          )}
        </div>
      )}

      <p className="mt-8 max-w-xl text-sm text-[#F4F1EA]/40">
        Les lectures sont envoyées au serveur Lafia dès que le réseau le permet. Le serveur voit qui a lu votre carte, où et quand, mais jamais
        son contenu médical ; ce journal n’est pas encore chiffré. Le pseudonymat des
        médecins, que seul l’Ordre pourra lever en cas d’abus, est prévu mais pas encore en place.
      </p>
    </div>
  )
}

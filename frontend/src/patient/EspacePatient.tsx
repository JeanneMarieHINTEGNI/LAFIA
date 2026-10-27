import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftIcon, ClockCounterClockwiseIcon, FoldersIcon, HandHeartIcon, QrCodeIcon } from '@phosphor-icons/react'
import { PATIENT } from './data'
import { AidantView, CompartimentsView } from './views'
import { JournalView } from './JournalView'
import { CarteView } from './CarteView'
import { useDeviceState } from './store'
import { Avatar, ChoixPhoto, CLE_PHOTO } from './Avatar'
import { nouvelIdPatient } from './carte'
import { enregistrerPatient } from '../journal/sync'
import { ScanJournalise } from '../ui/ScanJournalise'
import { RestaurerEspace, SauvegardeSecours, type Restauration } from './Secours'

const TABS = [
  { id: 'journal', short: 'Journal', label: 'Mon journal', icon: ClockCounterClockwiseIcon, title: 'Qui a ouvert votre dossier.', sub: 'Chaque lecture de votre carte : quand, où, par qui. Vérifié sur cet appareil.', View: JournalView },
  { id: 'carte', short: 'Carte', label: 'Ma carte', icon: QrCodeIcon, title: 'Votre carte.', sub: "Ce qu'un soignant lit en urgence, sans réseau.", View: CarteView },
  { id: 'lecture', short: 'Urgence', label: 'Lecture d’urgence', icon: QrCodeIcon, title: 'Lecture d’urgence.', sub: 'Ouvrir un lien QR ou coller le contenu d’une carte signée.', View: ScanJournalise },
  { id: 'compartiments', short: 'Compartiments', label: 'Mes compartiments', icon: FoldersIcon, title: 'Ce que vous montrez.', sub: 'Ce que votre carte montre en urgence, et ce qui viendra ensuite.', View: CompartimentsView },
  { id: 'aidant', short: 'Aidant', label: 'Aidant et rappels', icon: HandHeartIcon, title: 'Votre aidant et vos rappels.', sub: 'La personne qu’un soignant peut appeler en urgence. Les rappels arrivent bientôt.', View: AidantView },
] as const

// Where each piece of the record actually lives: answers "what does this space manage if nothing is on the server?".
function WhereData() {
  return (
    <div className="text-sm leading-relaxed">
      <p className="text-[#F4F1EA]/70 mb-3">Où vivent vos données</p>
      <dl className="space-y-3 text-[#F4F1EA]/45">
        <div>
          <dt className="text-[#F4F1EA]/80">Ce téléphone</dt>
          <dd>Votre profil, votre photo, votre carte et une copie de votre journal.</dd>
        </div>
        <div>
          <dt className="text-[#F4F1EA]/80">Votre carte</dt>
          <dd>Vos informations d’urgence, signées par un soignant. Elles se lisent sans réseau.</dd>
        </div>
        <div>
          <dt className="text-[#F4F1EA]/80">Le serveur</dt>
          <dd>Le journal des lectures de votre carte. Jamais vos informations d’urgence. Plus tard : votre dossier complet.</dd>
        </div>
      </dl>
    </div>
  )
}

type PatientProfile = {
  firstName: string
  lastName: string
  fullName: string
  birthYear: string
  /** Identifiant Lafia : pseudonyme ALÉATOIRE généré sur le téléphone (contrat D5). Ce n'est ni le NPI ni un numéro saisi. */
  healthId: string
}

const DEFAULT_PROFILE: PatientProfile = {
  firstName: '',
  lastName: '',
  fullName: '',
  birthYear: '',
  healthId: '',
}

const ID_LAFIA = /^p-[0-9a-f]{8,16}$/
const champ = 'mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[#F4F1EA] outline-none focus:border-[#4FB3AC]'

function isLegacyDemoProfile(profile: PatientProfile) {
  return profile.firstName === PATIENT.name && profile.fullName === PATIENT.fullName && profile.birthYear === PATIENT.born && profile.healthId === PATIENT.healthId
}

function hasCompleteProfile(profile: PatientProfile) {
  return Boolean(profile.fullName.trim() && profile.birthYear.trim())
}

/** Réutilise l'identifiant de la carte s'il existe déjà, sinon en crée un ; la carte et le profil partagent le même. */
function identifiantLafia(actuel: string): string {
  if (ID_LAFIA.test(actuel)) return actuel
  try {
    const carte = JSON.parse(localStorage.getItem('lafia:c0-id') ?? '""') as string
    if (ID_LAFIA.test(carte)) return carte
  } catch { /* stockage indisponible */ }
  const id = nouvelIdPatient()
  try { localStorage.setItem('lafia:c0-id', JSON.stringify(id)) } catch { /* stockage indisponible */ }
  return id
}

export default function EspacePatient({ tab }: { tab: string }) {
  const [stored, setProfile] = useDeviceState<Partial<PatientProfile>>('patient-profile', DEFAULT_PROFILE)
  // Profil stocké incomplet ou ancien : on complète avec des champs vides plutôt que de planter.
  const profile: PatientProfile = useMemo(() => ({ ...DEFAULT_PROFILE, ...stored }), [stored])
  const [photo, setPhoto] = useDeviceState(CLE_PHOTO, '')
  const [draft, setDraft] = useState<PatientProfile>(profile)
  const [draftPhoto, setDraftPhoto] = useState(photo)
  const [editPhoto, setEditPhoto] = useState(false)
  const [error, setError] = useState('')
  const [restaure, setRestaure] = useState<Restauration | null>(null)
  const [mode, setMode] = useState<'choix' | 'creer' | 'retrouver'>('choix')
  const current = TABS.find(t => t.id === tab) ?? TABS[0]
  const ready = hasCompleteProfile(profile)

  useEffect(() => {
    setDraft(profile)
  }, [profile])

  useEffect(() => {
    if (isLegacyDemoProfile(profile)) {
      setProfile(DEFAULT_PROFILE)
      setDraft(DEFAULT_PROFILE)
      setError('')
    } else if (hasCompleteProfile(profile) && !ID_LAFIA.test(profile.healthId)) {
      // Anciens profils : l'« identifiant santé » était saisi à la main. On le remplace par l'identifiant Lafia.
      setProfile({ ...profile, healthId: identifiantLafia(profile.healthId) })
    }
  }, [profile, setProfile])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [current.id])

  const saveProfile = () => {
    const firstName = draft.firstName.trim()
    const lastName = draft.lastName.trim()
    const birthYear = draft.birthYear.trim()
    const year = Number(birthYear)
    if (!firstName || !lastName || !birthYear) {
      setError('Renseignez votre prénom, votre nom et votre année de naissance.')
      return
    }
    if (!/^\d{4}$/.test(birthYear) || year < 1900 || year > new Date().getFullYear()) {
      setError('Année de naissance invalide (4 chiffres, par exemple 1992).')
      return
    }
    setPhoto(draftPhoto)
    const healthId = identifiantLafia(draft.healthId)
    setProfile({ firstName, lastName, fullName: `${firstName} ${lastName}`, birthYear, healthId })
    // Réserve l'identifiant auprès du serveur dès la création (avant qu'une carte ne le rende public). Hors ligne : réessayé plus tard.
    void enregistrerPatient(healthId)
    setError('')
  }

  if (!ready) {
    const carteChoix = 'rounded-2xl border border-white/10 bg-black/15 p-5 text-left'
    return (
      <div className="min-h-screen bg-[#0A1615] px-5 py-24 text-[#F4F1EA] sm:px-10">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-[#F4F1EA]/45">Espace patient</p>
          <h1 className="mt-4 font-display text-4xl font-light">Votre espace</h1>

          {mode === 'choix' && (
            <>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className={carteChoix}>
                  <p className="text-[17px] text-[#F4F1EA]">Créer votre espace</p>
                  <p className="mt-1 text-sm text-[#F4F1EA]/60">Première fois sur ce téléphone.</p>
                  <button type="button" onClick={() => setMode('creer')} className="mt-4 rounded-full bg-[#F2A93B] px-5 py-2.5 text-sm font-medium text-[#0A1615] hover:bg-[#f5b85a]">Créer mon espace</button>
                </div>
                <div className={carteChoix}>
                  <p className="text-[17px] text-[#F4F1EA]">Retrouver votre espace</p>
                  <p className="mt-1 text-sm text-[#F4F1EA]/60">Vous aviez déjà un espace sur un autre téléphone. Il vous faut votre code de secours.</p>
                  <button type="button" onClick={() => setMode('retrouver')} className="mt-4 rounded-full border border-white/15 px-5 py-2.5 text-sm text-[#F4F1EA]/85 hover:border-[#4FB3AC]">Retrouver mon espace</button>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-[#D9534A]/30 bg-[#D9534A]/10 p-4">
                <p className="text-sm text-[#F4F1EA]">Vous voulez lire la carte d’urgence de quelqu’un ?</p>
                <p className="mt-1 text-xs text-[#F4F1EA]/60">Pas besoin d’espace : le lecteur s’ouvre directement.</p>
                <a href="/#/lire" className="mt-3 inline-block rounded-full bg-[#F4F1EA] px-4 py-2 text-sm font-medium text-[#0A1615]">Lire une carte d’urgence</a>
              </div>
              <p className="mt-6 text-xs leading-relaxed text-[#F4F1EA]/45">
                Scanner une carte ne donne jamais accès à l’espace d’un patient : seulement à ses informations d’urgence,
                et cette lecture est inscrite dans son journal.
              </p>
            </>
          )}

          {mode === 'retrouver' && (
            <div className="mt-8">
              <RestaurerEspace
                onAnnuler={() => setMode('choix')}
                onRestaure={r => {
                  setRestaure(r)
                  setDraft(d => ({ ...d, healthId: r.id, birthYear: d.birthYear || r.anneeNaissance || '' }))
                  setMode('creer')
                }}
              />
            </div>
          )}

          {mode === 'creer' && (
            <>
              {restaure ? (
                <div role="status" className="mt-8 rounded-xl border border-[#4FB3AC]/40 bg-[#4FB3AC]/10 p-4 text-sm text-[#C8F3EE]">
                  <p>Espace retrouvé : identifiant Lafia <span className="font-mono whitespace-nowrap">{restaure.id}</span>.</p>
                  <p className="mt-1 text-[#F4F1EA]/65">
                    {restaure.avecCarte ? 'Votre carte signée et votre profil d’urgence sont revenus sur ce téléphone. ' : ''}
                    Votre historique de lectures est de nouveau accessible. Indiquez votre prénom et votre nom (ils restent sur ce téléphone), puis validez.
                  </p>
                </div>
              ) : (
                <button type="button" onClick={() => setMode('choix')} className="mt-6 text-sm text-[#F4F1EA]/55 hover:text-[#F4F1EA]">← Retour</button>
              )}

              <p className="mt-8 text-[15px] text-[#F4F1EA]/85">{restaure ? 'Dernière étape : votre nom' : 'Créer votre espace sur ce téléphone'}</p>
              <p className="mt-1 text-sm leading-relaxed text-[#F4F1EA]/60">
                Ces informations restent sur ce téléphone. Elles servent à vous reconnaître dans votre espace ; elles ne sont pas mises dans le QR.
              </p>

              <div className="mt-6">
                <ChoixPhoto photo={draftPhoto} nom={`${draft.firstName} ${draft.lastName}`} onChange={setDraftPhoto} />
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-[#F4F1EA]/65">
                  Prénom
                  <input autoComplete="given-name" value={draft.firstName} onChange={e => setDraft({ ...draft, firstName: e.target.value })} className={champ} placeholder="Prénom" />
                </label>
                <label className="text-sm text-[#F4F1EA]/65">
                  Nom
                  <input autoComplete="family-name" value={draft.lastName} onChange={e => setDraft({ ...draft, lastName: e.target.value })} className={champ} placeholder="Nom" />
                </label>
                <label className="text-sm text-[#F4F1EA]/65">
                  Année de naissance
                  <input inputMode="numeric" maxLength={4} value={draft.birthYear} onChange={e => setDraft({ ...draft, birthYear: e.target.value })} className={champ} placeholder="1992" />
                </label>
              </div>

              {!restaure && (
                <div className="mt-6 rounded-xl border border-white/10 bg-black/15 p-4 text-sm text-[#F4F1EA]/60">
                  <p className="text-[#F4F1EA]/85">Votre identifiant Lafia sera créé automatiquement.</p>
                  <p className="mt-1">C’est un numéro aléatoire qui ne révèle rien sur vous. Nous ne demandons ni votre NPI ni votre numéro de carte d’identité.</p>
                </div>
              )}

              {error && <p role="alert" className="mt-4 rounded-lg border border-[#D9534A]/40 bg-[#D9534A]/10 px-3 py-2 text-sm text-[#FFB5AC]">{error}</p>}

              <button type="button" onClick={saveProfile} className="mt-8 rounded-full bg-[#F2A93B] px-5 py-2.5 text-sm font-medium text-[#0A1615] hover:bg-[#f5b85a]">
                {restaure ? 'Ouvrir mon espace' : 'Créer mon espace'}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-[#0A1615] pb-32 md:pb-16">
      <div className="patient-halo fixed inset-0 pointer-events-none" aria-hidden />
      <header className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-5 sm:px-8 md:px-10 py-4 sm:py-5 bg-[#0A1615]/75 backdrop-blur-md border-b border-white/5">
        <a href="/#top" className="lg lg-button flex items-center gap-2 text-sm text-[#F4F1EA]/80 hover:text-[#F4F1EA] pl-3 pr-4 py-2">
          <ArrowLeftIcon size={16} weight="light" />
          <span className="font-display tracking-wide uppercase text-[#F4F1EA]">Lafia</span>
        </a>
        <p className="lg lg-pill text-sm text-[#F4F1EA]/70 px-4 py-2">Espace patient</p>
      </header>

      <div className="relative px-5 sm:px-10 md:px-14 pt-28 md:pt-36 grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-12">
        <aside className="hidden md:block md:col-span-3">
          <div className="sticky top-32">
            <button type="button" onClick={() => setEditPhoto(e => !e)} className="group relative" aria-label="Changer la photo">
              <Avatar photo={photo} nom={profile.fullName} taille={88} />
              <span className="absolute -bottom-1 -right-1 rounded-full bg-[#0A1615] px-2 py-0.5 text-[10px] text-[#F4F1EA]/60 ring-1 ring-white/15 group-hover:text-[#F4F1EA]">modifier</span>
            </button>
            {editPhoto && <div className="mt-4"><ChoixPhoto photo={photo} nom={profile.fullName} onChange={p => { setPhoto(p); setEditPhoto(false) }} taille={56} /></div>}
            <p className="font-display font-light text-3xl text-[#F4F1EA] mt-5">Bonjour {profile.firstName || 'Patient'}</p>
            <p className="text-sm text-[#F4F1EA]/40 mt-2">Identifiant Lafia <span className="font-mono whitespace-nowrap">{profile.healthId}</span></p>
            <nav className="mt-10 border-t border-white/10">
              {TABS.map(t => (
                <a
                  key={t.id}
                  href={`/#/espace/${t.id}`}
                  className={`flex items-center gap-3 py-4 border-b border-white/10 text-[15px] transition-colors ${
                    t.id === current.id ? 'text-[#F4F1EA]' : 'text-[#F4F1EA]/45 hover:text-[#F4F1EA]/80'
                  }`}
                >
                  <t.icon size={18} weight={t.id === current.id ? 'duotone' : 'light'} />
                  {t.label}
                </a>
              ))}
            </nav>
            <div className="mt-10">
              <WhereData />
            </div>
            <div className="mt-10 border-t border-white/10 pt-8">
              <SauvegardeSecours id={profile.healthId} />
            </div>
          </div>
        </aside>

        <main className="md:col-span-9 min-w-0">
          <div className="md:hidden mb-10 flex items-center gap-4">
            <button type="button" onClick={() => setEditPhoto(e => !e)} aria-label="Changer la photo"><Avatar photo={photo} nom={profile.fullName} taille={56} /></button>
            <div>
              <p className="font-display font-light text-2xl text-[#F4F1EA]">Bonjour {profile.firstName || 'Patient'}</p>
              <p className="text-xs text-[#F4F1EA]/40">Identifiant Lafia <span className="font-mono whitespace-nowrap">{profile.healthId}</span></p>
            </div>
          </div>
          {editPhoto && <div className="md:hidden mb-10"><ChoixPhoto photo={photo} nom={profile.fullName} onChange={p => { setPhoto(p); setEditPhoto(false) }} taille={56} /></div>}
          <h1 className="font-display font-light leading-[0.98] tracking-[-0.03em] text-[clamp(2.2rem,4.4vw,4rem)] text-[#F4F1EA]">{current.title}</h1>
          <p className="text-[15px] sm:text-base text-[#F4F1EA]/55 mt-4 mb-12 max-w-xl">{current.sub}</p>
          <current.View />
          <div className="md:hidden mt-16 border-t border-white/10 pt-8">
            <WhereData />
          </div>
          <div className="md:hidden mt-10 border-t border-white/10 pt-8">
            <SauvegardeSecours id={profile.healthId} />
          </div>
        </main>
      </div>

      <nav className="lg lg-pill md:hidden fixed bottom-3 left-3 right-3 z-[60] grid grid-cols-5">
        {TABS.map(t => (
          <a
            key={t.id}
            href={`/#/espace/${t.id}`}
            className={`flex flex-col items-center gap-1 py-3 text-[11px] ${t.id === current.id ? 'text-[#F4F1EA]' : 'text-[#F4F1EA]/45'}`}
          >
            <t.icon size={21} weight={t.id === current.id ? 'duotone' : 'light'} />
            {t.short}
          </a>
        ))}
      </nav>
    </div>
  )
}
import { useEffect, useState, type ReactNode } from 'react'
import { ListIcon, UserCircleIcon, XIcon } from '@phosphor-icons/react'
import Intro from './Intro'
import { ChipLayer } from './Chip3D'
import Probleme from './sections/Probleme'
import Compartiments from './sections/Compartiments'
import Urgence from './sections/Urgence'
import Journal from './sections/Journal'
import IA from './sections/IA'
import Final from './sections/Final'
import EspacePatient from './patient/EspacePatient'
import { ScanJournalise } from './ui/ScanJournalise'
import EspaceSoignant from './soignant/EspaceSoignant'
import { Wordmark } from './Logo'
import { useDeviceState } from './patient/store'
import { Avatar, CLE_PHOTO } from './patient/Avatar'
const NAV_ITEMS = [
  { label: 'Dossier', href: '#compartiments' },
  { label: 'Urgence', href: '#urgence' },
  { label: 'Journal', href: '#journal' },
  { label: 'IA', href: '#ia' },
  { label: 'Contact', href: '#final' },
]

// Lafia mark: the signed-QR motif from the presentation, amber corner block.
function Logo() {
  const cells = [
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
    [3, 0, 0], [2, 1, 0], [3, 2, 0], [0, 3, 0], [2, 3, 0], [3, 3, 0],
  ]
  return (
    <svg width="24" height="24" viewBox="0 0 4 4" aria-hidden>
      {cells.map(([x, y, amber]) => (
        <rect key={`${x}${y}`} x={x + 0.08} y={y + 0.08} width="0.84" height="0.84" rx="0.12" fill={amber ? '#F2A93B' : '#F4F1EA'} />
      ))}
    </svg>
  )
}

function AccountButton() {
  // Photo et prénom du patient si son espace existe sur ce téléphone ; sinon l'icône générique.
  const [photo] = useDeviceState(CLE_PHOTO, '')
  const [profil] = useDeviceState<{ fullName?: string; firstName?: string }>('patient-profile', {})
  return (
    <a href="/#/espace" className="lg lg-button flex items-center gap-2 text-[#F4F1EA]/85 text-sm font-medium pl-1.5 pr-4 py-1.5 hover:text-white">
      {photo || profil.fullName ? (
        <Avatar photo={photo} nom={profil.fullName ?? ''} taille={28} />
      ) : (
        <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
          <UserCircleIcon size={18} weight="light" />
        </span>
      )}
      {profil.firstName ? 'Mon espace' : 'Espace patient'}
    </a>
  )
}

/** Accès direct au lecteur d'urgence, sans espace patient. */
function ReaderButton() {
  return (
    <a href="/#/lire" className="lg lg-button flex items-center gap-2 text-[#F4F1EA]/85 text-sm font-medium px-4 py-1.5 hover:text-white">
      Lire une carte
    </a>
  )
}

/** Espace soignant : mise à jour des cartes depuis le téléphone du soignant. */
function SoignantButton() {
  return (
    <a href="/#/soignant" className="lg lg-button flex items-center gap-2 text-[#F4F1EA]/85 text-sm font-medium px-4 py-1.5 hover:text-white">
      Soignant
    </a>
  )
}

function StartButton() {
  return (
    <a href="#contact" className="bg-[#F2A93B] text-[#0A1615] text-sm font-medium px-5 py-2 rounded-full hover:bg-[#f5b85a] transition-colors">
      Demander une démo
    </a>
  )
}

// Highlights the nav pill of the section crossing the middle of the viewport.
function useActiveSection() {
  const [active, setActive] = useState('')
  useEffect(() => {
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) if (e.isIntersecting) setActive(`#${e.target.id}`)
      },
      { rootMargin: '-50% 0px -50% 0px' },
    )
    for (const sel of ['#top', ...NAV_ITEMS.map(i => i.href)]) {
      const el = document.querySelector(sel)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [])
  return active
}

// Edge lensing for the liquid glass navbar. Only Chromium renders SVG filters in backdrop-filter,
// and @supports cannot detect it (Safari accepts the syntax and draws nothing), hence the `lg-refract` class set in main.tsx.
function GlassFilter() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <filter id="lg-distort" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="n" />
        <feGaussianBlur in="n" stdDeviation="2" result="s" />
        <feDisplacementMap in="SourceGraphic" in2="s" scale="18" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}

// Tiny hash router: "#/espace/<tab>" opens the patient space, any other hash is the landing (and its anchors).
function useHash() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export default function App() {
  const hash = useHash()
  // Contrat : tout fragment « #L2… » va au lecteur, qui reçoit le fragment ENTIER (unpack sait lire « #L2:… » et « #L2B:… »).
  if (hash.startsWith('#L2')) return <LecteurPage><ScanJournalise initialText={hash} /></LecteurPage>
  if (hash.startsWith('#L1:')) return <LecteurPage><AncienneCarte /></LecteurPage>
  // Lecteur public : un soignant ou un passant lit une carte SANS créer d'espace patient (QR texte « L2: » compris).
  if (hash.startsWith('#/lire')) return <LecteurPage><ScanJournalise /></LecteurPage>
  if (hash.startsWith('#/soignant')) return <EspaceSoignant />
  if (hash.startsWith('#/espace')) return <EspacePatient tab={hash.split('/')[2] ?? ''} />
  return <Landing />
}

// Page plein écran du lecteur, quand la carte est ouverte depuis l'appareil photo d'un téléphone.
function LecteurPage({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#0A1615] px-5 pb-16 pt-12 text-[#F4F1EA] sm:px-10">
      <div className="mx-auto max-w-3xl">
        <a href="/" className="text-sm text-[#F4F1EA]/55 hover:text-[#F4F1EA]">Lafia</a>
        <h1 className="mb-6 mt-4 font-display text-4xl font-light">Lecture d’urgence</h1>
        {children}
        <p className="mt-10 border-t border-white/10 pt-6 text-sm text-[#F4F1EA]/50">
          Vous êtes soignant et voulez mettre à jour la carte ? <a href="/#/soignant" className="text-[#4FB3AC] underline underline-offset-4">Espace soignant</a>
        </p>
      </div>
    </main>
  )
}

// Ancien format L1 (avant le contrat v2) : sa signature n'était pas rattachée au registre, on ne l'affiche pas.
function AncienneCarte() {
  return (
    <p role="alert" className="rounded-xl border border-[#F2A93B]/40 bg-[#F2A93B]/10 px-4 py-3 text-[#F2A93B]">
      Cette carte utilise un ancien format qui n’est plus accepté : aucune donnée n’est affichée. Le patient doit faire signer une nouvelle carte par un soignant.
    </p>
  )
}

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false)
  const active = useActiveSection()

  return (
    <div className="min-h-screen bg-[#0A1615]">
      <GlassFilter />
      <nav className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-5 sm:px-8 md:px-10 py-4 sm:py-5">
           <a href="#top" aria-label="Lafia, retour en haut" className="flex items-center">
            <Wordmark surFond="sombre" size={30} />
           </a>

        <div className="lg lg-pill lg-distort hidden 2xl:flex px-1.5 py-1.5 items-center gap-0.5">
          {NAV_ITEMS.map(item => (
            <a
              key={item.href}
              href={item.href}
              className={`text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${
                active === item.href ? 'bg-[#F4F1EA] text-[#0A1615]' : 'text-[#F4F1EA]/70 hover:text-white'
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>

        <div className="hidden lg:flex lg:ml-auto 2xl:ml-0 items-center gap-2">
          <ReaderButton />
          <SoignantButton />
          <AccountButton />
          <StartButton />
        </div>

        <button
          className="2xl:hidden ml-3 text-white p-2 relative w-8 h-8 flex items-center justify-center"
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(o => !o)}
        >
          <span className={`absolute transition-all duration-300 ${menuOpen ? 'opacity-100 rotate-0' : 'opacity-0 -rotate-90'}`}>
            <XIcon size={22} weight="light" />
          </span>
          <span className={`absolute transition-all duration-300 ${menuOpen ? 'opacity-0 rotate-90' : 'opacity-100 rotate-0'}`}>
            <ListIcon size={22} weight="light" />
          </span>
        </button>
      </nav>

      <div
        className={`fixed inset-0 z-[54] bg-black/60 backdrop-blur-sm 2xl:hidden transition-opacity duration-300 ${menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMenuOpen(false)}
      />

      <div
        className={`fixed top-0 left-0 right-0 z-[55] bg-[#0A1615]/[0.98] backdrop-blur-xl pt-20 pb-8 px-6 border-b border-white/10 flex flex-col gap-0 2xl:hidden transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] origin-top ${
          menuOpen ? 'translate-y-0 opacity-100 scale-y-100' : '-translate-y-4 opacity-0 scale-y-95 pointer-events-none'
        }`}
      >
        {NAV_ITEMS.map((item, i) => (
          <a
            key={item.href}
            href={item.href}
            className="text-[#F4F1EA]/80 text-[17px] font-medium py-4 border-b border-white/[0.06] text-left hover:text-white transition-all duration-300"
            style={{ transitionDelay: menuOpen ? `${80 + i * 40}ms` : '0ms' }}
            onClick={() => setMenuOpen(false)}
          >
            {item.label}
          </a>
        ))}
        <div className="flex flex-wrap items-center gap-2 pt-6 transition-all duration-300" style={{ transitionDelay: menuOpen ? '300ms' : '0ms' }}>
          <ReaderButton />
          <SoignantButton />
          <AccountButton />
          <StartButton />
        </div>
      </div>

      <ChipLayer />
      <main>
        <Intro />
        {/* Content sections are transparent and sit above the traveling chip (z-5). */}
        <div className="relative z-10">
          <Probleme />
          <Compartiments />
          <Urgence />
          <Journal />
          <IA />
          <Final />
        </div>
      </main>
    </div>
  )
}
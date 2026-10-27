import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { BadgeProvider } from './ui/BadgeContext'
import { ErreurApp } from './ui/ErreurApp'
import { demarrerSynchro } from './journal/sync'
// Polices locales, sous-ensemble latin (couvre le français : accents, œ, ç, guillemets). Mises en cache hors ligne par le service worker.
import '@fontsource/inter/latin-300.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/outfit/latin-300.css'
import '@fontsource/outfit/latin-400.css'
import '@fontsource/outfit/latin-500.css'
import '@fontsource/outfit/latin-600.css'
import './index.css'

// Liquid glass: Chromium is the only engine that renders SVG filters in backdrop-filter (edge lensing).
if ((navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands?.some(b => b.brand === 'Chromium')) {
  document.documentElement.classList.add('lg-refract')
}

// Specular highlight follows the pointer on the hovered glass element: one listener, one rect read per frame.
let raf = 0
window.addEventListener(
  'pointermove',
  e => {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      const el = (e.target as Element | null)?.closest?.('.lg') as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - r.left}px`)
      el.style.setProperty('--my', `${e.clientY - r.top}px`)
    })
  },
  { passive: true },
)

// Journal partagé : envoie au serveur, en arrière-plan, les lectures enregistrées sur cet appareil.
demarrerSynchro()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErreurApp>
      <BadgeProvider>
        <App />
      </BadgeProvider>
    </ErreurApp>
  </StrictMode>,
)

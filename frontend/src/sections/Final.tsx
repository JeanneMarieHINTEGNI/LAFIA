import { useReveal } from '../useReveal'
import { Lines } from './ui'
import { EnvelopeSimpleIcon, WhatsappLogoIcon } from '@phosphor-icons/react'
import { CONTACT, lienEmail, lienWhatsapp } from '../contact'

// La carte voyageuse se pose dans la partie vide en haut de cette section (voir useChipTravel), puis la phrase de clôture et les deux boutons.
export default function Final() {
  const ref = useReveal<HTMLElement>()
  return (
    <section ref={ref} id="final" className="relative px-6 sm:px-10 md:px-14 pt-[56vh] md:pt-[56vh]">
      <h2 className="text-center font-display font-light leading-[0.98] tracking-[-0.03em] text-[clamp(2.4rem,6vw,5.6rem)] mb-10">
        <Lines lines={['Le même dossier,', 'de Cotonou à Lomé', 'à Abidjan.']} dim={[1, 2]} />
      </h2>
      <p className="r mx-auto max-w-xl text-center text-[15px] sm:text-base text-[#F4F1EA]/60 leading-relaxed mb-10" style={{ ['--i' as string]: 3 }}>
        L'objectif : s'appuyer sur des standards ouverts et sur une liste de confiance partagée entre pays, plutôt que sur le dossier d'un seul
        hôpital. Lafia ne cherche pas un monopole, mais à être le premier usager de cette infrastructure.
      </p>
      <div id="contact" className="r mx-auto max-w-xl text-center" style={{ ['--i' as string]: 4 }}>
        <p className="text-xs uppercase tracking-[0.18em] text-[#F2A93B] mb-3">Centres de santé</p>
        <p className="text-[15px] text-[#F4F1EA]/75 leading-relaxed mb-6">
          Une démonstration dans votre centre, puis un pilote avec vos soignants : badges, cartes imprimées, lecture sans réseau.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href={lienWhatsapp()} target="_blank" rel="noopener noreferrer" data-testid="contact-whatsapp"
            className="flex items-center gap-2.5 bg-[#F4F1EA] text-[#0A1615] text-sm font-medium px-6 sm:px-7 py-3 sm:py-3.5 rounded-full hover:bg-white transition-all">
            <WhatsappLogoIcon size={17} weight="regular" /> Demander une démo sur WhatsApp
          </a>
          <a href={lienEmail()} data-testid="contact-email"
            className="lg lg-button flex items-center gap-2.5 text-[#F4F1EA]/90 text-sm font-medium px-6 sm:px-7 py-3 sm:py-3.5">
            <EnvelopeSimpleIcon size={16} weight="light" /> Écrire un e-mail
          </a>
        </div>
        <p className="mt-5 text-sm text-[#F4F1EA]/50">
          {CONTACT.whatsappAffiche} · <a href={`mailto:${CONTACT.email}`} className="underline decoration-white/20 underline-offset-4 hover:text-[#F4F1EA]">{CONTACT.email}</a>
        </p>
      </div>

      <footer className="mt-40 md:mt-56 border-t border-white/10 py-10 flex flex-col md:flex-row gap-6 md:items-end justify-between text-sm">
        <div>
          <p className="font-display text-lg text-[#F4F1EA] mb-2">lafia</p>
          <p className="text-[#F4F1EA]/45 max-w-sm">L'essentiel de votre santé est sur vous, pas seulement dans un serveur.</p>
        </div>
        <p className="text-[#F4F1EA]/35">Export FHIR IPS · Projet en développement</p>
        <p className="text-[#F4F1EA]/35">Dossier fictif · Bénin · Togo</p>
      </footer>
    </section>
  )
}
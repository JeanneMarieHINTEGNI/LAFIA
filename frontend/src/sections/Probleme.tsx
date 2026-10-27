import { useReveal } from '../useReveal'
import { Label, Lines } from './ui'

// Mirrors the hero grammar: statement bottom-left, caption bottom-right, one hairline heartbeat.
export default function Probleme() {
  const ref = useReveal<HTMLElement>()
  return (
    <section ref={ref} id="probleme" className="relative px-6 sm:px-10 md:px-14 pt-40 md:pt-56 pb-32 md:pb-44">
      <Label n="01">Le problème</Label>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-12 items-end">
        <h2 className="md:col-span-8 font-display font-light leading-[0.98] tracking-[-0.03em] text-[clamp(2.4rem,5.6vw,5.2rem)]">
          <Lines lines={['Une même personne.', 'Autant de dossiers', "que d'hôpitaux traversés."]} dim={[1, 2]} />
        </h2>
        <p className="r md:col-span-4 text-[15px] sm:text-base text-[#F4F1EA]/65 leading-relaxed" style={{ ['--i' as string]: 3 }}>
          Une femme âgée tombe malade loin de son médecin, à Lomé, à Parakou ou à Abidjan. L'équipe qui la reçoit ne connaît ni ses allergies,
          ni ses traitements, ni son groupe sanguin. Elle reconstruit un dossier à partir de rien. À l'étape suivante, on recommence.
        </p>
      </div>

      <svg className="heartline mt-20 md:mt-28 w-full h-16 overflow-visible" viewBox="0 0 1200 64" preserveAspectRatio="none" aria-hidden>
        <path
          d="M0 40 H520 L540 40 L552 18 L566 58 L580 6 L594 40 H1200"
          pathLength={1}
          fill="none"
          stroke="#4FB3AC"
          strokeOpacity="0.55"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </section>
  )
}

import { useReveal } from '../useReveal'
import { Label, Lines } from './ui'

// Les trois niveaux du dossier (même vocabulaire que l'espace patient, onglet « Mes compartiments »).
// Règle du projet : tout ce qui sert en urgence se lit SANS serveur ; seul le dossier complet peut vivre sur un serveur.
const NIVEAUX: { n: string; nom: string; qui: string; texte: string; contenu: string; etat: 'En place' | 'En partie' | 'Prévu' }[] = [
  {
    n: '0',
    nom: 'L’urgence',
    qui: 'Lisible par toute personne qui tient la carte',
    texte: 'Signée par un soignant, pas chiffrée : elle se lit sans réseau et sans serveur, et chacun peut vérifier qui l’a écrite.',
    contenu: 'Allergies, groupe sanguin, traitements essentiels, personne à prévenir, trois dernières consultations.',
    etat: 'En place',
  },
  {
    n: '1',
    nom: 'Le sensible',
    qui: 'Vous seul, avec votre code. Plus tard : un médecin en urgence, et vous en êtes prévenu',
    texte: 'Chiffré sur votre téléphone. Ce que vous ne voulez pas montrer à tous reste ici, sauf si vous choisissez de le mettre sur la carte.',
    contenu: 'Par exemple : VIH, santé mentale, grossesse, addictions.',
    etat: 'En partie',
  },
  {
    n: '2',
    nom: 'Le dossier',
    qui: 'Les soignants que vous autorisez',
    texte: 'Votre dossier complet, conservé sur un serveur comme à l’hôpital. Jamais nécessaire pour lire l’urgence.',
    contenu: 'Historique, comptes rendus, examens, ordonnances.',
    etat: 'Prévu',
  },
]

export default function Compartiments() {
  const ref = useReveal<HTMLElement>()
  return (
    <section ref={ref} id="compartiments" className="relative px-6 sm:px-10 md:px-14 py-32 md:py-44">
      <Label n="02">Les trois niveaux</Label>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-12 items-end mb-16 md:mb-24">
        <h2 className="md:col-span-7 font-display font-light leading-[0.98] tracking-[-0.03em] text-[clamp(2.2rem,4.8vw,4.6rem)]">
          <Lines lines={['Une seule carte,', 'trois portes.', 'Chacune sa clé.']} dim={[1, 2]} />
        </h2>
        <p className="r md:col-span-5 text-[15px] sm:text-base text-[#F4F1EA]/65 leading-relaxed" style={{ ['--i' as string]: 3 }}>
          Tout ne se montre pas à tout le monde. Ce qui sauve une vie doit se lire en dix secondes, même sans réseau. Le reste se garde
          derrière une clé, et chaque ouverture laisse une trace que vous consultez vous-même.
        </p>
      </div>

      <ol className="border-t border-white/10">
        {NIVEAUX.map((x, i) => (
          <li key={x.n} className="r grid grid-cols-[auto_1fr] md:grid-cols-12 gap-x-6 md:gap-x-12 gap-y-3 border-b border-white/10 py-10 md:py-12" style={{ ['--i' as string]: i }}>
            <span className={`font-display font-light leading-none text-5xl md:text-7xl md:col-span-1 ${x.etat === 'Prévu' ? 'text-[#F4F1EA]/30' : 'text-[#F4F1EA]/85'}`}>{x.n}</span>
            <div className="md:col-span-4">
              <h3 className="font-display font-light text-2xl md:text-3xl text-[#F4F1EA]">{x.nom}</h3>
              <p className="mt-2 text-sm text-[#F4F1EA]/50">{x.qui}</p>
              <p className={`mt-3 text-xs tracking-[0.12em] uppercase ${x.etat === 'Prévu' ? 'text-[#F2A93B]' : 'text-[#4FB3AC]'}`}>{x.etat === 'En partie' ? 'En place pour vous · urgence médecin prévue' : x.etat}</p>
            </div>
            <div className="col-span-2 md:col-span-7 text-[15px] md:text-base leading-relaxed">
              <p className="text-[#F4F1EA]/75">{x.texte}</p>
              <p className="mt-3 text-[#F4F1EA]/45">{x.contenu}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
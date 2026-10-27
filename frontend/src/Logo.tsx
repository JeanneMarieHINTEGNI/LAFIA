// Logo LAFIA : quatre feuilles en croix, une feuille ambre.
// `surFond="sombre"` : feuilles blanches, pour les fonds verts ou noirs (nav actuelle).
// `surFond="clair"` : feuilles vertes, pour les fonds blancs.

const FEUILLE = 'M0 -3 C-10 -10 -10 -24 0 -29 C10 -24 10 -10 0 -3Z'

type Fond = 'clair' | 'sombre'

export function Logo({ size = 28, surFond = 'sombre' }: { size?: number; surFond?: Fond }) {
  const sombre = surFond === 'sombre'
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <g transform="translate(32 32)">
        <path d={FEUILLE} fill={sombre ? '#FFFFFF' : '#0F5C4D'} />
        <path d={FEUILLE} fill={sombre ? '#FFFFFF' : '#1F7A64'} transform="rotate(90)" />
        <path d={FEUILLE} fill={sombre ? '#FFFFFF' : '#0F5C4D'} transform="rotate(180)" />
        <path d={FEUILLE} fill="#E8A33D" transform="rotate(270)" />
      </g>
    </svg>
  )
}

// Logo + nom. Le nom est en minuscules : « lafia ».
export function Wordmark({ surFond = 'sombre', size = 28 }: { surFond?: Fond; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Logo size={size} surFond={surFond} />
      <span
        className="font-display font-bold leading-none tracking-tight"
        style={{ fontSize: size * 0.85, color: surFond === 'sombre' ? '#FFFFFF' : '#0F5C4D' }}
      >
        lafia
      </span>
    </span>
  )
}
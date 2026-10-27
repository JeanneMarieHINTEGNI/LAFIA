import { useMemo } from 'react'
import { encode } from 'uqr'

type QrCodeProps = {
  text: string
  size?: number
}

/** Vrai QR scannable (uqr, correction d'erreur M, marge de 4 modules). La densité affichée est la version QR (1–40). */
export default function QrCode({ text, size = 360 }: QrCodeProps) {
  const qr = useMemo(() => {
    try { return encode(text, { ecc: 'M', border: 4 }) } catch { return null }
  }, [text])

  if (!qr) return <p role="alert" className="text-sm text-red-700">Contenu trop volumineux pour un QR.</p>

  const n = qr.size
  // Version ≤ 15 : facile à scanner ; ≤ 25 : correct ; au-delà : exige un bon appareil photo et une impression nette.
  const densite = qr.version <= 15 ? ['bg-emerald-500', 'faible'] : qr.version <= 25 ? ['bg-amber-500', 'moyenne'] : ['bg-red-500', 'élevée']
  const path = qr.data.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ''))).join('')

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm print:bg-white print:p-2" style={{ width: size, maxWidth: '100%' }}>
      <svg viewBox={`0 0 ${n} ${n}`} width="100%" shapeRendering="crispEdges" className="bg-white" role="img" aria-label="QR de la carte">
        <rect width={n} height={n} fill="#fff" />
        <path d={path} fill="#000" />
      </svg>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500 print:text-black">
        <span className={`h-2 w-12 rounded ${densite[0]}`} aria-label={`densité ${densite[1]}`} />
        <span>Densité QR {densite[1]} (version {qr.version})</span>
      </div>
    </div>
  )
}

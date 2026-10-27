// Photo du patient : recadrée au carré, réduite à 320 px et recompressée en JPEG AVANT d'être gardée.
// Elle reste sur ce téléphone (stockage local). Elle n'entre pas dans le QR et n'est pas signée.

const COTE = 320
const QUALITE = 0.82
const MAX_ENTREE = 20 * 1024 * 1024   // 20 Mo : au-delà, ce n'est probablement pas une photo de téléphone

export class PhotoError extends Error {}

function charger(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new PhotoError('Image illisible. Essayez une photo JPEG ou PNG.')) }
    img.src = url
  })
}

/** Retourne une image JPEG carrée (data URL, ~20–40 Ko) centrée sur le milieu de la photo. */
export async function preparerPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new PhotoError('Ce fichier n’est pas une image.')
  if (file.size > MAX_ENTREE) throw new PhotoError('Image trop lourde (20 Mo maximum).')
  const img = await charger(file)
  const c = Math.min(img.naturalWidth, img.naturalHeight)
  if (c < 64) throw new PhotoError('Image trop petite pour reconnaître le visage.')
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = COTE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new PhotoError('Votre navigateur ne permet pas de préparer la photo.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (img.naturalWidth - c) / 2, (img.naturalHeight - c) / 2, c, c, 0, 0, COTE, COTE)
  return canvas.toDataURL('image/jpeg', QUALITE)
}

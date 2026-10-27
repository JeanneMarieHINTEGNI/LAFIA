import type { ReaderOptions } from 'zxing-wasm/reader'

/**
 * Lecture d'un QR dans une image de caméra, entièrement sur l'appareil (aucun réseau, mode avion compris).
 *
 * Deux moteurs, du plus rapide au plus robuste :
 *  1. le détecteur NATIF du téléphone (`BarcodeDetector`, présent sur Chrome Android) quand il existe ;
 *  2. zxing-wasm (zxing-cpp compilé en WebAssembly). Mesuré sur des prises difficiles (floue, inclinée, de loin, sombre,
 *     peu contrastée) : 22 sur 24 lues, contre 15 pour l'ancien zxing-js. Son moteur (.wasm) est servi par le site
 *     lui-même et mis en cache pour le hors-ligne : JAMAIS de CDN (par défaut, la bibliothèque le chargerait depuis jsDelivr).
 */

export type ImageCamera = { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }
export type Decodeur = (image: ImageCamera) => Promise<string | null>

const OPTIONS: ReaderOptions = { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 }

/** Le texte lu est-il une carte Lafia ? (un QR étranger est ignoré et la recherche continue) */
export const estCarte = (texte: string) => /(^L2:|#L2B:)/.test(texte.trim())

/** zxing-wasm. `wasmBinaire` sert aux tests (Node) ; dans le navigateur, le fichier vient du site. */
export async function decodeurWasm(wasmBinaire?: Uint8Array): Promise<Decodeur> {
  const z = await import('zxing-wasm/reader')
  if (wasmBinaire) {
    z.prepareZXingModule({ overrides: { wasmBinary: wasmBinaire.slice().buffer as ArrayBuffer }, fireImmediately: true })
  } else {
    const { default: url } = await import('zxing-wasm/reader/zxing_reader.wasm?url')
    z.prepareZXingModule({ overrides: { locateFile: (chemin: string, prefixe: string) => (chemin.endsWith('.wasm') ? url : prefixe + chemin) }, fireImmediately: true })
  }
  return async image => {
    // Le navigateur exige un vrai ImageData ; Node (tests) n'en a pas et accepte un objet de même forme.
    const entree = typeof ImageData === 'undefined' ? ({ ...image, colorSpace: 'srgb' } as unknown as ImageData)
      : image instanceof ImageData ? image : new ImageData(image.data, image.width, image.height)
    const r = await z.readBarcodes(entree, OPTIONS)
    return r.find(x => x.isValid)?.text ?? null
  }
}

type Detecteur = { detect(source: ImageData): Promise<{ rawValue: string }[]> }
type DetecteurClasse = { new (o: { formats: string[] }): Detecteur; getSupportedFormats(): Promise<string[]> }

/** Détecteur natif du téléphone, ou null s'il n'existe pas / ne connaît pas les QR. */
export async function decodeurNatif(): Promise<Decodeur | null> {
  const C = (globalThis as { BarcodeDetector?: DetecteurClasse }).BarcodeDetector
  if (!C) return null
  try {
    if (!(await C.getSupportedFormats()).includes('qr_code')) return null
    const d = new C({ formats: ['qr_code'] })
    return async image => {
      try { return (await d.detect(new ImageData(image.data, image.width, image.height)))[0]?.rawValue ?? null } catch { return null }
    }
  } catch { return null }
}

/** Natif d'abord (rapide), zxing-wasm ensuite pour l'image que le natif n'a pas lue. Lève si aucun moteur ne démarre. */
export async function creerDecodeur(): Promise<Decodeur> {
  const [natif, wasm] = await Promise.all([decodeurNatif(), decodeurWasm().catch(() => null)])
  if (natif && wasm) return async image => (await natif(image)) ?? wasm(image)
  const seul = natif ?? wasm
  if (!seul) throw new Error('aucun lecteur de QR disponible')
  return seul
}

/** Message lisible pour un échec de démarrage de la caméra. */
export function messageCamera(e: unknown): string {
  const nom = (e as { name?: string })?.name ?? ''
  if (nom === 'NotAllowedError' || nom === 'SecurityError') return 'Accès à la caméra refusé. Autorisez-le dans les réglages du navigateur, ou utilisez le texte collé.'
  if (nom === 'NotFoundError' || nom === 'OverconstrainedError') return 'Aucune caméra trouvée sur cet appareil. Utilisez le texte collé.'
  if (nom === 'NotReadableError') return 'La caméra est occupée par une autre application. Fermez-la puis réessayez.'
  return 'Le lecteur de QR n’a pas pu démarrer. Utilisez le texte collé en repli.'
}
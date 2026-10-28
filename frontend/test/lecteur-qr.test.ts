// @vitest-environment node
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { encode } from 'uqr'
import { decodeurWasm, estCarte, messageCamera, type Decodeur, type ImageCamera } from '../src/ui/lecteurQr'
import vecteurs from '../demo/vecteurs_carte.json'

// Vraies cartes signées (vecteurs partagés avec le Python) : texte L2: et lien #L2B:.
const TEXTE = vecteurs.cas.find(c => c.nom === 'complète, signée médecin')!.texte
const LIEN = vecteurs.cas.find(c => c.nom === 'lien #L2B')!.texte

/** QR rendu comme une photo : papier clair sur fond gris, `px` pixels par module, rotation en degrés. */
function photo(texte: string, { px = 5, angle = 0, flou = 0, lumiere = 1 } = {}): ImageCamera {
  const q = encode(texte, { ecc: 'M', border: 4 })
  const W = 900, H = 700, cote = q.size * px, cx = W / 2, cy = H / 2
  const a = (angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a)
  let gris = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // coordonnées dans le repère du QR (rotation inverse)
    const u = cos * (x - cx) + sin * (y - cy) + cote / 2, v = -sin * (x - cx) + cos * (y - cy) + cote / 2
    const i = Math.floor(u / px), j = Math.floor(v / px)
    gris[y * W + x] = i >= 0 && j >= 0 && i < q.size && j < q.size ? (q.data[j][i] ? 20 : 240) : 95
  }
  for (let r = 0; r < flou; r++) {                       // flou en boîte 3×3, répété
    const g2 = new Float32Array(W * H)
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      let s = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += gris[(y + dy) * W + x + dx]
      g2[y * W + x] = s / 9
    }
    gris = g2
  }
  const data = new Uint8ClampedArray(W * H * 4)
  for (let k = 0; k < W * H; k++) { const g = gris[k] * lumiere; data[k * 4] = data[k * 4 + 1] = data[k * 4 + 2] = g; data[k * 4 + 3] = 255 }
  return { data, width: W, height: H }
}

let lire: Decodeur
beforeAll(async () => {
  lire = await decodeurWasm(readFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'))
})

describe('Lecteur de QR (zxing-wasm, sur l’appareil)', () => {
  it('lit une carte nette, texte L2: et lien #L2B:', async () => {
    expect(await lire(photo(TEXTE))).toBe(TEXTE)
    expect(await lire(photo(LIEN))).toBe(LIEN)
  })
  it('lit une carte tournée de 20°', async () => {
    expect(await lire(photo(TEXTE, { angle: 20 }))).toBe(TEXTE)
  })
  it('lit une carte légèrement floue', async () => {
    expect(await lire(photo(TEXTE, { px: 6, flou: 2 }))).toBe(TEXTE)
  })
  it('lit une carte dans la pénombre', async () => {
    expect(await lire(photo(TEXTE, { lumiere: 0.3 }))).toBe(TEXTE)
  })
  it('une image sans QR ne donne rien (pas de faux positif)', async () => {
    const vide = { data: new Uint8ClampedArray(320 * 240 * 4).fill(128), width: 320, height: 240 }
    expect(await lire(vide)).toBeNull()
  })
})

describe('Règles autour du lecteur', () => {
  it('seule une carte Lafia arrête la recherche', () => {
    expect(estCarte(TEXTE)).toBe(true)
    expect(estCarte(LIEN)).toBe(true)
    expect(estCarte('https://exemple.com/menu')).toBe(false)
    expect(estCarte('WIFI:S:reseau;;')).toBe(false)
  })
  it('messages de caméra compréhensibles', () => {
    expect(messageCamera({ name: 'NotAllowedError' })).toMatch(/refusé/)
    expect(messageCamera({ name: 'NotFoundError' })).toMatch(/Aucune caméra/)
    expect(messageCamera({ name: 'NotReadableError' })).toMatch(/occupée/)
    expect(messageCamera(new Error('x'))).toMatch(/texte collé/)
  })
})

describe('Caméra : reconnaître une image noire', () => {
  it('noir ≈ 0, blanc = 255, une pièce sombre réelle reste au-dessus du seuil', async () => {
    const { luminositeMoyenne } = await import('../src/ui/ScannerQr')
    const img = (v: number) => { const d = new Uint8ClampedArray(640 * 480 * 4).fill(v); for (let i = 3; i < d.length; i += 4) d[i] = 255; return d }
    expect(luminositeMoyenne(img(0))).toBeLessThan(1)
    expect(luminositeMoyenne(img(255))).toBeGreaterThan(250)
    expect(luminositeMoyenne(img(25))).toBeGreaterThan(6)      // pénombre : pas confondue avec un volet fermé
  })
})
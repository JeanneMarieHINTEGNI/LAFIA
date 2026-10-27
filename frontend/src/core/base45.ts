const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
const IDX = new Map([...ALPHABET].map((c, i) => [c, i]))

export function b45encode(data: Uint8Array): string {
  let out = ''
  for (let i = 0; i + 1 < data.length; i += 2) {
    let n = data[i] * 256 + data[i + 1]
    const c = n % 45; n = Math.floor(n / 45)
    const d = n % 45; const e = Math.floor(n / 45)
    out += ALPHABET[c] + ALPHABET[d] + ALPHABET[e]
  }
  if (data.length % 2) {
    const v = data[data.length - 1]
    out += ALPHABET[v % 45] + ALPHABET[Math.floor(v / 45)]
  }
  return out
}

export function b45decode(s: string): Uint8Array {
  const vals = [...s].map(ch => {
    const v = IDX.get(ch)
    if (v === undefined) throw new Error('base45 invalide')
    return v
  })
  if (vals.length % 3 === 1) throw new Error('base45 invalide')
  const out: number[] = []
  for (let i = 0; i + 2 < vals.length; i += 3) {
    const n = vals[i] + vals[i + 1] * 45 + vals[i + 2] * 2025
    if (n > 0xffff) throw new Error('base45 invalide')
    out.push(n >> 8, n & 255)
  }
  if (vals.length % 3 === 2) {
    const n = vals[vals.length - 2] + vals[vals.length - 1] * 45
    if (n > 255) throw new Error('base45 invalide')
    out.push(n)
  }
  return Uint8Array.from(out)
}
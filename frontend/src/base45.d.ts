declare module 'base45-js' {
  export function encode(data: Uint8Array): string
  export function decode(value: string): number[]
}

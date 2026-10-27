import { useCallback, useState, type SetStateAction } from 'react'

// Per-device state, like the real wallet whose data stays on the phone. Storage may be unavailable
// (private window, blocked site data): the page then works from the defaults, in memory.
//
// La valeur n'est écrite qu'au moment où on la MODIFIE, jamais à la simple lecture : un composant qui ne fait que lire
// (ex. le bouton « Espace patient » de l'accueil) ne doit pas créer une entrée vide qui serait prise pour un vrai profil.
export function useDeviceState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`lafia:${key}`)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  const set = useCallback((next: SetStateAction<T>) => {
    setValue(prev => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      try {
        localStorage.setItem(`lafia:${key}`, JSON.stringify(v))
      } catch {
        /* storage unavailable: keep in memory only */
      }
      return v
    })
  }, [key])
  return [value, set] as const
}

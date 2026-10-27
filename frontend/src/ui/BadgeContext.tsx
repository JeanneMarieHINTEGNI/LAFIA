import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import nacl from 'tweetnacl'
import { badgeFromSeed, type Badge } from '../core'
import { REGISTRY, getRoleLabel, type Role } from './trust'

/** Badge chargé en mémoire de session. La clé privée n'est jamais persistée. */
export type BadgeState = Badge & {
  role: Role
  etab?: string
  label?: string
}

export type BadgeFile = { kid?: string; seed: string }
export type LoadResult = { ok: true } | { ok: false; message: string }

type BadgeContextValue = {
  badge: BadgeState | null
  role: Role | null
  roleLabel: string | null
  etab: string | null
  loadBadge: (json: BadgeFile | null) => LoadResult
  clearBadge: () => void
}

const BadgeContext = createContext<BadgeContextValue>({
  badge: null,
  role: null,
  roleLabel: null,
  etab: null,
  loadBadge: () => ({ ok: false, message: 'Aucun badge chargé.' }),
  clearBadge: () => undefined,
})

const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('')

export function BadgeProvider({ children }: { children: ReactNode }) {
  const [badge, setBadge] = useState<BadgeState | null>(null)

  const loadBadge = useCallback((json: BadgeFile | null): LoadResult => {
    if (!json || typeof json.seed !== 'string') return { ok: false, message: 'Aucun fichier de badge valide.' }
    if (!/^[0-9a-f]{64}$/i.test(json.seed)) return { ok: false, message: 'Graine de badge invalide (64 caractères hexadécimaux attendus).' }
    const derived = badgeFromSeed(json.seed.toLowerCase())
    if (json.kid && json.kid !== derived.kid) return { ok: false, message: "L'identifiant du badge ne correspond pas à sa clé." }
    const entry = REGISTRY[derived.kid]
    if (!entry) return { ok: false, message: 'Badge inconnu dans le registre de confiance.' }
    if (entry.revoked) return { ok: false, message: 'Badge révoqué.' }
    const pub = hex(nacl.sign.keyPair.fromSecretKey(derived.secretKey).publicKey)
    if (pub !== entry.pub) return { ok: false, message: 'La clé publique du badge ne correspond pas au registre.' }
    setBadge({ ...derived, role: entry.role, etab: entry.etab, label: entry.label })
    return { ok: true }
  }, [])

  const clearBadge = useCallback(() => setBadge(null), [])

  const value = useMemo<BadgeContextValue>(() => ({
    badge,
    role: badge?.role ?? null,
    roleLabel: badge ? getRoleLabel(badge.role) : null,
    etab: badge?.etab ?? null,
    loadBadge,
    clearBadge,
  }), [badge, loadBadge, clearBadge])

  return <BadgeContext.Provider value={value}>{children}</BadgeContext.Provider>
}

export function useBadge() {
  return useContext(BadgeContext)
}

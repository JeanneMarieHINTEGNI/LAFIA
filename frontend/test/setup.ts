import { beforeEach, vi } from 'vitest'

// Par défaut, les tests tournent « hors ligne » : aucun appel réseau réel. Un test qui veut un serveur remplace fetch.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('hors ligne (test)'))))
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import autorite from '../src/data/autorite.json'
import { AUTORITE_DEMO, PUB_AUTORITE_DEMO } from '../src/ui/trust'
import EspaceSoignant from '../src/soignant/EspaceSoignant'
import { BadgeProvider } from '../src/ui/BadgeContext'

describe('Autorité de démonstration', () => {
  it('le site sait qu’il fait confiance à l’autorité de démo, et le dit au soignant', () => {
    expect(AUTORITE_DEMO).toBe(autorite.pub === PUB_AUTORITE_DEMO)
    render(<BadgeProvider><EspaceSoignant /></BadgeProvider>)
    if (AUTORITE_DEMO) expect(screen.getByRole('note').textContent).toMatch(/Ne signez pas la carte d’un vrai patient/)
    else expect(screen.queryByRole('note')).toBeNull()
  })
})
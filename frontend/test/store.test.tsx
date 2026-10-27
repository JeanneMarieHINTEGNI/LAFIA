import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDeviceState } from '../src/patient/store'
import EspacePatient from '../src/patient/EspacePatient'
import { BadgeProvider } from '../src/ui/BadgeContext'

function Lecteur() {
  const [v] = useDeviceState<{ fullName?: string }>('patient-profile', {})
  return <span>{v.fullName ?? 'vide'}</span>
}

describe('Stockage de l’appareil', () => {
  beforeEach(() => localStorage.clear())

  it('lire une valeur n’écrit rien dans le stockage', () => {
    render(<Lecteur />)
    expect(localStorage.getItem('lafia:patient-profile')).toBeNull()
  })

  it('un profil stocké incomplet n’empêche pas l’espace patient de s’afficher', () => {
    localStorage.setItem('lafia:patient-profile', '{}')
    render(<BadgeProvider><EspacePatient tab="carte" /></BadgeProvider>)
    expect(screen.getByText('Créer votre espace')).toBeTruthy()
  })
})

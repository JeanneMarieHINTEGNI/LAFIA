import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CONTACT, MESSAGE_DEMO, lienEmail, lienWhatsapp } from '../src/contact'
import { BoutonVideoDemo, VIDEO_DEMO } from '../src/ui/VideoDemo'
import { EditeurCarte } from '../src/soignant/EditeurCarte'
import { BadgeProvider } from '../src/ui/BadgeContext'
import { PROFIL_VIDE, construireProfil } from '../src/patient/carte'

describe('Contact des centres de santé', () => {
  it('WhatsApp : numéro béninois à 10 chiffres au format international, message prérempli', () => {
    const url = new URL(lienWhatsapp())
    expect(url.origin + url.pathname).toBe('https://wa.me/2290140542621')
    expect(url.searchParams.get('text')).toBe(MESSAGE_DEMO)
    expect(MESSAGE_DEMO).toMatch(/centre de santé/)
  })
  it('e-mail : adresse, sujet et corps encodés', () => {
    const l = lienEmail()
    expect(l.startsWith(`mailto:${CONTACT.email}?`)).toBe(true)
    const q = new URLSearchParams(l.split('?')[1])
    expect(q.get('subject')).toMatch(/Démonstration LAFIA/)
    expect(q.get('body')).toBe(MESSAGE_DEMO)
  })
})

describe('Vidéo de démonstration', () => {
  it('s’ouvre dans une fenêtre, servie par le site, et se ferme avec Échap', () => {
    render(<BoutonVideoDemo />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Voir la démo/ }))
    const dialogue = screen.getByRole('dialog')
    expect(dialogue.querySelector('video')?.getAttribute('src')).toBe(VIDEO_DEMO)
    expect(VIDEO_DEMO.startsWith('/')).toBe(true)              // même origine : pas de lecteur tiers, CSP inchangée
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Téléphone du contact d’urgence', () => {
  it('un numéro béninois complet avec espaces (19 caractères) tient dans le champ et passe la validation', () => {
    const tel = '+229 01 97 00 00 41'
    expect(tel).toHaveLength(19)
    expect(construireProfil({ ...PROFIL_VIDE, ecNom: 'Kossi', ecTel: tel }).ec).toEqual({ n: 'Kossi', tel })
    render(<BadgeProvider><EditeurCarte profil={PROFIL_VIDE} onProfil={() => {}} consultations={[]} patientId="p-0123456789abcdef" onSigne={() => {}} /></BadgeProvider>)
    expect(Number(screen.getByPlaceholderText('+229 …').getAttribute('maxLength'))).toBeGreaterThanOrEqual(19)
  })
})
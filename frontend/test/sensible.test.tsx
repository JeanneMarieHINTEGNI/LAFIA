import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUCUN_ESSAI, CLE_COFFRE, CodeInvalide, apresEchec, codeTropSimple, fermer, lireCoffre, ouvrir, type ContenuSensible } from '../src/patient/sensible'
import { CompartimentSensible } from '../src/patient/Sensible'

const ITER = 1000                                  // rapide en test ; 310 000 en vrai
const contenu: ContenuSensible = { v: 1, elements: [{ id: 'a', code: 'VIH', note: 'Suivi au CNHU', depuis: '2019' }], maj: 1 }

describe('Compartiment sensible : chiffrement', () => {
  it('le bon code rouvre exactement le contenu ; le mauvais code échoue', async () => {
    const c = await fermer(contenu, '4827', ITER)
    expect(await ouvrir(c, '4827')).toEqual(contenu)
    await expect(ouvrir(c, '4828')).rejects.toBeInstanceOf(CodeInvalide)
  })

  it('rien n’est lisible sans le code, et chaque chiffrement est différent (sel et IV neufs)', async () => {
    const a = await fermer(contenu, '4827', ITER), b = await fermer(contenu, '4827', ITER)
    expect(JSON.stringify(a)).not.toMatch(/VIH|CNHU|2019/)
    expect(atob(a.ct)).not.toMatch(/VIH|CNHU/)
    expect(a.sel).not.toBe(b.sel); expect(a.iv).not.toBe(b.iv); expect(a.ct).not.toBe(b.ct)
  })

  it('un coffre modifié est refusé (intégrité AES-GCM)', async () => {
    const c = await fermer(contenu, '4827', ITER)
    const octets = Uint8Array.from(atob(c.ct), x => x.charCodeAt(0)); octets[0] ^= 1
    await expect(ouvrir({ ...c, ct: btoa(String.fromCharCode(...octets)) }, '4827')).rejects.toBeInstanceOf(CodeInvalide)
  })

  it('codes refusés : trop courts, pas des chiffres, trop faciles', async () => {
    await expect(fermer(contenu, '123', ITER)).rejects.toBeInstanceOf(CodeInvalide)
    await expect(fermer(contenu, '12a4', ITER)).rejects.toBeInstanceOf(CodeInvalide)
    for (const k of ['0000', '1234', '9876', '111111', '123456']) expect(codeTropSimple(k)).toBe(true)
    expect(codeTropSimple('4827')).toBe(false)
  })

  it('pause croissante après 5 codes faux', () => {
    let e = AUCUN_ESSAI
    for (let i = 0; i < 4; i++) e = apresEchec(e, 0)
    expect(e).toEqual({ faux: 4, jusqua: 0 })
    e = apresEchec(e, 0); expect(e.jusqua).toBe(30_000)
    e = apresEchec(e, 0); expect(e.jusqua).toBe(60_000)
    for (let i = 0; i < 20; i++) e = apresEchec(e, 0)
    expect(e.jusqua).toBe(3600_000)                                // plafond : 1 heure
  })
})

describe('Compartiment sensible : écran', () => {
  beforeEach(() => localStorage.clear())
  const taper = (label: string | RegExp, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } })

  it('créer, ajouter, refermer, rouvrir avec le code ; le stockage ne contient que du chiffré', async () => {
    render(<CompartimentSensible iterations={ITER} />)
    fireEvent.click(screen.getByRole('button', { name: /Créer mon compartiment sensible/ }))
    taper('Code', '1234'); taper('Encore une fois', '1234')
    fireEvent.click(screen.getByRole('button', { name: 'Créer avec ce code' }))
    expect(screen.getByRole('alert').textContent).toMatch(/trop facile/)
    taper('Code', '4827'); taper('Encore une fois', '4827')
    fireEvent.click(screen.getByRole('button', { name: 'Créer avec ce code' }))
    await screen.findByTestId('sensible-ouvert')
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Santé mentale' }))
    fireEvent.change(screen.getByPlaceholderText(/Traitement, médecin/), { target: { value: 'Suivi au CNHU' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await screen.findByText('Suivi au CNHU')
    expect(localStorage.getItem(CLE_COFFRE)).not.toMatch(/CNHU|Santé|PSY/)

    fireEvent.click(screen.getByRole('button', { name: /Refermer/ }))
    expect(screen.queryByText('Suivi au CNHU')).toBeNull()
    taper('Votre code', '0001')
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir/ }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Code incorrect \(1 essai\)/)
    taper('Votre code', '4827')
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir/ }))
    await screen.findByText('Suivi au CNHU')
    expect(await ouvrir(lireCoffre()!, '4827')).toMatchObject({ elements: [{ code: 'PSY', note: 'Suivi au CNHU' }] })
  })

  it('se referme seul après 2 minutes sans toucher, et quand on quitte l’application', async () => {
    localStorage.setItem(CLE_COFFRE, JSON.stringify(await fermer(contenu, '4827', ITER)))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(<CompartimentSensible iterations={ITER} />)
      taper('Votre code', '4827')
      fireEvent.click(screen.getByRole('button', { name: /Ouvrir/ }))
      await screen.findByText('Suivi au CNHU')
      act(() => { vi.advanceTimersByTime(121_000) })
      expect(screen.queryByText('Suivi au CNHU')).toBeNull()

      taper('Votre code', '4827')
      fireEvent.click(screen.getByRole('button', { name: /Ouvrir/ }))
      await screen.findByText('Suivi au CNHU')
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      act(() => { document.dispatchEvent(new Event('visibilitychange')) })
      expect(screen.queryByText('Suivi au CNHU')).toBeNull()
    } finally {
      vi.useRealTimers()
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    }
  })

  it('code oublié : on peut seulement tout effacer', async () => {
    localStorage.setItem(CLE_COFFRE, JSON.stringify(await fermer(contenu, '4827', ITER)))
    render(<CompartimentSensible iterations={ITER} />)
    fireEvent.click(screen.getByRole('button', { name: 'Code oublié ?' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tout effacer' }))
    await waitFor(() => expect(localStorage.getItem(CLE_COFFRE)).toBeNull())
    expect(screen.getByRole('button', { name: /Créer mon compartiment sensible/ })).toBeTruthy()
  })
})
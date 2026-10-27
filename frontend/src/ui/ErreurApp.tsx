import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Si un écran plante, on affiche l'erreur et un bouton de rechargement au lieu d'une page noire. */
export class ErreurApp extends Component<{ children: ReactNode }, { erreur: Error | null }> {
  state = { erreur: null as Error | null }

  static getDerivedStateFromError(erreur: Error) {
    return { erreur }
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    console.error('[Lafia] écran interrompu :', erreur, info.componentStack)
  }

  render() {
    const { erreur } = this.state
    if (!erreur) return this.props.children
    return (
      <main role="alert" className="min-h-screen bg-[#0A1615] px-6 py-16 text-[#F4F1EA]">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-3xl font-light">Un problème est survenu</h1>
          <p className="mt-3 text-[#F4F1EA]/70">Rechargez la page. Si le problème persiste, envoyez ce message à l’équipe Lafia :</p>
          <pre className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-white/5 p-3 text-xs text-[#F4F1EA]/80">{erreur.message}{'\n\n'}{navigator.userAgent}</pre>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => location.reload()} className="rounded-full bg-[#F4F1EA] px-5 py-2.5 text-sm font-medium text-[#0A1615]">Recharger</button>
            <a href="/" className="rounded-full border border-white/20 px-5 py-2.5 text-sm">Retour à l’accueil</a>
          </div>
        </div>
      </main>
    )
  }
}

import { renderSVG } from 'uqr'
import type { Verified } from '../core'
import { ALERTES, ALLERGENS, ANTECEDENTS, MEDS, ROLE_LABEL, label } from '../ui/labels'

type Ok = Extract<Verified, { ok: true }>

/**
 * Carte d'urgence imprimable, au format carte bancaire (ISO ID-1 : 85,6 × 54 mm), sur une feuille A4 :
 * recto (QR) et verso (résumé lisible sans téléphone) côte à côte, à découper puis plier en deux.
 *
 * Le verso imprimé n'est PAS vérifiable (n'importe qui peut écrire sur un papier) : il est utile quand personne ne
 * peut scanner, mais le QR signé fait foi, et c'est écrit sur la carte. Le nom et le résumé sont au choix du patient.
 */
export type OptionsImpression = {
  /** Texte du QR : lien `…#L2B:…` (s'ouvre avec l'appareil photo) ou `L2:…`. */
  qr: string
  carte: Ok
  etablissements: Record<string, string>
  /** Nom à imprimer ; vide = pas de nom sur la carte. */
  nom?: string
  /** Résumé lisible sans téléphone au verso. */
  avecResume: boolean
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const jour = (t: number) => new Date(t * 1000).toLocaleDateString('fr-FR')

/** Lignes du résumé, dans l'ordre de lecture en urgence. Trois états pour les allergies, comme à l'écran. */
export function lignesResume(c: Ok): { titre: string; texte: string; fort?: boolean }[] {
  const pr = c.payload.pr ?? {}
  const lignes: { titre: string; texte: string; fort?: boolean }[] = []
  lignes.push({
    titre: 'Allergies',
    texte: pr.al === undefined ? 'non renseigné (ne pas supposer l’absence)' : pr.al.length ? pr.al.map(a => label(ALLERGENS, a)).join(', ') : 'aucune connue',
    fort: Boolean(pr.al?.length),
  })
  if (pr.gs) lignes.push({ titre: 'Groupe sanguin', texte: `${pr.gs} (contrôle prétransfusionnel obligatoire)` })
  // La personne à prévenir passe AVANT la liste des points d'attention : courte et toujours utile, elle ne doit pas
  // être perdue quand une longue liste est raccourcie pour tenir au verso.
  if (pr.ec) lignes.push({ titre: 'Prévenir', texte: `${pr.ec.n} · ${pr.ec.tel}` })
  const alertes = [...(pr.tx ?? []).map(t => t.c), ...(pr.ah ?? [])].filter(a => ALERTES[a])
  if (alertes.length) lignes.push({ titre: 'Attention', texte: alertes.map(a => `${label(MEDS, a) === a ? label(ANTECEDENTS, a) : label(MEDS, a)} (${ALERTES[a]})`).join(' ; '), fort: true })
  return lignes
}

// Le verso a une place fixe (54 mm de haut) : un texte trop long serait COUPÉ sans prévenir, ce qui est dangereux.
// Au-delà de DENSE caractères on passe en petit ; au-delà de MAX, on n'imprime que ce qui tient et on le dit.
const DENSE = 300, MAX = 460

export function resumeHtml(lignes: { titre: string; texte: string; fort?: boolean }[]): string {
  const total = lignes.reduce((n, l) => n + l.titre.length + l.texte.length + 3, 0)
  const gardees: typeof lignes = []
  let n = 0, coupe = false
  for (const l of lignes) {
    const taille = l.titre.length + l.texte.length + 3
    if (n + taille > MAX) {
      const reste = MAX - n - l.titre.length - 3
      if (reste > 40) gardees.push({ ...l, texte: l.texte.slice(0, reste).replace(/\s+\S*$/, '') + '…' })
      coupe = true
      break
    }
    gardees.push(l); n += taille
  }
  const li = gardees.map(l => `<li${l.fort ? ' class="fort"' : ''}><b>${esc(l.titre)} :</b> ${esc(l.texte)}</li>`).join('')
  const avis = coupe ? '<li class="fort"><b>Liste incomplète :</b> la liste complète est dans le QR.</li>' : ''
  return `<ul class="resume${total > DENSE ? ' dense' : ''}">${li}${avis}</ul>`
}

export function carteImprimableHtml(o: OptionsImpression): string {
  const qr = renderSVG(o.qr, { ecc: 'M', border: 2 })
  const c = o.carte
  const signataire = `${ROLE_LABEL[c.role] ?? c.role}${c.etab ? `, ${o.etablissements[c.etab] ?? c.etab}` : ''}`
  const nom = (o.nom ?? '').trim()
  const resume = o.avecResume ? resumeHtml(lignesResume(c)) : `<p class="sans-resume">Toutes les informations sont dans le QR, au recto. Scannez-le, même sans réseau.</p>`
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Carte d’urgence Lafia</title>
<style>
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; background: #fff;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.feuille { padding: 12mm; }
.planche { display: flex; width: 171.2mm; border: 0.3mm dashed #888; }
.face { width: 85.6mm; height: 54mm; overflow: hidden; position: relative; }
.recto { border-right: 0.3mm dotted #888; }
.bandeau { background: #c62828; color: #fff; height: 8mm; display: flex; align-items: center; justify-content: space-between;
  padding: 0 3mm; font-size: 8pt; font-weight: 700; letter-spacing: 0.06em; }
.bandeau span:last-child { font-weight: 600; letter-spacing: 0.12em; }
.corps { display: flex; gap: 2.5mm; padding: 2mm 3mm; height: 46mm; }
.qr { width: 42mm; height: 42mm; flex: none; }
.qr svg { width: 100%; height: 100%; display: block; }
.cote { display: flex; flex-direction: column; justify-content: space-between; font-size: 7pt; line-height: 1.3; }
.nom { font-size: 9pt; font-weight: 700; }
.consigne { font-size: 8pt; font-weight: 600; }
.discret { color: #555; font-size: 6.5pt; }
.verso { padding: 3mm 3.5mm; font-size: 7pt; line-height: 1.35; display: flex; flex-direction: column; }
.verso h2 { margin: 0 0 1.5mm; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #c62828; }
.resume { list-style: none; margin: 0; padding: 0; }
.resume li { margin-bottom: 0.8mm; }
.resume li.fort { color: #8e1b1b; }
.resume.dense { font-size: 6pt; line-height: 1.25; }
.sans-resume { margin: 0; }
.pied { margin-top: auto; color: #444; font-size: 6.2pt; border-top: 0.2mm solid #ccc; padding-top: 1mm; }
.reperes { display: flex; width: 171.2mm; justify-content: space-between; font-size: 7pt; color: #777; margin-top: 1mm; }
.mode { margin-top: 10mm; max-width: 171.2mm; font-size: 9.5pt; line-height: 1.5; color: #333; }
.mode h3 { font-size: 10.5pt; margin: 0 0 2mm; }
.mode ol { margin: 0; padding-left: 5mm; }
</style></head><body><div class="feuille">
<div class="planche">
  <section class="face recto" aria-label="Recto">
    <div class="bandeau"><span>URGENCE MÉDICALE</span><span>LAFIA</span></div>
    <div class="corps">
      <div class="qr">${qr}</div>
      <div class="cote">
        <div>
          ${nom ? `<div class="nom">${esc(nom)}</div>` : ''}
          <div class="consigne">Scannez ce code avec l’appareil photo d’un téléphone.</div>
        </div>
        <div>Fonctionne sans réseau.<br>Résumé médical signé par un soignant.</div>
        <div class="discret">Émise le ${jour(c.iat)}</div>
      </div>
    </div>
  </section>
  <section class="face verso" aria-label="Verso">
    <h2>À lire si personne ne peut scanner</h2>
    ${resume}
    <div class="pied">Signée par : ${esc(signataire)} · ${jour(c.iat)}. Le texte imprimé n’est pas vérifiable : le QR fait foi.<br>
    Vous avez trouvé cette carte ? Rapportez-la au centre de santé le plus proche.</div>
  </section>
</div>
<div class="reperes"><span>✂ Découper le long des tirets</span><span>Plier sur les pointillés</span></div>
<div class="mode">
  <h3>Pour la personne qui imprime</h3>
  <ol>
    <li>Imprimez à <b>taille réelle (100 %)</b>, sans « ajuster à la page ».</li>
    <li>Découpez le long des tirets, puis pliez sur les pointillés : le QR d’un côté, le résumé de l’autre.</li>
    <li>Collez les deux faces ou plastifiez la carte si possible. Vérifiez qu’elle se scanne avant de la remettre.</li>
    <li>Le patient la garde <b>sur lui</b>, avec ses papiers. À chaque mise à jour de la carte, réimprimez-la.</li>
  </ol>
</div>
</div></body></html>`
}

/** Ouvre la carte dans une nouvelle fenêtre et lance l'impression. Renvoie false si la fenêtre est bloquée. */
export function imprimerCarte(o: OptionsImpression): boolean {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(carteImprimableHtml(o))
  w.document.close()
  w.focus()
  w.print()
  return true
}
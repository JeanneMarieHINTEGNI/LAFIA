// Test sur téléphone en une commande : `bun run partage`.
// 1) sert la version de production sur ce PC (port 4173) ; 2) ouvre un tunnel HTTPS public via localhost.run (ssh, rien à installer).
// L'adresse affichée s'ouvre depuis n'importe quel téléphone, même en 4G. Elle change à chaque lancement. Ctrl+C pour tout arrêter.
// Pour la DÉMO uniquement : tant que le tunnel tourne, n'importe qui ayant l'adresse peut ouvrir le site.
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const PORT = 4173
const vite = join('node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')
const enfants = []
const arreter = () => { enfants.forEach(c => c.kill()); process.exit(0) }
process.on('SIGINT', arreter)
process.on('SIGTERM', arreter)

const preview = spawn(vite, ['preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'ignore', 'inherit'] })
enfants.push(preview)
preview.on('exit', code => { if (code) { console.error(`\n✗ Le serveur local s'est arrêté (code ${code}). Le port ${PORT} est peut-être déjà pris : fermez les autres « bun run … ».`); arreter() } })

console.log('\n⏳ Ouverture du tunnel sécurisé (quelques secondes)…')
const ssh = spawn('ssh', ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30', '-R', `80:localhost:${PORT}`, 'nokey@localhost.run'], { stdio: ['ignore', 'pipe', 'pipe'] })
enfants.push(ssh)
let trouve = false
const lire = buf => {
  const m = String(buf).match(/https:\/\/[a-z0-9-]+\.(?:lhr\.life|localhost\.run)/i)
  if (m && !trouve) {
    trouve = true
    const url = m[0] + '/'
    console.log(`
✅ Lafia est accessible à cette adresse :

     ${url}

  1. Ouvrez-la sur le PC, allez dans Espace patient → Ma carte.
     (Le champ « Adresse publique » se remplit tout seul avec cette adresse.)
  2. Créez l'espace, chargez le badge demo/secrets/medecin.json, signez la carte.
  3. Scannez le QR avec l'appareil photo du téléphone : la carte s'ouvre.

  Ctrl+C pour tout arrêter. L'adresse change à chaque lancement.
`)
  }
}
ssh.stdout.on('data', lire)
ssh.stderr.on('data', lire)
ssh.on('exit', code => {
  if (!trouve) console.error(`\n✗ Le tunnel n'a pas pu s'ouvrir (ssh, code ${code}). Vérifiez la connexion internet du PC, puis relancez.`)
  else console.error('\n✗ Le tunnel s\'est fermé. Relancez « bun run partage ».')
  arreter()
})
setTimeout(() => { if (!trouve) console.error('\n… toujours en attente du tunnel. Si rien ne vient dans 30 s, faites Ctrl+C et relancez.') }, 20000)

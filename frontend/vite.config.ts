import { defineConfig, loadEnv } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
	const useDevHttps = loadEnv(mode, process.cwd(), '').VITE_DEV_HTTPS === 'true'
	// Tunnels de test (bun run partage) : Vite refuse par défaut les noms d'hôte inconnus.
	const tunnels = ['.lhr.life', '.localhost.run', '.trycloudflare.com']
	return {
		// /api → backend Python local (uvicorn, port 8000). En production, c'est Caddy qui fait ce relais.
		server: { allowedHosts: tunnels, proxy: { '/api': 'http://127.0.0.1:8000' } },
		preview: { allowedHosts: tunnels, proxy: { '/api': 'http://127.0.0.1:8000' } },
		plugins: [
			...(useDevHttps ? [basicSsl()] : []),
			react(),
			VitePWA({
				registerType: 'autoUpdate',
				includeAssets: ['favicon.svg'],
				manifest: {
					name: 'Lafia - Dossier de santé portable',
					short_name: 'Lafia',
					description: 'Carte d’urgence et dossier de santé portable.',
					theme_color: '#0A1615',
					background_color: '#0A1615',
					display: 'standalone',
					icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
				},
				workbox: {
					navigateFallback: '/index.html',
					// wasm : moteur du lecteur de QR (zxing-wasm), indispensable pour scanner en mode avion.
					globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
					maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
				},
			}),
		],
	}
})
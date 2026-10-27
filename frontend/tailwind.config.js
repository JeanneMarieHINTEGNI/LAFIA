/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      transitionDuration: { '400': '400ms' },
      colors: {
        // Nouvelle charte santé
        vert: { DEFAULT: '#0F5C4D', doux: '#1F7A64', pale: '#E3F1EB' },
        ambre: { DEFAULT: '#E8A33D', texte: '#8A5A00', pale: '#FBEBCB' },
        alerte: { DEFAULT: '#B3261E', pale: '#FDECEA' },
        encre: '#12261F',
        gris: '#4A5F57',
        menthe: '#F1F6F3',
        // Anciennes couleurs de la landing sombre, gardées sous un nom pour les remplacer petit à petit
        foret: '#0A1615',
        creme: '#F4F1EA',
        turquoise: '#4FB3AC',
      },
    },
  },
  plugins: [],
}
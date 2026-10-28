/**
 * Coordonnées de l'équipe LAFIA pour les centres de santé (démo, pilote).
 *
 * WhatsApp : numéro béninois à 10 chiffres (format en vigueur depuis fin 2024, le « 01 » fait partie du numéro),
 * donc +229 01 40 54 26 21 → wa.me/2290140542621.
 */
export const CONTACT = {
  email: 'hintegnijeannemarie@gmail.com',
  whatsapp: '2290140542621',
  whatsappAffiche: '+229 01 40 54 26 21',
} as const

export const MESSAGE_DEMO =
  'Bonjour, je souhaite une démonstration de LAFIA pour notre centre de santé.\n' +
  'Nom du centre : \nVille : \nPersonne à contacter : '

export const lienWhatsapp = (texte = MESSAGE_DEMO) =>
  `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(texte)}`

export const lienEmail = (sujet = 'Démonstration LAFIA pour notre centre de santé', corps = MESSAGE_DEMO) =>
  `mailto:${CONTACT.email}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`
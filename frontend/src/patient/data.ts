// Demo data for the patient wallet. Fictitious patient, same story as the landing (Bassila, then Kara).
// In the real app this lives on the patient's phone, decrypted locally; the server only holds ciphertext.

export type Compartment = 0 | 1 | 2

export type Item = {
  id: string
  label: string
  value: string
  author: string
  date: string
  comp: Compartment
  // Critical for an unknown doctor in an emergency: moving it to compartment 1 hides it from the paper QR.
  critical?: boolean
}

export const PATIENT = {
  name: 'Mariam',
  fullName: 'Mariam A.',
  born: '1951',
  // HMAC(health-sector key, NPI): stable in health, useless anywhere else. The NPI itself is never stored.
  healthId: '7f3a 92c1 e04b 5d21',
}

export const ITEMS: Item[] = [
  { id: 'groupe', label: 'Groupe sanguin', value: 'O+', author: 'CHU de Parakou', date: '14/03/2026', comp: 0, critical: true },
  { id: 'allergie', label: 'Allergie', value: 'Pénicilline', author: 'CHU de Parakou', date: '14/03/2026', comp: 0, critical: true },
  { id: 'anticoag', label: 'Traitement', value: 'Acénocoumarol 4 mg, anticoagulant', author: 'CHU de Parakou', date: '02/09/2026', comp: 0, critical: true },
  { id: 'metformine', label: 'Traitement', value: 'Metformine 500 mg, matin et soir', author: 'CS de Bassila', date: '12/06/2026', comp: 0 },
  { id: 'hta', label: 'Antécédent', value: 'Hypertension artérielle', author: 'CHU de Parakou', date: '14/03/2026', comp: 0 },
  { id: 'episode', label: 'Dernier épisode', value: 'TDR paludisme positif, paracétamol donné à 11h20, référée', author: 'Relais, CS de Bassila', date: "Aujourd'hui", comp: 0 },
  { id: 'psy', label: 'Suivi', value: 'Suivi psychiatrique, sertraline 50 mg', author: 'CNHU de Cotonou', date: '28/09/2026', comp: 1 },
  { id: 'hep', label: 'Antécédent', value: 'Hépatite B chronique', author: 'CNHU de Cotonou', date: '28/09/2026', comp: 1 },
  { id: 'cr', label: 'Compte rendu', value: "Hospitalisation, CHU de Parakou", author: 'CHU de Parakou', date: 'Mars 2026', comp: 2 },
  { id: 'echo', label: 'Imagerie', value: 'Échographie cardiaque', author: 'CNHU de Cotonou', date: 'Septembre 2026', comp: 2 },
  { id: 'bio', label: 'Biologie', value: 'Bilan sanguin complet', author: 'CNHU de Cotonou', date: 'Septembre 2026', comp: 2 },
]

export type Entry = {
  when: string
  place: string
  who: string
  mode: string
  read: string
  reason?: string
  urgent?: boolean
}

// Oldest first: each entry is chained to the previous one (see chain.ts).
export const JOURNAL: Entry[] = [
  { when: '14/03/2026, 09h12', place: 'CHU de Parakou', who: 'Dr ●●●●, médecine interne', mode: 'Carte et badge, avec votre accord', read: 'Bracelet, sensible' },
  { when: '28/09/2026, 10h05', place: 'CNHU de Cotonou', who: 'Dr ●●●●, cardiologie', mode: 'Téléphone, avec votre accord', read: 'Bracelet, dossier' },
  { when: "Aujourd'hui, 11h20", place: 'CS de Bassila', who: 'Relais communautaire', mode: 'Carte', read: "Bracelet, ajout d'un épisode" },
  {
    when: "Aujourd'hui, 14h32",
    place: 'Hôpital de Kara',
    who: 'Dr ●●●●, médecine générale',
    mode: 'Bris de glace',
    read: 'Bracelet, sensible',
    reason: 'Patiente inconsciente, suspicion de paludisme grave',
    urgent: true,
  },
]

export const CAREGIVER = { name: 'Kossi A.', relation: 'Fils', phone: '+229 97 00 00 41' }

export type Reminder = { id: string; when: string; sms: string; on: boolean }

// SMS text never names the disease nor the drug: the channel is readable by the operator and by whoever holds the phone.
export const REMINDERS: Reminder[] = [
  { id: 'soir', when: 'Tous les jours, 20h', sms: 'Rappel Lafia : traitement du soir, 20h.', on: true },
  { id: 'matin', when: 'Tous les jours, 8h', sms: 'Rappel Lafia : traitement du matin, 8h.', on: true },
  { id: 'renouv', when: 'Le 12 octobre', sms: 'Rappel Lafia : renouvellement de votre ordonnance cette semaine.', on: true },
  { id: 'rdv', when: 'Le 20 octobre, 9h', sms: 'Rappel Lafia : rendez-vous au CHU de Parakou, lundi 9h.', on: false },
]

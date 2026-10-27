// Libellés d'affichage des codes du catalogue. Un code inconnu s'affiche tel quel : on n'invente jamais un libellé.
// Les codes respectent le schéma C0 (A-Z, 0-9, _ ; 2 à 12 caractères). Ajouter un code ici ne change pas le format de la carte,
// mais un lecteur qui ne connaît pas le code affichera le code brut : garder ce fichier identique côté Python.
// Contenu clinique À VALIDER par des soignants (entretiens prévus) : ce n'est pas un référentiel médical.

export const ALLERGENS: Record<string, string> = {
  PEN: 'Pénicilline', CEPHA: 'Céphalosporines', SULFA: 'Sulfamides', AINS: 'Anti-inflammatoires (AINS)', ASPIR: 'Aspirine',
  QUIN: 'Quinine', IODE: 'Produits iodés', LATEX: 'Latex', ARACH: 'Arachides',
}

export const ANTECEDENTS: Record<string, string> = {
  HTA: 'Hypertension', DIAB: 'Diabète', ASTHME: 'Asthme', EPILEP: 'Épilepsie',
  INSCARD: 'Insuffisance cardiaque', CARDIO: 'Cardiopathie / trouble du rythme', AVC: 'Antécédent d’AVC', INSREN: 'Insuffisance rénale',
  PACEM: 'Stimulateur cardiaque implanté', VALVE: 'Valve cardiaque',
  DREPANO: 'Drépanocytose', GROSSESSE: 'Grossesse en cours',
}

/** Traitements au long cours : ceux qu'un soignant doit connaître avant de prescrire en urgence. */
export const TRAITEMENTS: Record<string, string> = {
  AVK: 'Anticoagulant AVK (acénocoumarol…)', AOD: 'Anticoagulant oral direct', HEPAR: 'Héparine', AAP: 'Antiagrégant (aspirine…)',
  INSUL: 'Insuline', ADO: 'Antidiabétique oral', ANTIEP: 'Antiépileptique', CORTIC: 'Corticoïde au long cours',
  ANTIHTA: 'Antihypertenseur', DIUR: 'Diurétique', SALBU: 'Bronchodilatateur (asthme)', ACFOL: 'Acide folique',
}

/** Médicaments donnés pendant une consultation (rubrique « administré »). */
export const ADMINISTRES: Record<string, string> = {
  PARA: 'Paracétamol', IBU: 'Ibuprofène', ARTE: 'Artésunate', QUININ: 'Quinine', AMOX: 'Amoxicilline', SRO: 'SRO',
}

export const MEDS: Record<string, string> = { ...TRAITEMENTS, ...ADMINISTRES }

/** Ce qui doit sauter aux yeux en urgence, avec la raison en quelques mots. */
export const ALERTES: Record<string, string> = {
  AVK: 'risque hémorragique', AOD: 'risque hémorragique', HEPAR: 'risque hémorragique', AAP: 'risque hémorragique',
  INSUL: 'risque d’hypoglycémie', ADO: 'risque d’hypoglycémie',
  ANTIEP: 'ne pas interrompre brutalement', CORTIC: 'ne pas interrompre brutalement',
  PACEM: 'dispositif implanté : à signaler avant défibrillation ou IRM', VALVE: 'dispositif implanté',
  GROSSESSE: 'adapter médicaments et imagerie', INSREN: 'adapter les doses',
}

export const MOTIFS: Record<string, string> = { FIEV: 'Fièvre', CONS: 'Consultation', CTRL: 'Contrôle', EVAC: 'Évacuation', PREN: 'Prénatal', TRAU: 'Traumatisme', VACC: 'Vaccination', AUTR: 'Autre' }
export const ORIENT: Record<string, string> = { DOM: 'Retour à domicile', SUIV: 'Suivi programmé', EVAC: 'Évacuation' }
export const ROLE_LABEL: Record<string, string> = { relais: 'Relais communautaire', infirmier: 'Infirmier(ère)', medecin: 'Médecin' }
export const label = (m: Record<string, string>, c: string) => m[c] ?? c
/** Motifs d'une lecture d'urgence SANS badge (codes : MOTIFS_LECTURE dans src/journal/index.ts). */
export const MOTIF_LECTURE: Record<string, string> = {
  INCONSCIENT: 'Patient inconscient', NE_PARLE_PAS: 'Ne peut pas s’exprimer', VITAL: 'Urgence vitale', AUTRE: 'Autre urgence',
}
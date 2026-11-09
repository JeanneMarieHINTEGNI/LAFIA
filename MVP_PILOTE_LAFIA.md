# Sprint 1 — MVP pilote LAFIA

## Objectif du sprint
Valider le cœur du produit dans une version pilotable, sans ouvrir les blocs non décidés.

## Périmètre du sprint

### À livrer
- [ ] Carte QR de résumé médical signée
- [ ] Lecture d’urgence par un soignant
- [ ] Vérification de la signature et du registre
- [ ] Journalisation de chaque lecture
- [ ] Consultation du journal côté patient
- [ ] Résumé C0 lisible hors ligne
- [ ] Vérification de confiance via le registre signé

### Hors périmètre de ce sprint
- [ ] C1 / C2 chiffrés profonds
- [ ] contenu médical profond hors résumé
- [ ] catégories sensibles complexes
- [ ] droits métiers avancés selon rôle
- [ ] historique multi-hôpital
- [ ] vraie autorité de production
- [ ] IA / assistant médical

## Livrables fonctionnels

### Bloc 1 — C0 et lecture d’urgence
- [ ] Le QR contient un résumé médical réduit, lisible sans réseau.
- [ ] La carte est signée et vérifiable.
- [ ] Un soignant peut scanner la carte.
- [ ] Une carte invalide est refusée.
- [ ] Une carte signée par un badge révoqué est refusée.

### Bloc 2 — confiance et registre
- [ ] Le téléphone vérifie la signature de l’autorité.
- [ ] Le registre est accepté seulement s’il est valide et plus récent.
- [ ] Un badge inconnu ou révoqué est rejeté.
- [ ] La version la plus récente du registre remplace l’ancienne.

### Bloc 3 — journalisation
- [ ] L’entrée est écrite avant l’affichage du résumé.
- [ ] Le journal est visible pour le patient.
- [ ] Les lectures sans badge sont bien marquées comme telles.
- [ ] La synchronisation réseau est différée sans bloquer le flux.

## Critères d’acceptation du sprint
- [ ] Une carte valide est acceptée.
- [ ] Une carte invalide est refusée.
- [ ] Un badge révoqué est refusé.
- [ ] L’accès est journalisé avant l’affichage.
- [ ] Le patient peut consulter le journal.
- [ ] Le résumé reste lisible sans réseau.
- [ ] Le produit reste dans le périmètre C0 sans surpromesse.

## Définition du “fait”
Le sprint est terminé quand :
- [ ] le flux d’urgence est fonctionnel,
- [ ] le journal est cohérent,
- [ ] la confiance est vérifiée via le registre,
- [ ] le fonctionnement hors ligne est documenté,
- [ ] les limites du pilote sont claires.

## À éviter pendant ce sprint
- [ ] Ouvrir les C1/C2
- [ ] Développer des permissions métier non décidées
- [ ] Prendre un vrai pilotage de production sans autorité réelle
- [ ] Développer l’IA ou un assistant médical
- [ ] Étendre le scope à un historique multi-hôpital

## Référence technique existante
- [frontend/src/ui/ScanUrgence.tsx](frontend/src/ui/ScanUrgence.tsx)
- [frontend/src/ui/ScanJournalise.tsx](frontend/src/ui/ScanJournalise.tsx)
- [frontend/src/journal/index.ts](frontend/src/journal/index.ts)
- [frontend/src/ui/trust.ts](frontend/src/ui/trust.ts)
- [frontend/test/urgence.test.tsx](frontend/test/urgence.test.tsx)
- [frontend/AGENTS.md](frontend/AGENTS.md)
- [backend/README.md](backend/README.md)

## Prochaine étape après ce sprint
- [ ] Valider le périmètre pilot avec les parties prenantes
- [ ] Choisir le vrai pilote de production avec autorité réelle
- [ ] Puis seulement après décider de la suite : C1/C2, droits avancés, multi-hôpital

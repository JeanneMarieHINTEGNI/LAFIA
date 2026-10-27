# Modèle de menace : protégé / partiellement / non protégé (assumé)

| Menace | État | Détail |
|---|---|---|
| Carte falsifiée (contenu modifié) | Protégé | Ed25519 sur les octets ; tests : 1 caractère modifié = refus |
| Signataire inconnu / badge révoqué | Protégé | Registre local ; la révocation exige que le registre soit à jour |
| Rôle usurpé (se déclarer médecin) | Protégé | Rôle lu dans le registre, pas dans la carte |
| IA écrivant ou signant seule | Protégé | draft -> reviewed -> signed ; l'IA n'a pas la clé |
| Champ d'opinion / dose inventée | Protégé | Schéma fermé ; dose = référence de table ; catalogues fermés |
| Valeur « par défaut » prise pour une mesure | Protégé | Absent ≠ aucun connu ≠ négatif ; relecture montre « non renseigné » |
| Falsification du journal au milieu | Protégé | Chaîne + signature par acteur |
| Catégorie sensible exposée dans le C0 sans choix du patient | Protégé | Schéma : refus sans `pr.vs` (VIH, psychiatrie, IVG, addictions, drépanocytose, grossesse, ARV) |
| Lecture sans trace | Partiel | Le journal est écrit avant l'affichage ; s'il est indisponible, la lecture reste possible et signalée |
| Taille du coffre révélant la gravité | Protégé | Paliers fixes |
| Carte périmée (donnée plus récente ailleurs) | Partiel | Avertissement après 30 j ; la carte reste valide |
| Poids ancien utilisé pour une dose | Partiel | Alerte à l'écran > 90 j ; pas de calcul de dose encore |
| Clé de badge volée | Partiel | Révocation dans le registre signé par l'autorité, distribué par le serveur et appliqué par chaque téléphone dès qu'il a du réseau (anti-retour en arrière par numéro de version). Un téléphone resté hors ligne depuis la révocation accepte encore le badge |
| Lecture du C0 par un tiers selon le rôle | Non protégé | Aucun filtre par rôle : le C0 est lisible par quiconque tient la carte (assumé) |
| Copie / photo de la carte | Non protégé | Un QR se copie ; la signature prouve l'auteur, pas le porteur |
| Lecture du QR par un tiers | Non protégé | C0 en clair (par conception : urgence). Garder le C0 minimal, sensible dans C1 |
| Suppression des dernières entrées du journal local | Non protégé | Ancrage externe de l'empreinte à prévoir |
| Horloge de l'appareil falsifiée | Non protégé | Date de lecture non fiable ; seul `iat` > futur+24 h est refusé |
| Clé privée dans un navigateur | Non protégé | Mémoire de session ; en production : Keystore matériel |
| Distribution et mise à jour du registre | Partiel | Registre signé, servi par `/api/registre` ; le serveur ne détient pas la clé d'autorité. Autorité réelle (Ordre, Ministère) à instituer ; clé de démo interdite en production |
| Signature individuelle de chaque consultation | Non traité | Seul le dernier signataire signe l'ensemble ; l'auteur par ligne est une attribution |
| Badge pseudonyme redevable (BBS+) | Non fait | Hors cette étape |
| Bris de glace, outbox différée, journal chiffré vers Ordre | Non fait | Étapes suivantes |

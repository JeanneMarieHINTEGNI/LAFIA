# CONTRAT TECHNIQUE LAFIA v2 (référence : `src/core/schema.ts` et `src/core/signing.ts` ; miroir Python : `backend/lafia/c0.py`)

Toute modification se fait dans les DEUX langages ; `pytest` et `bun run test` échouent si ils divergent
(vecteurs partagés dans les deux sens : `demo/vecteurs_carte.json` produits par le navigateur et vérifiés par le Python,
`demo/vecteurs_carte_python.json` produits par le Python et vérifiés par le navigateur ; copies dans `backend/tests/`).

Détail d'implémentation à respecter des deux côtés : la décompression zlib vérifie l'en-tête mais IGNORE la somme Adler-32
(comportement de `unzlibSync` de fflate). Une carte modifiée donne donc « BAD_SIGNATURE » des deux côtés ; l'intégrité repose sur Ed25519.

## Format
- Payload CBOR : `{v:2, id:"p-<hex>", iat:<epoch s>, pr:{al,tx,ah,ec,gs,yb,sx,vs}, co:[≤3 consultations]}`.
- Enveloppe : CBOR `[2, kid(8 octets), corps(octets signés tels quels), signature Ed25519(64)]`.
- La signature porte sur les OCTETS du corps reçus : aucune canonicalisation à la vérification.
- Texte : `L2:` + Base45(zlib(enveloppe)) | lien : `<url>#L2B:` + Base64url(zlib(enveloppe)).
  Base45 est le plus dense en QR (mode alphanumérique) ; le lien passe en mode octets (QR plus gros) mais ouvre l'application depuis la caméra native.
- Limite : 1 400 caractères ; le pire payload valide mesuré fait 1 230 (testé).

## Sémantique des champs (anti-donnée-inventée)
- Champ ABSENT = non renseigné. Liste VIDE (`al:[]`) = « aucun connu », déclaré explicitement par le soignant.
- Aucune valeur par défaut nulle part. Date et signataire viennent de la session, jamais d'un secours codé en dur.
- Unités : température en dixièmes de °C (300-450), poids en dixièmes de kg (5-3000) ET date de mesure `pt` obligatoire.
- Dose : référence de table `T<n>:L<n>`, jamais un nombre saisi ou généré. Résultat de test : catalogue fermé (TDR: POS|NEG).
- Établissements : identifiant opaque (hex), résolu localement (`demo/facilities.json` côté Python, `src/data/facilities.json` côté web).
- Catégories SENSIBLES (VIH, psychiatrie, IVG, addictions, drépanocytose, grossesse, et ARV car un traitement antirétroviral révèle le VIH) : elles vivent dans le C1 par défaut. Elles n'entrent dans le C0 que si le patient les déclare dans `pr.vs` (choix explicite) ; sinon la carte est refusée (`BAD_SCHEMA`).
- Le C0 est lisible par quiconque tient la carte : AUCUN filtre d'affichage par rôle.

## Confiance
- Le RÔLE n'est pas dans le payload : il vient du registre (kid -> clé publique, rôle, révocation).
- Chaque entrée du registre porte `etab` (établissement de rattachement) : l'écran affiche « écrit par un {rôle} du {établissement} » (sous-credential d'établissement). Un sous-credential ÉCRIT dans le dossier ; il n'ouvre ni le C1 ni le bris de glace.
- Le lecteur n'embarque que des clés publiques. Les badges (clés privées) se chargent en mémoire.
- Statuts d'erreur : `UNREADABLE`, `UNKNOWN_SIGNER`, `BAD_SIGNATURE`, `BAD_SCHEMA`, `FUTURE_DATE`. Aucune donnée n'est rendue en cas d'erreur.
- Carte de plus de 30 jours : avertissement (pas un refus). `iat` > maintenant+24 h : refus.

## Cycle d'écriture
`draft` -> `reviewed` (humain) -> `signed`. L'IA ne produit que des brouillons ; `sign()` refuse un brouillon non relu
et exige que le signataire soit le relecteur. Le module IA n'a aucun accès aux clés ni au réseau.

## Coffre C1/C2 et journal
XChaCha20-Poly1305, padding 1/4/16 Ko (non construit).

Journal (implémenté, `src/journal/index.ts` ; miroir Python `backend/lafia/journal.py`) :
`hash = SHA256( JSON.stringify([i, t, action, cible, rubriques, etab|null, acteur|null, prev]) )` en hexadécimal, `prev` = hash
précédent (64 zéros pour i = 0), `sig = Ed25519(octets du hash)` par le badge `acteur` s'il y en a un. Une chaîne par appareil lecteur.
Lecture SANS badge : champ `motif` (catalogue fermé `INCONSCIENT | NE_PARLE_PAS | VITAL | AUTRE`, écran « Qui lit ? »), ajouté EN FIN
de la liste hachée : `[i, t, action, cible, rubriques, etab|null, acteur|null, prev, motif]`. Sans motif, la liste est inchangée
(les anciennes entrées gardent leur empreinte). Un motif hors catalogue est ignoré par le navigateur et refusé par le serveur.
Le serveur revérifie chaque entrée à la réception ; vecteurs partagés : `demo/vecteurs_journal.json` (copie dans `backend/tests/`).
(L'ancienne cible « CBOR([idx,ts,acteur,action,cible]) » n'a jamais été implémentée ; c'est le format ci-dessus qui fait foi.)

## Données d'urgence et serveur (décision de l'équipe, 27/10/2026)
- Les informations d'urgence (C0) vivent dans la carte et se lisent SANS serveur. Aucune route du serveur ne reçoit ni ne stocke une carte.
- Le reste du dossier médical (historique complet, comptes rendus, examens) PEUT être stocké sur un serveur, comme les bases des hôpitaux (phase P3).
  Où, chiffré ou non, et qui lit quoi : décision D8, à trancher avant de construire.

## Code de secours (changement de téléphone)
`LAFIA-SECOURS:<id>:<jeton>:<contrôle>` ; contrôle = 4 premiers caractères hexadécimaux de `SHA256("<id>:<jeton>")`.
Ne contient aucune donnée médicale : il redonne l'accès au journal du serveur (vérifié par `GET /api/journal/patients/<id>`).
La carte se restaure depuis son texte `L2:` ou son lien `#L2B:`, vérifiée comme par un lecteur et rattachée au même identifiant.

## Démo uniquement
Graines des badges dérivées d'un nom (`make_demo.py`) : INTERDIT en production.

## Décision d'architecture (à jour)
- Phase actuelle : QR RÉSUMÉ signé. Il contient le C0 et se lit sans réseau. Il n'est pas un portail : il ne contient ni clé de déchiffrement ni adresse de dossier.
- Phase suivante (après validation) : QR HYBRIDE = résumé + référence opaque vers le reste du dossier. Le résumé reste complet à lui seul ; la référence est une option, jamais une dépendance.
- Compatibilité : toute nouvelle clé du schéma exige une nouvelle version du format ET des lecteurs mis à jour AVANT l'émission.
- Critères de validation avant l'hybride : scan < 5 s 10 fois sur 10 en mode avion sur le téléphone cible ; falsification / inconnu / révoqué refusés sans aucune donnée affichée ; 3 à 5 entretiens soignants ; avis juridique sur les données de santé commencé.

## Liens
- `toLink(texte, base)` : carte `L2:…` -> `<base>#L2B:…`. La base ne peut pas être localhost. Les données restent dans le fragment (jamais envoyées au serveur).
- Un routeur à `#` doit router tout fragment commençant par `#L2` vers l'écran de lecture et lui passer le lien en entier.

## Invariant : journal AVANT affichage
Aucun accès sans trace : l'entrée de journal est écrite avant que le contenu soit rendu (`ScanUrgence` : `beforeDisplay`, attendu).
Si le journal est indisponible, la lecture reste possible (fonction vitale) avec un bandeau « lecture non journalisée ».

## Décisions OUVERTES (à trancher en équipe ; ne rien implémenter avant)

| # | Décision | Constat | Conseil |
|---|---|---|---|
| D1 | Format | La note de périmètre parle de FHIR IPS réduit ; le contrat v2 est un format compact maison | Garder le compact pour le QR (limite ~1 200 car.) et écrire un export `toIPS()` ; ne pas prétendre être FHIR natif |
| D2 | Signature par consultation | Aujourd'hui seul le dernier signataire atteste l'ensemble ; l'auteur de chaque ligne n'est qu'une attribution | Signature par consultation si le budget QR le permet (≈ +290 car. pour 3 consultations) ; sinon assumer |
| D3 | Plateforme | Le protocole de libération du C1 suppose NFC/BLE entre deux téléphones ; à ma connaissance une page web ne peut pas jouer une carte NFC ni un périphérique BLE | Double échange de QR (badge + déclaration, puis clé scellée) en web ; natif Android sinon. À vérifier sur la plateforme retenue |
| D4 | Catégories sensibles | Liste issue de la note ; à valider par des soignants | Entretiens P2-3 |
| D5 | Identifiant patient | Contrat : pseudonyme aléatoire. Note « Identifiant sectoriel » : HMAC(clé santé du Ministère, NPI) | Aléatoire en démonstration ; HMAC sectoriel en production, jamais le NPI en clair |

## Primitives
Les notes imposent libsodium. Ed25519 est couvert (PyNaCl = libsodium ; tweetnacl côté navigateur). XChaCha20-Poly1305, HPKE
et Argon2id (C1, séquestre, PIN) exigeront libsodium-wrappers côté TypeScript : tweetnacl ne les fournit pas.
# LAFIA — contexte du projet pour l’IA

Réponds en français. Une tâche = un changement ciblé. Ne réécris pas le noyau (`src/core/`) sauf demande explicite. Ne tranche pas les décisions ouvertes (§6). Commence par dire ce que tu vas faire. En fin de tâche : fichiers touchés, `bunx tsc` et `bunx vitest run` bruts, ce qui n’a pas été fait, ce qui a été supposé.

## 1. But

Carnet de santé portable pour le Bénin / Togo. Le patient porte un QR (carte, bracelet, téléphone). En urgence, un soignant le scanne et lit un **résumé signé** (allergies, traitements, antécédents clés, dernières consultations), même sans réseau. Le détail profond est dans des compartiments chiffrés (C1, C2), **non construits**. Chaque accès est journalisé et visible du patient.

Équipe de production : la cheffe d’équipe + Claude, sur le frontend ET le backend (Python, dossier `backend/` voisin). L’IA embarquée (VisionPsy / MedPsy) est la partie 2 : hors périmètre ici.

Ce dépôt est le **frontend** (`lafia-frontend`). La landing marketing cohabite avec l’espace patient et le noyau v2 : adapter sans casser la landing, `src/App.tsx`, `src/patient/views.tsx`.

## 2. Structure réelle (pas l’arbre théorique `lafia/web/`)

```
frontend/
  AGENTS.md                   # ce fichier
  demo/                       # NON servi, NON importé par src/
    vecteurs_carte.json       # cartes produites par le navigateur, vérifiées par le Python (backend/tests/)
    vecteurs_carte_python.json# cartes produites par le Python, vérifiées par le navigateur
    vecteurs_journal.json     # entrées de journal produites par le navigateur, vérifiées par le Python
    secrets/                  # graines de badges de DÉMO (medecin/infirmier/relais .json)
    make_demo.mjs             # régénère secrets/, demo/registry.json (source NON signée) et facilities.json
    registry.json             # source à signer avec « python -m lafia.registre signer » (backend)
    facilities.json
  src/
    core/                     # NOYAU v2 : ne pas réécrire
      base45.ts  schema.ts  signing.ts  index.ts
    data/
      registre_signe.json     # registre des badges SIGNÉ par l'autorité (secours hors ligne) ; produit par le backend
      autorite.json           # clé PUBLIQUE de l'autorité : la seule ancre de confiance du téléphone
      facilities.json         # clé établissement → nom
    ui/
      trust.ts  BadgeContext.tsx
      UrgenceView.tsx  ScanUrgence.tsx  ScanJournalise.tsx
      BadgeLoader.tsx  QrCode.tsx  formulaire.tsx (éléments de formulaire partagés)
      ScannerQr.tsx  lecteurQr.ts   # caméra + lecture QR sur l'appareil (natif, sinon zxing-wasm)
    soignant/                 # espace soignant (#/soignant), sur le téléphone DU soignant
      EspaceSoignant.tsx      # badge, scan de la carte (lecture signée), mise à jour, QR de la nouvelle carte
      EditeurCarte.tsx        # profil + consultation + relecture + signature ; émission journalisée AVANT remise
    patient/                  # espace patient
      carte.ts                # saisie → C0 (profil, consultations), signature, lien QR — testé
      CarteView.tsx           # « Ma carte » : badge soignant, relecture, signature, QR, test de lecture
      JournalView.tsx         # « Mon journal » : vrai journal de l'appareil (src/journal), vérifié, simulation d'altération en mémoire
      Avatar.tsx  photo.ts    # photo du patient (recadrée, locale, hors QR)
      store.ts                # useDeviceState
      views.tsx  EspacePatient.tsx  data.ts
    sections/                 # landing
    App.tsx  main.tsx
  test/
    helpers.ts                # badges de démo, payload type, signed()
    vectors.test.ts           # noyau v2 : Base45, sign/verify, codes d'erreur, schéma, taille max
    urgence.test.tsx          # BadgeContext + ScanUrgence (journal avant affichage)
    journal.test.ts           # chaîne SHA-256 + signatures
    carte.test.tsx            # espace patient → C0, lien QR, routeur #L2B: / #L1:
    journalview.test.tsx  store.test.tsx  sync.test.tsx
    vecteurs-journal.test.ts  # produit demo/vecteurs_journal.json, vérifié aussi par le backend Python
    vecteurs-carte.test.ts    # produit demo/vecteurs_carte.json ; vérifie demo/vecteurs_carte_python.json
    registre.test.ts          # registre signé, révocation, anti-retour en arrière
    setup.ts                  # tests « hors ligne » par défaut (fetch simulé)
  docs/
    CONTRAT.md                # contrat technique v2 (référence)
    MODELE-MENACE.md
```

Présents depuis : `src/journal/` (`ajouterEntree`, `verifierChaine`, `useJournal`), cycle brouillon → relu → signé dans `src/core/signing.ts`. Vérification croisée TS ↔ Python : faite pour la carte (dans les deux sens) et pour le journal. Miroir Python de la carte : `backend/lafia/c0.py` (+ `cbor.py`, sans dépendance).

## 3. Contrat de la carte v2 (QR résumé « C0 ») — cible

Référence : `docs/CONTRAT.md`. Le code actuel (`serializeCard` / `parseCardText`) est un **sous-ensemble** : gzip plutôt que zlib, `kid` texte plutôt que 8 octets, schéma plus lâche, pas de `verify(texte, registre, now)` avec codes d’erreur.

Cible (ne pas implémenter en passant) :

- Charge utile CBOR canonique, signée Ed25519 sur les octets exacts du corps.
- Enveloppe `[2, kid, corps, signature]` ; `kid` = 8 octets = 8 premiers octets de la clé publique du badge ; signature 64 octets.
- Transport : zlib → Base45 préfixé `L2:` (QR le plus dense) ou lien `<base>#L2B:` + base64url (fragment). `toLink()` refuse localhost / boucle / schéma inattendu.
- Taille max 1400 caractères (pire cas mesuré : 1230).
- Vérification : `verify(texte, registre, now)` → `{ok, role, kid, etab, payload, warnings}` ou `{ok:false, code}`. Codes : `UNREADABLE`, `UNKNOWN_SIGNER`, `BAD_SIGNATURE`, `BAD_SCHEMA`, `FUTURE_DATE`. Carte de plus de 30 jours : avertissement. `iat` dans le futur de plus de 24 h : refusée.
- Schéma : température en dixièmes de °C (300–450) ; poids en dixièmes de kg (5–3000) avec date obligatoire `pt` ; doses = référence de table `T\d:L\d` ; listes plafonnées (al/ah/tx 6, x 3, adm 4) ; 3 consultations maximum ; catalogues fermés (motifs, orientations, TDR POS/NEG, groupes, rôles, catégories sensibles).
- Le C0 est lisible par toute personne qui tient la carte : **aucun filtre par rôle aujourd’hui**.
- Cycle de vie : brouillon → relu → signé. `sign()` refuse un brouillon non relu et exige signataire = relecteur.

Un seul lecteur : `src/ui/ScanUrgence.tsx` (via `ScanJournalise`). L'ancien format `L1:` est retiré ; un lien `#L1:` affiche « ancien format, aucune donnée ». La carte est signée par un badge soignant chargé depuis son fichier (`BadgeLoader`), jamais par des clés créées sur le téléphone du patient.

## 4. Journal d’accès

Cible : entrées chaînées SHA-256, signées Ed25519 par l’acteur s’il a un badge ; sinon « non signée / lecteur sans badge ». API : `ajouterEntree`, `listerEntrees(cible?)`, `verifierChaine(entrees, registre)`. Écriture **avant** affichage et **avant** émission.

Aujourd’hui : `src/journal/` (chaîné, signé par le badge s'il y en a un) alimenté par `ScanJournalise`, écrit AVANT l'affichage. `src/journal/sync.ts` l'envoie ensuite au backend (`/api`, en arrière-plan, réessai au retour du réseau ; jamais bloquant). « Mon journal » (`JournalView.tsx`) fusionne les lectures de l'appareil et celles du serveur (autres appareils), revérifiées localement. Pas d’ancrage externe ; le serveur voit les métadonnées (qui, où, quand), jamais le contenu médical.

Limites assumées : suppression des dernières entrées non détectable sans ancrage externe ; journal local non chiffré, par appareil ; lieu connu seulement si `etab` fourni.

## 5. Décisions déjà prises

- Le QR reste un résumé. Version hybride (référence vers C2) seulement après validation du résumé.
- Format compact conservé ; export FHIR IPS possible plus tard (`toIPS()`).
- Pas de signature par consultation pour l’instant (D2).
- NFC/BLE exigeraient une app Android native ; le web fait un double échange de QR (D3).
- Identifiant patient : aléatoire aujourd’hui (D5 ouverte).
- libsodium sera nécessaire pour XChaCha20 / HPKE / Argon2id (tweetnacl ne les a pas).

## 6. Décisions OUVERTES (ne pas trancher seul)

1. Barrière « badge requis pour afficher le C0 » : une barrière d’écran seule ne protège pas (le contenu est dans le QR). Piste recommandée : app + badge + mode urgence sans badge journalisé « non vérifié ». Non décidé.
2. « Prise en charge » : médecin en charge temporaire (ouverte au scan, expire, accord du patient ou urgence avec motif, journalisée) ≠ médecin traitant (relation durable choisie par le patient). Durée d’expiration à valider par des soignants (72 h proposé, non validé).
3. Droits exacts infirmier / aide-soignant sur le contenu : à valider par des soignants. (L'aperçu filtré par rôle de l'ancienne carte a été retiré avec le format L1 : le test de lecture montre exactement l'écran du lecteur, conformément au contrat.)
4. Liste des catégories sensibles : à valider cliniquement (D4).
5. Historique multi-hôpitaux : exige un serveur (stockage chiffré, synchro, ancrage du journal) = travail back.

## 7. État d’avancement

Fait dans ce dépôt : landing ; espace patient (profil local, carte, journal démo, scan) ; noyau v2 (Base45, Ed25519 tweetnacl, CBOR zlib `L2:`/`L2B:`, `verify` avec codes d'erreur) ; registre public au format du noyau ; formulaire de consultation branché sur `sign()` ; badges démo ; journal chaîné ; tests vitest (noyau, BadgeContext, ScanUrgence, journal).

Non prouvé : scan sur un vrai téléphone (HTTPS, adresse atteignable, `VITE_PUBLIC_URL`).

Backend (`backend/`, Python/FastAPI/SQLite) : journal partagé fait et testé (vecteurs croisés TS → Python). Docker/Caddy écrits, non déployés.

Registre signé (fait) : `src/ui/trust.ts` vérifie la signature de l'autorité, n'accepte qu'une version plus récente, garde la dernière pour le hors-ligne ; `sync.ts` la récupère sur `/api/registre`. Révocation = toutes les cartes de ce badge refusées.

Fait aussi : espace soignant (#/soignant) et réception de la nouvelle carte par le patient (`patient/RecevoirCarte.tsx` : même identifiant, plus récente) ; lecteur public sans espace (#/lire) ; l'émission d'une carte est inscrite au journal (ECRITURE) avant remise. Écran « Qui lit ? » (motif de lecture sans badge, journalisé) ; changement de téléphone (code de secours + carte restaurée, `src/patient/secours.ts`, `Secours.tsx`).

À faire : dossier complet sur serveur (phase P3, après décision D8 : les données d'urgence restent dans la carte, sans serveur) ; coffres C1/C2 ; chiffrement du journal ; bouton « + » ; décisions §6.

## 8. Limites à afficher honnêtement

- Le C0 est lisible par toute personne qui tient la carte ; les catégories sensibles n’y sont que sur choix de la personne.
- Le journal local n’est pas chiffré ; il est synchronisé avec le serveur en arrière-plan (métadonnées : qui, quand, où).
- Une erreur de saisie d’un soignant authentique n’est pas détectée par le schéma : c’est le rôle de l’étape de relecture.
- Aucune validation clinique n’a eu lieu.
- Les graines `demo/secrets/` sont **interdites en production**.
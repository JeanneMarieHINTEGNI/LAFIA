# Lafia — backend

Python (3.13 ou 3.14), FastAPI, PyNaCl, SQLite (un simple fichier). Deux services et une bibliothèque :
- le **journal partagé** : les lectures de carte faites sur le téléphone d'un soignant remontent ici, et le patient
  les retrouve sur son propre téléphone ;
- le **registre des badges signé** : la liste des soignants autorisés et des badges révoqués, signée par l'autorité,
  que les téléphones récupèrent dès qu'ils ont du réseau ;
- la **carte en Python** (`lafia/c0.py`) : lire, vérifier et signer une carte exactement comme le navigateur.

## Démarrer en local

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn lafia.api:app --reload --port 8000
```

Le frontend (`bun run dev`) relaie déjà `/api` vers `http://127.0.0.1:8000` : lancez les deux, rien d'autre à régler.
Documentation interactive de l'API : http://127.0.0.1:8000/api/docs

Tests : `.venv/bin/python -m pytest`

## Ce que fait l'API

| Méthode | Chemin | Rôle |
|---|---|---|
| `POST` | `/api/patients` | Le téléphone du patient réserve son identifiant Lafia avec un secret aléatoire (seule l'empreinte SHA-256 est gardée). |
| `POST` | `/api/journal/chaines/{chaine}/entrees` | Un appareil lecteur envoie ses nouvelles entrées. Le serveur **revérifie** tout avant d'accepter. |
| `GET` | `/api/journal/patients/{id}` | Le patient lit **ses** entrées, avec `Authorization: Bearer <secret>`. |
| `GET` | `/api/registre` | Le registre des badges, tel que l'autorité l'a signé. Chaque téléphone revérifie la signature. |
| `GET` | `/api/sante` | Supervision (affiche aussi la version du registre en service). |

Chaque appareil lecteur a sa propre **chaîne** (identifiant aléatoire `c-…`). À la réception, le serveur vérifie
le rang, le lien avec l'entrée précédente, l'empreinte recalculée et, si l'entrée a un auteur, sa signature avec la
clé du registre. Une entrée invalide fait refuser tout l'envoi. Renvoyer des entrées déjà reçues est sans effet
(l'appareil peut réessayer après une coupure) ; les **réécrire** est refusé (`409`).

Le format des entrées est celui de `frontend/src/journal/index.ts`, au caractère près. `tests/vecteurs_journal.json`
contient des entrées produites par le code du navigateur : si l'un des deux côtés change, les tests échouent.
Pour régénérer ces vecteurs après un changement **voulu** : `LAFIA_ECRIRE_VECTEURS=1 bunx vitest run test/vecteurs-journal.test.ts`
dans le frontend, puis copier `frontend/demo/vecteurs_journal.json` ici, dans `tests/`.

## Le registre des badges et les révocations

- `registry.json` : la liste **non signée** (source), produite par `frontend/demo/make_demo.mjs` pour la démo.
- `registre_signe.json` : la même liste, **signée par l'autorité**. C'est elle que le serveur distribue.
- `autorite.pub.json` : la clé **publique** de l'autorité (copiée dans `frontend/src/data/autorite.json`).
- `secrets_demo/autorite.json` : la clé **privée** de démonstration. **Interdite en production**, jamais dans l'image Docker.
  En production, la clé de l'autorité (Ordre, Ministère) reste sur son propre poste ; le serveur ne la détient pas.

```bash
.venv/bin/python -m lafia.registre verifier --registre registre_signe.json --autorite autorite.pub.json   # voir la liste
.venv/bin/python -m lafia.registre revoquer 809c25bc343c8e42 --registre registre_signe.json --cle secrets_demo/autorite.json
```

Après une révocation, le serveur sert la nouvelle version **sans redémarrer**. Chaque téléphone la récupère au
démarrage de l'application, au retour du réseau, et toutes les 30 minutes ; il refuse alors les cartes signées par ce
badge (« signataire inconnu ou révoqué »). Un téléphone n'accepte jamais une version plus ancienne que la sienne.
Après tout changement du registre, recopiez `registre_signe.json` dans `frontend/src/data/` lors du prochain
déploiement du site : c'est le registre de secours d'un téléphone qui n'a encore jamais eu de réseau.

**Effet d'une révocation** : TOUTES les cartes signées par ce badge sont refusées, y compris celles signées avant le vol.
Les patients concernés doivent faire re-signer leur carte. (Accepter les cartes « signées avant la révocation » serait
fragile : la date d'une carte est écrite par le signataire lui-même, donc un voleur pourrait l'antidater.)

## La carte en Python (`lafia/c0.py`)

Miroir exact du noyau du navigateur (`frontend/src/core/`) : Base45, CBOR (`lafia/cbor.py`, sans dépendance), zlib,
schéma, cycle brouillon → relu → signé, vérification avec les mêmes codes d'erreur et les mêmes messages.
Les tests le prouvent dans les deux sens : `tests/vecteurs_carte.json` (cartes du navigateur, vérifiées ici) et
`tests/vecteurs_carte_python.json` (cartes d'ici, vérifiées par le navigateur).

```bash
.venv/bin/python -m lafia.c0 verifier "L2:…"        # vérifie une carte hors ligne et affiche son contenu
```

Le serveur n'expose volontairement **aucune** route qui recevrait une carte : elle contient des données médicales
en clair. Ce module sert aux tests, aux outils de l'autorité et au contrôle qualité, sur un poste local.

## Ce que le serveur voit, et ce qu'il ne voit pas

- **Ne voit jamais** : le contenu médical (allergies, traitements…), ni le secret du patient.
- **Voit** (limite assumée, à chiffrer plus tard) : quel badge a lu quelle carte, quand et dans quel établissement.
- Le premier appareil qui enregistre un identifiant en devient propriétaire. Le site l'enregistre dès la création de
  l'espace, avant qu'une carte ne rende l'identifiant visible. Si le patient perd son téléphone, il n'y a pas encore
  de récupération possible.
- La suppression des **dernières** entrées d'une chaîne n'est pas détectable sans ancrage externe (pas encore fait).

## Limitation du débit

Chaque adresse IP est limitée (fenêtre glissante, en mémoire) ; au-delà, le serveur répond `429` avec l'en-tête
`Retry-After` (secondes à attendre). Le site gère ce cas : l'envoi du journal réessaie plus tard, et « Retrouver mon
espace » affiche un message clair.

| Groupe | Requêtes | Défaut | Variable |
|---|---|---|---|
| Inscription | `POST /api/patients` | 20 par heure | `LAFIA_DEBIT_INSCRIPTION` |
| Lecture du journal | `GET /api/journal/patients/{id}` | 120 par minute | `LAFIA_DEBIT_LECTURE` |
| Secrets refusés | réponses `401` sur la lecture du journal | 20 par 10 minutes | `LAFIA_DEBIT_ECHEC_JETON` |
| Envoi du journal | `POST /api/journal/chaines/…/entrees` | 120 par minute | `LAFIA_DEBIT_ENVOI` |
| Le reste de `/api` | registre, santé… | 300 par minute | `LAFIA_DEBIT_DEFAUT` |

Format des variables : `nombre/secondes`, par exemple `LAFIA_DEBIT_ECHEC_JETON=20/600`. Une fois le seuil de secrets
refusés atteint, même le bon secret est refusé jusqu'à la fin de la fenêtre : c'est ce qui rend les essais en masse
inutiles. `LAFIA_DEBIT=0` désactive tout (développement seulement). Les limites sont larges pour qu'un centre de
santé entier derrière une même adresse IP passe sans gêne. Limite assumée : un seul processus uvicorn (les compteurs
sont en mémoire, propres à chaque processus).

## Sauvegardes

```bash
.venv/bin/python -m lafia.sauvegarde creer     --db lafia.db --dossier sauvegardes --garder 14   # à chaud, vérifiée
.venv/bin/python -m lafia.sauvegarde verifier  sauvegardes/lafia-20261027-030000.db
.venv/bin/python -m lafia.sauvegarde restaurer sauvegardes/lafia-20261027-030000.db --db lafia.db  # service ARRÊTÉ
```

- **creer** copie la base pendant que le service tourne (API officielle de SQLite), en fait un fichier unique et
  autonome, vérifie son intégrité, puis ne garde que les 14 plus récentes.
- **restaurer** vérifie la copie avant de toucher à quoi que ce soit, et garde l'ancienne base à côté
  (`lafia.db.avant-restauration`).
- En production, le service `sauvegarde` de `compose.yaml` le fait **chaque jour** dans `./sauvegardes` sur l'hôte.
  Copiez aussi ce dossier **ailleurs** régulièrement : une sauvegarde sur le même disque ne protège pas d'une panne
  du disque.

## Production

`compose.yaml` lance le conteneur `lafia-api` sur le réseau `edge` du serveur ; `frontend/deploy/lafia.caddy`
envoie `/api/*` vers lui. La base vit dans le volume `lafia-data` : **à sauvegarder**.

```bash
mkdir -p registre && cp registre_signe.json registre/     # le registre en service, monté en lecture seule
mkdir -p sauvegardes && sudo chown 1000:1000 sauvegardes   # le conteneur (utilisateur 1000) y écrit les sauvegardes
docker compose up -d --build
# révoquer en production : sur le poste de l'autorité, puis copier le fichier signé dans registre/ sur le serveur
```

Fait : limitation du débit, sauvegarde quotidienne vérifiée. À faire avant une vraie mise en service : épingler
l'image Python par son empreinte (digest), et organiser la copie des sauvegardes hors du serveur.

## Hébergement gratuit (pilote) : Vercel + Turso

En attendant un serveur à nous, le backend tourne comme **fonction Python sur Vercel** (gratuit), avec la base sur
**Turso** (SQLite hébergée, offre gratuite sans carte bancaire : vérifier les conditions sur turso.tech/pricing).
Le même code sert aussi le fichier SQLite derrière Caddy : seul `LAFIA_DB` change. La lecture d'urgence, elle,
ne passe jamais par ce serveur.

**1. La base (Turso)** — turso.tech → se connecter avec GitHub → *Create Database* `lafia`, région la plus proche de
Vercel (ex. Europe de l'Ouest). Noter l'adresse `libsql://lafia-<compte>.turso.io` et créer un jeton (*Create Token*,
lecture-écriture). Les tables sont créées au premier démarrage.

**2. L'API (2e projet Vercel)** — vercel.com → *Add New… → Project* → même dépôt `LAFIA`, nommé **`lafia-api`**,
*Root Directory* = `backend` (Vercel reconnaît FastAPI grâce à `index.py`). Variables d'environnement :

| Variable | Valeur |
|---|---|
| `LAFIA_DB` | `libsql://lafia-<compte>.turso.io` |
| `LAFIA_DB_JETON` | le jeton Turso (secret) |
| `LAFIA_ORIGINES` | `https://lafia-1nkp.vercel.app` |

Vérifier : `https://lafia-api.vercel.app/api/sante` répond `{"ok":true,…}`.

**3. Le site** — dans le projet Vercel du site : variable `VITE_API_URL` = `https://lafia-api.vercel.app`, puis
redéployer. Si Vercel a donné une autre adresse à l'API, la mettre aussi dans `connect-src` de `frontend/vercel.json`
(la CSP n'autorise que cette adresse).

Ce qui change par rapport au serveur à nous, et limites assumées pour un pilote :
- **Appels d'une adresse à l'autre (CORS)** : seul le site listé dans `LAFIA_ORIGINES` peut lire les réponses.
- **Adresse du client** pour la limitation du débit : lue dans `x-forwarded-for`, que Vercel réécrit (choisi
  automatiquement quand `VERCEL` est défini). Les compteurs vivent dans chaque instance de la fonction : la limite est
  moins stricte qu'avec un seul serveur. Les secrets patients restent hors d'atteinte (32 octets aléatoires).
- **Base injoignable** : l'API répond 503 ; le téléphone garde ses lectures et les renvoie plus tard.
- **Sauvegardes** : celles de Turso (selon l'offre), plus une copie à la main de temps en temps ; le service
  `sauvegarde` de `compose.yaml` ne concerne que le fichier SQLite.
- **Révocation d'un badge** : le registre signé est dans le déploiement ; pousser le nouveau `registre_signe.json`
  redéploie l'API.
- **Données** : le serveur ne garde toujours aucune donnée médicale (voir plus haut), mais quel badge a lu quelle carte,
  quand et où, est alors stocké chez Turso, hors du Bénin et du Togo. À trancher avant un vrai déploiement (décision D8).

`demarrer.sh` (port `PORT`, abandon de root après avoir donné le volume à l'utilisateur 1000) sert si l'on passe
plus tard sur un hébergeur à conteneur (Railway, Fly.io, un VPS).
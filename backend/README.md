# Lafia — backend

Deux services, Python (3.13 ou 3.14), FastAPI, PyNaCl, SQLite (un simple fichier) :
- le **journal partagé** : les lectures de carte faites sur le téléphone d'un soignant remontent ici, et le patient
  les retrouve sur son propre téléphone ;
- le **registre des badges signé** : la liste des soignants autorisés et des badges révoqués, signée par l'autorité,
  que les téléphones récupèrent dès qu'ils ont du réseau.

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

## Ce que le serveur voit, et ce qu'il ne voit pas

- **Ne voit jamais** : le contenu médical (allergies, traitements…), ni le secret du patient.
- **Voit** (limite assumée, à chiffrer plus tard) : quel badge a lu quelle carte, quand et dans quel établissement.
- Le premier appareil qui enregistre un identifiant en devient propriétaire. Le site l'enregistre dès la création de
  l'espace, avant qu'une carte ne rende l'identifiant visible. Si le patient perd son téléphone, il n'y a pas encore
  de récupération possible.
- La suppression des **dernières** entrées d'une chaîne n'est pas détectable sans ancrage externe (pas encore fait).

## Production

`compose.yaml` lance le conteneur `lafia-api` sur le réseau `edge` du serveur ; `frontend/deploy/lafia.caddy`
envoie `/api/*` vers lui. La base vit dans le volume `lafia-data` : **à sauvegarder**.

```bash
mkdir -p registre && cp registre_signe.json registre/     # le registre en service, monté en lecture seule
docker compose up -d --build
# révoquer en production : sur le poste de l'autorité, puis copier le fichier signé dans registre/ sur le serveur
```

À faire avant une vraie mise en service : épingler l'image Python par son empreinte (digest), mettre en place la
sauvegarde du volume, et limiter le débit des requêtes dans Caddy.

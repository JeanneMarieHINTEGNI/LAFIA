"""API HTTP du backend Lafia (FastAPI). Servie derrière Caddy sous /api/ (même origine que le site : pas de CORS).

    POST /api/patients                         enregistre un patient et l'empreinte de son jeton secret
    POST /api/journal/chaines/{chaine}/entrees un appareil lecteur envoie ses nouvelles entrées (vérifiées ici)
    GET  /api/journal/patients/{id}            le patient lit SES entrées (en-tête Authorization: Bearer <jeton>)
    GET  /api/registre                         le registre des badges SIGNÉ par l'autorité (tel quel)
    GET  /api/sante                            état du service (supervision)

Variables d'environnement :
    LAFIA_DB         fichier SQLite, ou adresse Turso (libsql://…) ; TURSO_DATABASE_URL est aussi lue
    LAFIA_DB_JETON   jeton d'accès Turso (ou TURSO_AUTH_TOKEN)
    LAFIA_ORIGINES   sites autorisés à appeler l'API depuis une AUTRE adresse (CORS), séparés par des virgules,
                     ex. https://lafia-1nkp.vercel.app ; vide = même origine seulement (derrière Caddy)
    LAFIA_IP_ENTETE  en-tête qui porte l'adresse du client, posé par la plateforme (ex. x-forwarded-for sur Vercel,
                     choisi automatiquement) ; sinon l'adresse de la connexion (uvicorn --proxy-headers derrière Caddy)
    LAFIA_REGISTRE   registre signé (registre_signe.json) ; relu automatiquement s'il change (révocation sans redémarrage)
    LAFIA_AUTORITE   clé PUBLIQUE de l'autorité (autorite.pub.json) ; le serveur ne détient jamais la clé privée
    LAFIA_DEBIT_*    limites de débit par adresse IP (voir lafia/debit.py) ; LAFIA_DEBIT=0 les désactive (développement)
"""
from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .base import BaseIndisponible
from .debit import Limiteur, groupe_de, regles_depuis_env, secondes_entieres
from .journal import RX_PATIENT, EntreeInvalide
from .registre import RegistreInvalide, lire_pub, ouvrir
from .store import Conflit, Store

log = logging.getLogger("lafia")

MAX_ENTREES_PAR_ENVOI = 500
RX_JETON = re.compile(r"^[A-Za-z0-9_-]{32,128}$")


class RegistreCourant:
    """Registre signé chargé depuis un fichier, revérifié et rechargé quand le fichier change.

    Un nouveau fichier invalide (signature fausse) ou PLUS ANCIEN que celui en mémoire est ignoré : le serveur garde
    la dernière version valide. Un serveur ne peut donc pas être ramené à un registre où un badge révoqué était actif.
    """

    def __init__(self, chemin: str, pub_autorite: str):
        self.chemin, self.pub = chemin, pub_autorite
        self.doc: dict | None = None
        self.contenu: dict | None = None
        self._signature_fichier: tuple[int, int] | None = None
        self.rafraichir()
        if self.contenu is None:
            raise RegistreInvalide(f"aucun registre signé valide dans {chemin}")

    def rafraichir(self):
        try:
            st = os.stat(self.chemin)
        except OSError:
            return
        # Date à la nanoseconde ET taille : deux écritures rapprochées ne passent pas inaperçues.
        signature = (st.st_mtime_ns, st.st_size)
        if signature == self._signature_fichier:
            return
        self._signature_fichier = signature
        try:
            doc = json.loads(Path(self.chemin).read_text(encoding="utf-8"))
            contenu = ouvrir(doc, self.pub)
        except (RegistreInvalide, ValueError, OSError) as e:
            log.error("registre ignoré (%s) : on garde la version %s", e, self.contenu and self.contenu["version"])
            return
        if self.contenu and contenu["version"] < self.contenu["version"]:
            log.error("registre version %s plus ancien que la version %s en mémoire : ignoré", contenu["version"], self.contenu["version"])
            return
        self.doc, self.contenu = doc, contenu
        log.info("registre version %s chargé (%s badges)", contenu["version"], len(contenu["badges"]))

    @property
    def badges(self) -> dict:
        self.rafraichir()
        return self.contenu["badges"]  # type: ignore[index]


class Patient(BaseModel):
    id: str = Field(pattern=RX_PATIENT.pattern)
    jeton: str = Field(pattern=RX_JETON.pattern, description="secret aléatoire créé sur le téléphone du patient ; seul son empreinte est gardée")


class Envoi(BaseModel):
    entrees: list[dict] = Field(min_length=1, max_length=MAX_ENTREES_PAR_ENVOI)


RACINE = Path(__file__).resolve().parent.parent


def entete_ip_par_defaut() -> str | None:
    """Sur Vercel, l'adresse du client est dans x-forwarded-for, réécrit par la plateforme (le client ne peut pas l'imposer)."""
    return os.environ.get("LAFIA_IP_ENTETE") or ("x-forwarded-for" if os.environ.get("VERCEL") else None)


def adresse_client(request: Request, entete: str | None) -> str:
    if entete:
        valeur = request.headers.get(entete, "")
        if valeur:
            return valeur.split(",")[0].strip()
    return request.client.host if request.client else "inconnue"


_PAR_DEFAUT = object()


def creer_app(db: str | None = None, registre: str | None = None, autorite: str | None = None,
              limiteur: Limiteur | None | object = _PAR_DEFAUT) -> FastAPI:
    db = db or os.environ.get("LAFIA_DB") or os.environ.get("TURSO_DATABASE_URL") or "lafia.db"
    if os.environ.get("VERCEL") and db == "lafia.db":
        raise RuntimeError("Sur Vercel, le disque n'est pas conservé : définir LAFIA_DB (adresse Turso) et LAFIA_DB_JETON.")
    chemin_registre = registre or os.environ.get("LAFIA_REGISTRE", str(RACINE / "registre_signe.json"))
    chemin_autorite = autorite or os.environ.get("LAFIA_AUTORITE", str(RACINE / "autorite.pub.json"))
    store = Store(db)
    reg = RegistreCourant(chemin_registre, lire_pub(chemin_autorite))

    if limiteur is _PAR_DEFAUT:
        limiteur = None if os.environ.get("LAFIA_DEBIT") == "0" else Limiteur(regles_depuis_env())
    lim: Limiteur | None = limiteur  # type: ignore[assignment]
    entete_ip = entete_ip_par_defaut()

    app = FastAPI(title="Lafia", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)

    def trop(attente: float, message: str) -> JSONResponse:
        s = secondes_entieres(attente)
        return JSONResponse(status_code=429, headers={"Retry-After": str(s)},
                            content={"code": "TROP_DE_REQUETES", "message": message, "reessayer_dans_s": s})

    @app.middleware("http")
    async def _debit(request: Request, call_next):
        groupe = groupe_de(request.method, request.url.path) if lim else None
        if groupe is None:
            return await call_next(request)
        # Derrière Caddy, uvicorn (--proxy-headers) remplace l'adresse par celle du vrai client ; sur Vercel, l'en-tête de la plateforme.
        ip = adresse_client(request, entete_ip)
        if groupe == "lecture":
            attente = lim.attente("echec_jeton", ip)  # type: ignore[union-attr]
            if attente:
                return trop(attente, "Trop de secrets patients refusés depuis cette adresse. Réessayez plus tard.")
        attente = lim.essayer(groupe, ip)  # type: ignore[union-attr]
        if attente:
            return trop(attente, "Trop de requêtes depuis cette adresse. Réessayez plus tard.")
        reponse = await call_next(request)
        if groupe == "lecture" and reponse.status_code == 401:
            lim.noter("echec_jeton", ip)  # type: ignore[union-attr]
        return reponse

    @app.exception_handler(EntreeInvalide)
    async def _invalide(_: Request, e: EntreeInvalide):
        return JSONResponse(status_code=422, content={"code": e.code, "message": str(e)})

    @app.exception_handler(BaseIndisponible)
    async def _indisponible(_: Request, e: BaseIndisponible):
        log.error("base indisponible : %s", e)
        return JSONResponse(status_code=503, headers={"Retry-After": "30"},
                            content={"code": "BASE_INDISPONIBLE", "message": "Service momentanément indisponible. Réessayez."})

    @app.exception_handler(Conflit)
    async def _conflit(_: Request, e: Conflit):
        return JSONResponse(status_code=409, content={"code": "CONFLIT", "message": str(e)})

    @app.get("/api/sante")
    def sante():
        return {"ok": True, "badges_connus": len(reg.badges), "registre_version": reg.contenu["version"]}  # type: ignore[index]

    @app.get("/api/registre")
    def registre():
        # Le document tel que l'autorité l'a signé : chaque téléphone revérifie la signature lui-même.
        reg.rafraichir()
        return JSONResponse(reg.doc, headers={"Cache-Control": "no-cache"})

    @app.post("/api/patients", status_code=201)
    def enregistrer(p: Patient):
        cree = store.enregistrer_patient(p.id, p.jeton)
        return {"id": p.id, "cree": cree}

    @app.post("/api/journal/chaines/{chaine}/entrees")
    def recevoir(chaine: str, envoi: Envoi):
        return store.ajouter(chaine, envoi.entrees, reg.badges)

    @app.get("/api/journal/patients/{pid}")
    def lire(pid: str, authorization: str | None = Header(default=None)):
        if not RX_PATIENT.fullmatch(pid):
            raise HTTPException(422, "identifiant patient invalide")
        jeton = (authorization or "").removeprefix("Bearer ").strip()
        # Même réponse si l'identifiant n'existe pas ou si le jeton est faux : on ne révèle pas quels patients existent.
        if not jeton or not store.jeton_valide(pid, jeton):
            raise HTTPException(401, "jeton patient manquant ou invalide")
        return {"entrees": store.entrees_patient(pid)}

    # CORS en DERNIER : il enveloppe tout le reste, donc les réponses 429/503 portent aussi ses en-têtes et la
    # requête préalable (OPTIONS) du navigateur est servie sans compter dans la limitation du débit.
    origines = [o.strip().rstrip("/") for o in os.environ.get("LAFIA_ORIGINES", "").split(",") if o.strip()]
    if origines:
        app.add_middleware(CORSMiddleware, allow_origins=origines, allow_methods=["GET", "POST"],
                           allow_headers=["Authorization", "Content-Type"], allow_credentials=False, max_age=600)

    return app


app = creer_app() if os.environ.get("LAFIA_AUTOSTART", "1") == "1" else None
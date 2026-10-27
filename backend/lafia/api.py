"""API HTTP du backend Lafia (FastAPI). Servie derrière Caddy sous /api/ (même origine que le site : pas de CORS).

    POST /api/patients                         enregistre un patient et l'empreinte de son jeton secret
    POST /api/journal/chaines/{chaine}/entrees un appareil lecteur envoie ses nouvelles entrées (vérifiées ici)
    GET  /api/journal/patients/{id}            le patient lit SES entrées (en-tête Authorization: Bearer <jeton>)
    GET  /api/registre                         le registre des badges SIGNÉ par l'autorité (tel quel)
    GET  /api/sante                            état du service (supervision)

Variables d'environnement :
    LAFIA_DB         fichier SQLite
    LAFIA_REGISTRE   registre signé (registre_signe.json) ; relu automatiquement s'il change (révocation sans redémarrage)
    LAFIA_AUTORITE   clé PUBLIQUE de l'autorité (autorite.pub.json) ; le serveur ne détient jamais la clé privée
"""
from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

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


def creer_app(db: str | None = None, registre: str | None = None, autorite: str | None = None) -> FastAPI:
    db = db or os.environ.get("LAFIA_DB", "lafia.db")
    chemin_registre = registre or os.environ.get("LAFIA_REGISTRE", str(RACINE / "registre_signe.json"))
    chemin_autorite = autorite or os.environ.get("LAFIA_AUTORITE", str(RACINE / "autorite.pub.json"))
    store = Store(db)
    reg = RegistreCourant(chemin_registre, lire_pub(chemin_autorite))

    app = FastAPI(title="Lafia", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)

    @app.exception_handler(EntreeInvalide)
    async def _invalide(_: Request, e: EntreeInvalide):
        return JSONResponse(status_code=422, content={"code": e.code, "message": str(e)})

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

    return app


app = creer_app() if os.environ.get("LAFIA_AUTOSTART", "1") == "1" else None
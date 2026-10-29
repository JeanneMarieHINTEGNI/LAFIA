"""Accès à la base, deux moteurs pour le même schéma SQLite :

- **fichier SQLite** (serveur à nous, tests) : `Store("lafia.db")` ;
- **Turso** (base SQLite hébergée, offre gratuite) : `Store("libsql://<base>-<org>.turso.io", jeton=…)`, utilisée quand le
  backend tourne sans disque (fonction Vercel). On parle à Turso par son API HTTP (`POST /v2/pipeline`), sans
  dépendance supplémentaire : une requête = un aller-retour, une transaction garde sa connexion grâce au « baton ».

Les deux moteurs exposent la même petite interface (`Connexion`) ; les lignes reviennent sous forme de dict.
"""
from __future__ import annotations

import base64
import json
import sqlite3
import urllib.error
import urllib.request
from typing import Any, Iterable, Sequence

Ligne = dict[str, Any]


class BaseIndisponible(Exception):
    """La base ne répond pas (réseau, panne de l'hébergeur) : le service renvoie 503, rien n'est perdu côté appareil."""


class ErreurBase(Exception):
    """La base a refusé une requête (contrainte, SQL) : erreur de programmation ou concurrence."""


def est_distante(cible: str) -> bool:
    return cible.startswith(("libsql://", "https://", "http://"))


# ---------------------------------------------------------------- fichier SQLite

class ConnexionSqlite:
    def __init__(self, chemin: str):
        self.cx = sqlite3.connect(chemin, timeout=10, isolation_level=None)
        self.cx.row_factory = sqlite3.Row
        self.cx.execute("PRAGMA journal_mode=WAL")
        self.cx.execute("PRAGMA foreign_keys=ON")

    def executer(self, sql: str, params: Sequence[Any] = ()) -> list[Ligne]:
        try:
            return [dict(r) for r in self.cx.execute(sql, tuple(params)).fetchall()]
        except sqlite3.IntegrityError as e:
            raise ErreurBase(str(e)) from e

    def executer_lot(self, requetes: Iterable[tuple[str, Sequence[Any]]]) -> None:
        for sql, params in requetes:
            self.executer(sql, params)

    def commencer(self) -> None:
        self.cx.execute("BEGIN IMMEDIATE")

    def fermer(self) -> None:
        self.cx.close()


# ---------------------------------------------------------------- Turso (HTTP)

def _arg(v: Any) -> dict:
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": str(int(v))}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}          # en texte : pas de perte de précision
    if isinstance(v, float):
        return {"type": "float", "value": v}
    if isinstance(v, (bytes, bytearray)):
        return {"type": "blob", "base64": base64.b64encode(bytes(v)).decode("ascii")}
    return {"type": "text", "value": str(v)}


def _valeur(c: dict) -> Any:
    t = c.get("type")
    if t == "null":
        return None
    if t == "integer":
        return int(c["value"])
    if t == "float":
        return float(c["value"])
    if t == "blob":
        return base64.b64decode(c["base64"])
    return c.get("value")


class ConnexionTurso:
    def __init__(self, url: str, jeton: str, delai: float = 10.0):
        self.url = "https://" + url.removeprefix("libsql://") if url.startswith("libsql://") else url
        self.url = self.url.rstrip("/")
        self.jeton, self.delai = jeton, delai
        self.baton: str | None = None          # connexion gardée ouverte (transaction en cours)

    def _envoyer(self, requetes: list[dict], fermer: bool) -> list[dict]:
        corps: dict[str, Any] = {"requests": requetes + ([{"type": "close"}] if fermer else [])}
        if self.baton:
            corps["baton"] = self.baton
        req = urllib.request.Request(f"{self.url}/v2/pipeline", data=json.dumps(corps).encode("utf-8"), method="POST",
                                     headers={"Authorization": f"Bearer {self.jeton}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=self.delai) as r:
                rep = json.loads(r.read())
        except urllib.error.HTTPError as e:
            raise BaseIndisponible(f"Turso a répondu {e.code}") from e
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
            raise BaseIndisponible(f"Turso injoignable : {e}") from e
        self.baton = None if fermer else rep.get("baton")
        if rep.get("base_url"):
            self.url = rep["base_url"].rstrip("/")
        resultats = rep.get("results", [])
        sorties = []
        for res in resultats[: len(requetes)]:
            if res.get("type") != "ok":
                raise ErreurBase((res.get("error") or {}).get("message", "requête refusée par Turso"))
            sorties.append(res["response"])
        return sorties

    @staticmethod
    def _stmt(sql: str, params: Sequence[Any]) -> dict:
        return {"type": "execute", "stmt": {"sql": sql, "args": [_arg(p) for p in params]}}

    def executer(self, sql: str, params: Sequence[Any] = ()) -> list[Ligne]:
        # Hors transaction, chaque requête ouvre et ferme sa connexion ; dans une transaction, on garde le baton.
        (rep,) = self._envoyer([self._stmt(sql, params)], fermer=self.baton is None)
        res = rep["result"]
        noms = [c["name"] for c in res["cols"]]
        return [dict(zip(noms, (_valeur(v) for v in ligne))) for ligne in res["rows"]]

    def executer_lot(self, requetes: Iterable[tuple[str, Sequence[Any]]]) -> None:
        """Plusieurs requêtes en UN aller-retour (les insertions d'un envoi d'entrées)."""
        lot = [self._stmt(s, p) for s, p in requetes]
        if lot:
            self._envoyer(lot, fermer=self.baton is None)

    def commencer(self) -> None:
        self._envoyer([self._stmt("BEGIN IMMEDIATE", ())], fermer=False)

    def fermer(self) -> None:
        if self.baton:
            try:
                self._envoyer([], fermer=True)
            except (BaseIndisponible, ErreurBase):
                pass                            # la connexion expire d'elle-même côté Turso
        self.baton = None


Connexion = ConnexionSqlite | ConnexionTurso


def ouvrir(cible: str, jeton: str | None) -> Connexion:
    if est_distante(cible):
        if not jeton:
            raise ValueError("base Turso sans jeton d'accès (LAFIA_DB_JETON ou TURSO_AUTH_TOKEN)")
        return ConnexionTurso(cible, jeton)
    return ConnexionSqlite(cible)
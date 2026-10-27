"""Stockage SQLite du journal partagé (un seul fichier, aucune installation de serveur de base de données).

Ce que le serveur conserve : des entrées de journal déjà signées par les appareils, et l'empreinte du jeton de
chaque patient. Il ne conserve AUCUNE donnée médicale : ni carte, ni allergie, ni traitement.
Ce qu'il voit malgré tout (limite assumée, à chiffrer plus tard) : quel badge a lu quelle carte, quand et où.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import sqlite3
import time
from pathlib import Path
from typing import Iterable, Mapping

from .journal import ZERO, Entree, EntreeInvalide, verifier_entree

SCHEMA = """
CREATE TABLE IF NOT EXISTS entrees (
  chaine    TEXT    NOT NULL,          -- identifiant aléatoire de l'appareil lecteur
  i         INTEGER NOT NULL,
  t         INTEGER NOT NULL,
  action    TEXT    NOT NULL,
  cible     TEXT    NOT NULL,          -- identifiant Lafia du patient (pseudonyme aléatoire)
  rubriques TEXT    NOT NULL,          -- JSON
  etab      TEXT,
  acteur    TEXT,
  prev      TEXT    NOT NULL,
  hash      TEXT    NOT NULL,
  sig       TEXT,
  statut    TEXT    NOT NULL,          -- signee | sans_badge | badge_inconnu (au moment de la réception)
  recu      INTEGER NOT NULL,
  PRIMARY KEY (chaine, i)
);
CREATE INDEX IF NOT EXISTS entrees_cible ON entrees (cible, t);
CREATE TABLE IF NOT EXISTS patients (
  id           TEXT PRIMARY KEY,
  jeton_sha256 TEXT NOT NULL,
  cree         INTEGER NOT NULL
);
"""

RX_CHAINE = re.compile(r"^c-[0-9a-f]{16,32}$")


def empreinte(jeton: str) -> str:
    return hashlib.sha256(jeton.encode("utf-8")).hexdigest()


def _ligne_vers_entree(r: sqlite3.Row) -> Entree:
    return Entree(i=r["i"], t=r["t"], action=r["action"], cible=r["cible"], rubriques=tuple(json.loads(r["rubriques"])),
                  prev=r["prev"], hash=r["hash"], etab=r["etab"], acteur=r["acteur"], sig=r["sig"])


class Conflit(Exception):
    """La requête contredit ce qui est déjà enregistré (ex. une autre version d'une entrée déjà reçue)."""


class Store:
    def __init__(self, chemin: str | Path):
        self.chemin = str(chemin)
        with self._cx() as cx:
            cx.executescript(SCHEMA)

    def _cx(self) -> sqlite3.Connection:
        cx = sqlite3.connect(self.chemin, timeout=10, isolation_level=None)
        cx.row_factory = sqlite3.Row
        cx.execute("PRAGMA journal_mode=WAL")
        cx.execute("PRAGMA foreign_keys=ON")
        return cx

    # ---------- journal ----------
    def ajouter(self, chaine: str, brutes: Iterable[Mapping], registre: Mapping[str, Mapping], maintenant: int | None = None) -> dict:
        """Ajoute des entrées consécutives à la chaîne d'un appareil. Tout ou rien.

        Renvoyer des entrées déjà reçues (identiques) est sans effet : l'appareil peut réessayer sans risque.
        Une entrée déjà reçue mais DIFFÉRENTE est un conflit (chaîne réécrite ou fourchue) : refus.
        """
        if not RX_CHAINE.match(chaine):
            raise EntreeInvalide("FORME", "identifiant de chaîne invalide")
        maintenant = maintenant or int(time.time())
        entrees = [Entree.depuis_dict(b) for b in brutes]
        cx = self._cx()
        try:
            cx.execute("BEGIN IMMEDIATE")
            dernier = cx.execute("SELECT i, hash FROM entrees WHERE chaine=? ORDER BY i DESC LIMIT 1", (chaine,)).fetchone()
            suivant, prev = (dernier["i"] + 1, dernier["hash"]) if dernier else (0, ZERO)
            deja = acceptees = 0
            for e in sorted(entrees, key=lambda x: x.i):
                if e.i < suivant:
                    # Déjà reçue : acceptée comme simple renvoi seulement si TOUT est identique (pas seulement l'empreinte).
                    connu = cx.execute("SELECT * FROM entrees WHERE chaine=? AND i=?", (chaine, e.i)).fetchone()
                    if connu and _ligne_vers_entree(connu) == e:
                        deja += 1
                        continue
                    raise Conflit(f"l'entrée {e.i} a déjà été reçue avec un autre contenu")
                statut = verifier_entree(e, suivant, prev, registre, maintenant)
                cx.execute(
                    "INSERT INTO entrees (chaine,i,t,action,cible,rubriques,etab,acteur,prev,hash,sig,statut,recu) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (chaine, e.i, e.t, e.action, e.cible, json.dumps(list(e.rubriques)), e.etab, e.acteur, e.prev, e.hash, e.sig, statut, maintenant),
                )
                suivant, prev = e.i + 1, e.hash
                acceptees += 1
            cx.execute("COMMIT")
            return {"acceptees": acceptees, "deja_recues": deja, "prochain_rang": suivant}
        except BaseException:
            cx.execute("ROLLBACK")
            raise
        finally:
            cx.close()

    def entrees_patient(self, cible: str) -> list[dict]:
        with self._cx() as cx:
            lignes = cx.execute("SELECT * FROM entrees WHERE cible=? ORDER BY t DESC, chaine, i DESC", (cible,)).fetchall()
        out = []
        for r in lignes:
            e = _ligne_vers_entree(r)
            out.append({**e.vers_dict(), "chaine": r["chaine"], "statut": r["statut"]})
        return out

    # ---------- patients ----------
    def enregistrer_patient(self, pid: str, jeton: str) -> bool:
        """Premier enregistrement = propriétaire. Renvoie True si créé, False si déjà enregistré avec CE jeton."""
        h = empreinte(jeton)
        with self._cx() as cx:
            r = cx.execute("SELECT jeton_sha256 FROM patients WHERE id=?", (pid,)).fetchone()
            if r:
                if hmac.compare_digest(r["jeton_sha256"], h):
                    return False
                raise Conflit("cet identifiant est déjà enregistré par un autre appareil")
            cx.execute("INSERT INTO patients (id, jeton_sha256, cree) VALUES (?,?,?)", (pid, h, int(time.time())))
            return True

    def jeton_valide(self, pid: str, jeton: str) -> bool:
        with self._cx() as cx:
            r = cx.execute("SELECT jeton_sha256 FROM patients WHERE id=?", (pid,)).fetchone()
        return bool(r) and hmac.compare_digest(r["jeton_sha256"], empreinte(jeton))

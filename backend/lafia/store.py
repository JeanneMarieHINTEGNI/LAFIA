"""Stockage du journal partagé : fichier SQLite (serveur à nous) ou Turso, la même base SQLite hébergée (voir base.py).

Ce que le serveur conserve : des entrées de journal déjà signées par les appareils, et l'empreinte du jeton de
chaque patient. Il ne conserve AUCUNE donnée médicale : ni carte, ni allergie, ni traitement.
Ce qu'il voit malgré tout (limite assumée, à chiffrer plus tard) : quel badge a lu quelle carte, quand et où.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Iterable, Mapping

from .base import ErreurBase, est_distante, ouvrir
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
  motif     TEXT,                    -- lecture sans badge : pourquoi (catalogue fermé)
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


def _ligne_vers_entree(r: Mapping[str, Any]) -> Entree:
    return Entree(i=r["i"], t=r["t"], action=r["action"], cible=r["cible"], rubriques=tuple(json.loads(r["rubriques"])),
                  prev=r["prev"], hash=r["hash"], etab=r["etab"], acteur=r["acteur"], sig=r["sig"], motif=r["motif"])


class Conflit(Exception):
    """La requête contredit ce qui est déjà enregistré (ex. une autre version d'une entrée déjà reçue)."""


class Store:
    def __init__(self, chemin: str | Path, jeton: str | None = None):
        """`chemin` : fichier SQLite, ou adresse Turso (libsql://… / https://…) avec son jeton d'accès."""
        self.chemin = str(chemin)
        self.jeton = jeton or os.environ.get("LAFIA_DB_JETON") or os.environ.get("TURSO_AUTH_TOKEN")
        self.distante = est_distante(self.chemin)
        cx = self._cx()
        try:
            for instruction in (i.strip() for i in SCHEMA.split(";")):
                if instruction:
                    cx.executer(instruction)
            # Migration d'une base créée avant l'ajout du motif : la colonne est ajoutée, les données restent.
            colonnes = {r["name"] for r in cx.executer("PRAGMA table_info(entrees)")}
            if "motif" not in colonnes:
                cx.executer("ALTER TABLE entrees ADD COLUMN motif TEXT")
        finally:
            cx.fermer()

    def _cx(self):
        return ouvrir(self.chemin, self.jeton)

    # ---------- journal ----------
    def ajouter(self, chaine: str, brutes: Iterable[Mapping], registre: Mapping[str, Mapping], maintenant: int | None = None) -> dict:
        """Ajoute des entrées consécutives à la chaîne d'un appareil. Tout ou rien.

        Renvoyer des entrées déjà reçues (identiques) est sans effet : l'appareil peut réessayer sans risque.
        Une entrée déjà reçue mais DIFFÉRENTE est un conflit (chaîne réécrite ou fourchue) : refus.
        """
        if not RX_CHAINE.fullmatch(chaine):
            raise EntreeInvalide("FORME", "identifiant de chaîne invalide")
        maintenant = maintenant or int(time.time())
        entrees = sorted((Entree.depuis_dict(b) for b in brutes), key=lambda x: x.i)
        cx = self._cx()
        try:
            cx.commencer()
            # Peu d'allers-retours (la base peut être distante) : dernier rang, entrées déjà reçues de la plage, puis
            # toutes les insertions d'un coup. La vérification des signatures se fait ici, en Python.
            dernier = cx.executer("SELECT i, hash FROM entrees WHERE chaine=? ORDER BY i DESC LIMIT 1", (chaine,))
            suivant, prev = (dernier[0]["i"] + 1, dernier[0]["hash"]) if dernier else (0, ZERO)
            connues = {}
            if entrees and entrees[0].i < suivant:
                connues = {r["i"]: r for r in cx.executer("SELECT * FROM entrees WHERE chaine=? AND i>=? AND i<?",
                                                          (chaine, entrees[0].i, suivant))}
            deja = 0
            insertions = []
            for e in entrees:
                if e.i < suivant:
                    # Déjà reçue : acceptée comme simple renvoi seulement si TOUT est identique (pas seulement l'empreinte).
                    connu = connues.get(e.i)
                    if connu and _ligne_vers_entree(connu) == e:
                        deja += 1
                        continue
                    raise Conflit(f"l'entrée {e.i} a déjà été reçue avec un autre contenu")
                statut = verifier_entree(e, suivant, prev, registre, maintenant)
                insertions.append((
                    "INSERT INTO entrees (chaine,i,t,action,cible,rubriques,etab,acteur,motif,prev,hash,sig,statut,recu) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (chaine, e.i, e.t, e.action, e.cible, json.dumps(list(e.rubriques)), e.etab, e.acteur, e.motif, e.prev, e.hash, e.sig, statut, maintenant),
                ))
                suivant, prev = e.i + 1, e.hash
            cx.executer_lot(insertions)
            cx.executer("COMMIT")
            return {"acceptees": len(insertions), "deja_recues": deja, "prochain_rang": suivant}
        except BaseException:
            try:
                cx.executer("ROLLBACK")
            except Exception:
                pass                     # base injoignable : la transaction expire d'elle-même, rien n'est écrit
            raise
        finally:
            cx.fermer()

    def entrees_patient(self, cible: str) -> list[dict]:
        cx = self._cx()
        try:
            lignes = cx.executer("SELECT * FROM entrees WHERE cible=? ORDER BY t DESC, chaine, i DESC", (cible,))
        finally:
            cx.fermer()
        out = []
        for r in lignes:
            e = _ligne_vers_entree(r)
            out.append({**e.vers_dict(), "chaine": r["chaine"], "statut": r["statut"]})
        return out

    # ---------- patients ----------
    def enregistrer_patient(self, pid: str, jeton: str) -> bool:
        """Premier enregistrement = propriétaire. Renvoie True si créé, False si déjà enregistré avec CE jeton."""
        h = empreinte(jeton)
        cx = self._cx()
        try:
            r = cx.executer("SELECT jeton_sha256 FROM patients WHERE id=?", (pid,))
            if not r:
                try:
                    cx.executer("INSERT INTO patients (id, jeton_sha256, cree) VALUES (?,?,?)", (pid, h, int(time.time())))
                    return True
                except ErreurBase:
                    # Deux enregistrements simultanés : l'autre a gagné ; on compare avec ce qu'il a écrit.
                    r = cx.executer("SELECT jeton_sha256 FROM patients WHERE id=?", (pid,))
        finally:
            cx.fermer()
        if r and hmac.compare_digest(r[0]["jeton_sha256"], h):
            return False
        raise Conflit("cet identifiant est déjà enregistré par un autre appareil")

    def jeton_valide(self, pid: str, jeton: str) -> bool:
        cx = self._cx()
        try:
            r = cx.executer("SELECT jeton_sha256 FROM patients WHERE id=?", (pid,))
        finally:
            cx.fermer()
        return bool(r) and hmac.compare_digest(r[0]["jeton_sha256"], empreinte(jeton))
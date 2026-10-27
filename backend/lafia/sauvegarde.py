"""Sauvegarde et restauration de la base SQLite (journaux des patients, empreintes de leurs secrets).

    python -m lafia.sauvegarde creer     --db /data/lafia.db --dossier /sauvegardes [--garder 14]
    python -m lafia.sauvegarde verifier  /sauvegardes/lafia-20261027-030000.db
    python -m lafia.sauvegarde restaurer /sauvegardes/lafia-20261027-030000.db --db /data/lafia.db

« creer » copie la base À CHAUD avec l'API officielle de SQLite (le service n'est pas arrêté, la copie est cohérente
même pendant une écriture), vérifie l'intégrité de la copie, puis ne garde que les N plus récentes.
« restaurer » exige que le service soit ARRÊTÉ ; l'ancienne base est gardée à côté (…​.avant-restauration).

Une sauvegarde qui reste sur le même disque ne protège pas d'une panne de ce disque : copiez aussi le dossier
de sauvegardes ailleurs (autre machine, stockage externe), régulièrement.
"""
from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys
import time
from pathlib import Path

RX_NOM = re.compile(r"^lafia-\d{8}-\d{6}\.db$")


class SauvegardeInvalide(Exception):
    pass


def verifier(chemin: str | Path) -> dict:
    """Ouvre la copie en LECTURE SEULE, contrôle son intégrité et compte son contenu. Lève SauvegardeInvalide."""
    chemin = Path(chemin)
    if not chemin.is_file():
        raise SauvegardeInvalide(f"{chemin} : fichier introuvable")
    try:
        cx = sqlite3.connect(f"file:{chemin}?mode=ro", uri=True)
        try:
            etat = cx.execute("PRAGMA integrity_check").fetchone()[0]
            if etat != "ok":
                raise SauvegardeInvalide(f"{chemin} : intégrité compromise ({etat})")
            tables = {r[0] for r in cx.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {"entrees", "patients"} <= tables:
                raise SauvegardeInvalide(f"{chemin} : ce n'est pas une base Lafia (tables manquantes)")
            return {
                "entrees": cx.execute("SELECT COUNT(*) FROM entrees").fetchone()[0],
                "patients": cx.execute("SELECT COUNT(*) FROM patients").fetchone()[0],
            }
        finally:
            cx.close()
    except sqlite3.DatabaseError as e:
        raise SauvegardeInvalide(f"{chemin} : fichier illisible ({e})") from None


def creer(db: str | Path, dossier: str | Path, garder: int = 14, maintenant: float | None = None) -> Path:
    """Copie cohérente de `db` dans `dossier`, vérifiée, puis rotation. Renvoie le chemin de la copie."""
    if garder < 1:
        raise ValueError("garder doit valoir au moins 1")
    db, dossier = Path(db), Path(dossier)
    if not db.is_file():
        raise SauvegardeInvalide(f"{db} : base introuvable")
    dossier.mkdir(parents=True, exist_ok=True)
    nom = time.strftime("lafia-%Y%m%d-%H%M%S.db", time.gmtime(maintenant))
    final, temporaire = dossier / nom, dossier / (nom + ".partiel")
    source = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        cible = sqlite3.connect(temporaire)
        try:
            source.backup(cible)              # API officielle : copie cohérente même pendant des écritures
            # La base est en mode WAL et la copie en hérite : sans ceci, elle dépendrait de fichiers -wal/-shm annexes
            # (et pourrait être incomplète une fois déplacée seule). On en fait un fichier UNIQUE et autonome.
            cible.execute("PRAGMA journal_mode=DELETE").fetchone()
        finally:
            cible.close()
    finally:
        source.close()
    try:
        verifier(temporaire)
    except SauvegardeInvalide:
        temporaire.unlink(missing_ok=True)
        raise
    os.replace(temporaire, final)            # la copie n'apparaît sous son vrai nom qu'une fois complète et vérifiée
    for ancienne in sorted(p for p in dossier.iterdir() if RX_NOM.match(p.name))[:-garder]:
        ancienne.unlink()
    return final


def restaurer(copie: str | Path, db: str | Path) -> Path | None:
    """Remplace `db` par une copie VÉRIFIÉE. Service arrêté obligatoire. Renvoie l'ancienne base mise de côté."""
    copie, db = Path(copie), Path(db)
    verifier(copie)
    mise_de_cote = None
    if db.exists():
        mise_de_cote = db.with_name(db.name + ".avant-restauration")
        os.replace(db, mise_de_cote)
    for suffixe in ("-wal", "-shm"):         # restes du journal SQLite de l'ancienne base : à écarter
        Path(str(db) + suffixe).unlink(missing_ok=True)
    temporaire = db.with_name(db.name + ".restauration")
    temporaire.write_bytes(copie.read_bytes())
    os.replace(temporaire, db)
    return mise_de_cote


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m lafia.sauvegarde", description="Sauvegarde et restauration de la base Lafia.")
    sp = p.add_subparsers(dest="cmd", required=True)
    c = sp.add_parser("creer", help="copie à chaud, vérifiée, avec rotation")
    c.add_argument("--db", required=True); c.add_argument("--dossier", required=True); c.add_argument("--garder", type=int, default=14)
    v = sp.add_parser("verifier", help="contrôle une copie (intégrité, contenu)")
    v.add_argument("copie")
    r = sp.add_parser("restaurer", help="remplace la base par une copie (ARRÊTEZ le service avant)")
    r.add_argument("copie"); r.add_argument("--db", required=True)
    a = p.parse_args(argv)
    try:
        if a.cmd == "creer":
            chemin = creer(a.db, a.dossier, a.garder)
            print(f"sauvegarde créée et vérifiée : {chemin} ({verifier(chemin)})")
        elif a.cmd == "verifier":
            print(f"copie valide : {verifier(a.copie)}")
        else:
            ancienne = restaurer(a.copie, a.db)
            print(f"base restaurée depuis {a.copie}" + (f" ; ancienne base gardée : {ancienne}" if ancienne else ""))
        return 0
    except (SauvegardeInvalide, ValueError, OSError) as e:
        print(f"ERREUR : {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
"""Sauvegardes : copie cohérente à chaud, vérifiée, avec rotation ; restauration sûre."""
import json
import sqlite3
from pathlib import Path

import pytest

from lafia import sauvegarde as S
from lafia.store import Store

V = json.loads((Path(__file__).parent / "vecteurs_journal.json").read_text(encoding="utf-8"))
CHAINE = "c-" + "a1" * 8


def base_remplie(tmp_path) -> Path:
    db = tmp_path / "lafia.db"
    st = Store(db)
    st.ajouter(CHAINE, V["entrees"], V["registre"])
    st.enregistrer_patient("p-0123456789abcdef", "j" * 43)
    return db


def test_copie_a_chaud_complete_et_verifiee(tmp_path):
    db = base_remplie(tmp_path)          # base en mode WAL : les dernières écritures sont encore dans le fichier -wal
    copie = S.creer(db, tmp_path / "sauv", maintenant=1_793_000_000)
    assert S.RX_NOM.match(copie.name)
    assert S.verifier(copie) == {"entrees": 5, "patients": 1}
    assert not list((tmp_path / "sauv").glob("*.partiel"))
    # La copie est une base autonome, sans fichier -wal à côté.
    assert not Path(str(copie) + "-wal").exists()


def test_rotation_garde_les_plus_recentes(tmp_path):
    db = base_remplie(tmp_path)
    copies = [S.creer(db, tmp_path / "sauv", garder=3, maintenant=1_793_000_000 + 86_400 * i) for i in range(5)]
    restantes = sorted(p.name for p in (tmp_path / "sauv").iterdir())
    assert restantes == sorted(c.name for c in copies[-3:])


def test_la_rotation_ne_touche_pas_aux_autres_fichiers(tmp_path):
    db = base_remplie(tmp_path)
    (tmp_path / "sauv").mkdir()
    (tmp_path / "sauv" / "notes.txt").write_text("à garder")
    for i in range(3):
        S.creer(db, tmp_path / "sauv", garder=1, maintenant=1_793_000_000 + i)
    assert (tmp_path / "sauv" / "notes.txt").exists()


def test_verifier_refuse_un_fichier_abime_ou_etranger(tmp_path):
    abime = tmp_path / "abime.db"
    abime.write_bytes(b"pas une base sqlite" * 100)
    with pytest.raises(S.SauvegardeInvalide):
        S.verifier(abime)
    etrangere = tmp_path / "autre.db"
    sqlite3.connect(etrangere).executescript("CREATE TABLE t (x); INSERT INTO t VALUES (1);")
    with pytest.raises(S.SauvegardeInvalide, match="pas une base Lafia"):
        S.verifier(etrangere)
    with pytest.raises(S.SauvegardeInvalide, match="introuvable"):
        S.verifier(tmp_path / "absente.db")


def test_restaurer_remplace_la_base_et_garde_l_ancienne(tmp_path):
    db = base_remplie(tmp_path)
    copie = S.creer(db, tmp_path / "sauv", maintenant=1_793_000_000)
    # Accident : la base est vidée après la sauvegarde.
    cx = sqlite3.connect(db); cx.execute("DELETE FROM entrees"); cx.commit(); cx.close()
    ancienne = S.restaurer(copie, db)
    assert ancienne is not None and ancienne.exists()
    assert S.verifier(db) == {"entrees": 5, "patients": 1}
    assert len(Store(db).entrees_patient(V["entrees"][0]["cible"])) > 0    # le service repart dessus


def test_restaurer_refuse_une_copie_abimee_sans_toucher_a_la_base(tmp_path):
    db = base_remplie(tmp_path)
    avant = db.read_bytes()
    abime = tmp_path / "abime.db"
    abime.write_bytes(b"x" * 4096)
    with pytest.raises(S.SauvegardeInvalide):
        S.restaurer(abime, db)
    assert db.read_bytes() == avant


def test_ligne_de_commande(tmp_path, capsys):
    db = base_remplie(tmp_path)
    assert S.main(["creer", "--db", str(db), "--dossier", str(tmp_path / "sauv"), "--garder", "2"]) == 0
    copie = next((tmp_path / "sauv").iterdir())
    assert S.main(["verifier", str(copie)]) == 0
    assert S.main(["verifier", str(tmp_path / "absente.db")]) == 1
    assert "ERREUR" in capsys.readouterr().err
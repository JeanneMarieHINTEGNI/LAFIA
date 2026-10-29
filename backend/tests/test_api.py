"""API de bout en bout : un appareil lecteur envoie ses lectures, le patient les retrouve avec son jeton."""
import copy
import json
import secrets
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from lafia.api import creer_app
from faux_turso import FauxTurso
from lafia.registre import cle_demo, signer

V = json.loads((Path(__file__).parent / "vecteurs_journal.json").read_text(encoding="utf-8"))
CHAINE = "c-" + "a1" * 8
PATIENT = "p-0123456789abcdef"


@pytest.fixture(params=["sqlite", "turso"])
def client(request, tmp_path, monkeypatch):
    """Chaque test de l'API tourne deux fois : base en fichier SQLite, et base Turso (faux serveur HTTP local)."""
    reg = tmp_path / "registre_signe.json"
    reg.write_text(json.dumps(signer(V["registre"], 1, cle_demo())), encoding="utf-8")
    pub = tmp_path / "autorite.pub.json"
    pub.write_text(json.dumps({"pub": cle_demo().verify_key.encode().hex()}), encoding="utf-8")
    if request.param == "sqlite":
        yield TestClient(creer_app(db=str(tmp_path / "t.db"), registre=str(reg), autorite=str(pub)))
        return
    faux = FauxTurso(str(tmp_path / "turso.db"))
    monkeypatch.setenv("LAFIA_DB_JETON", faux.jeton)
    yield TestClient(creer_app(db=faux.url, registre=str(reg), autorite=str(pub)))
    faux.arreter()


def jeton():
    return secrets.token_urlsafe(32)


def envoyer(client, entrees, chaine=CHAINE):
    return client.post(f"/api/journal/chaines/{chaine}/entrees", json={"entrees": entrees})


def test_sante(client):
    assert client.get("/api/sante").json() == {"ok": True, "badges_connus": 3, "registre_version": 1}


def test_parcours_complet(client):
    j = jeton()
    assert client.post("/api/patients", json={"id": PATIENT, "jeton": j}).status_code == 201
    r = envoyer(client, V["entrees"])
    assert r.status_code == 200 and r.json() == {"acceptees": 5, "deja_recues": 0, "prochain_rang": 5}
    lu = client.get(f"/api/journal/patients/{PATIENT}", headers={"Authorization": f"Bearer {j}"})
    assert lu.status_code == 200
    entrees = lu.json()["entrees"]
    # Seulement SES entrées (3 sur 4), la plus récente d'abord, avec le statut calculé par le serveur.
    assert [e["i"] for e in entrees] == [3, 1, 0]
    assert [e["statut"] for e in entrees] == ["signee", "sans_badge", "signee"]
    assert entrees[0]["chaine"] == CHAINE


def test_renvoi_identique_sans_effet_et_envoi_par_morceaux(client):
    assert envoyer(client, V["entrees"][:2]).json()["acceptees"] == 2
    r = envoyer(client, V["entrees"])          # l'appareil renvoie tout : les 2 premières sont reconnues
    assert r.json() == {"acceptees": 3, "deja_recues": 2, "prochain_rang": 5}


def test_trou_dans_la_chaine_refuse(client):
    r = envoyer(client, V["entrees"][1:])
    assert r.status_code == 422 and r.json()["code"] == "RANG"


def test_tout_ou_rien(client):
    b = copy.deepcopy(V["entrees"])
    b[2]["etab"] = "ffffff"                    # 3e entrée altérée
    assert envoyer(client, b).status_code == 422
    assert envoyer(client, V["entrees"]).json()["acceptees"] == 5   # rien n'avait été gardé


def test_reecriture_d_une_entree_deja_recue_refusee(client):
    envoyer(client, V["entrees"])
    b = copy.deepcopy(V["entrees"][:1])
    b[0]["t"] += 1
    r = envoyer(client, b)
    assert r.status_code == 409 and r.json()["code"] == "CONFLIT"


def test_lecture_exige_le_bon_jeton(client):
    j = jeton()
    client.post("/api/patients", json={"id": PATIENT, "jeton": j})
    envoyer(client, V["entrees"])
    assert client.get(f"/api/journal/patients/{PATIENT}").status_code == 401
    assert client.get(f"/api/journal/patients/{PATIENT}", headers={"Authorization": f"Bearer {jeton()}"}).status_code == 401
    # Identifiant jamais enregistré : même réponse, on ne révèle pas quels patients existent.
    assert client.get("/api/journal/patients/p-1111111111111111", headers={"Authorization": f"Bearer {j}"}).status_code == 401


def test_enregistrement_patient(client):
    j = jeton()
    assert client.post("/api/patients", json={"id": PATIENT, "jeton": j}).json()["cree"] is True
    assert client.post("/api/patients", json={"id": PATIENT, "jeton": j}).json()["cree"] is False   # même appareil : ok
    assert client.post("/api/patients", json={"id": PATIENT, "jeton": jeton()}).status_code == 409   # autre appareil : refus
    assert client.post("/api/patients", json={"id": PATIENT, "jeton": "court"}).status_code == 422


def test_identifiant_de_chaine_invalide(client):
    assert envoyer(client, V["entrees"], chaine="../../etc").status_code in (404, 422)
    assert envoyer(client, V["entrees"], chaine="c-xyz").status_code == 422


def test_envoi_vide_ou_trop_gros_refuse(client):
    assert envoyer(client, []).status_code == 422
    assert envoyer(client, [V["entrees"][0]] * 501).status_code == 422


def test_identifiants_avec_saut_de_ligne_refuses(client):
    assert client.get("/api/journal/patients/p-0123456789abcdef%0A", headers={"Authorization": "Bearer " + "j" * 40}).status_code == 422
    assert envoyer(client, V["entrees"], chaine="c-" + "a1" * 8 + "%0A").status_code in (404, 422)


def test_motif_rendu_au_patient(client):
    j = jeton()
    autre = V["entrees"][4]["cible"]
    client.post("/api/patients", json={"id": autre, "jeton": j})
    envoyer(client, V["entrees"])
    lu = client.get(f"/api/journal/patients/{autre}", headers={"Authorization": f"Bearer {j}"}).json()["entrees"]
    assert [(e["i"], e.get("motif"), e["statut"]) for e in lu] == [(4, "INCONSCIENT", "sans_badge"), (2, None, "signee")]


def test_migration_d_une_base_sans_colonne_motif(tmp_path):
    import sqlite3
    from lafia.store import Store
    db = tmp_path / "ancienne.db"
    cx = sqlite3.connect(db)
    cx.executescript("""CREATE TABLE entrees (chaine TEXT NOT NULL, i INTEGER NOT NULL, t INTEGER NOT NULL, action TEXT NOT NULL,
      cible TEXT NOT NULL, rubriques TEXT NOT NULL, etab TEXT, acteur TEXT, prev TEXT NOT NULL, hash TEXT NOT NULL, sig TEXT,
      statut TEXT NOT NULL, recu INTEGER NOT NULL, PRIMARY KEY (chaine, i));""")
    cx.close()
    s = Store(db)                                              # ouvre l'ancienne base : la colonne est ajoutée
    reg = {k: v for k, v in V["registre"].items()}
    assert s.ajouter(CHAINE, V["entrees"], reg)["acceptees"] == 5
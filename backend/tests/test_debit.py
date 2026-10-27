"""Limitation du débit : un robot ne sature pas le serveur et n'essaie pas des secrets patients en masse."""
import json
import secrets
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from lafia.api import creer_app
from lafia.debit import DEFAUTS, Limiteur, groupe_de, regles_depuis_env
from lafia.registre import cle_demo, signer

V = json.loads((Path(__file__).parent / "vecteurs_journal.json").read_text(encoding="utf-8"))
PATIENT = "p-0123456789abcdef"


class Horloge:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def test_fenetre_glissante():
    h = Horloge()
    lim = Limiteur({"g": (3, 60)}, horloge=h)
    assert [lim.essayer("g", "ip1") for _ in range(3)] == [0, 0, 0]
    assert lim.essayer("g", "ip1") == 60                 # 4e dans la minute : refusé, attendre 60 s
    assert lim.essayer("g", "ip2") == 0                  # une autre adresse n'est pas touchée
    h.t += 30
    assert lim.essayer("g", "ip1") == 30                 # un refus ne compte pas ; il reste 30 s
    h.t += 30.5
    assert lim.essayer("g", "ip1") == 0                  # la fenêtre a glissé


def test_attente_ne_compte_pas_et_noter_compte():
    lim = Limiteur({"e": (2, 600)}, horloge=Horloge())
    assert lim.attente("e", "ip") == 0
    lim.noter("e", "ip"); lim.noter("e", "ip")
    assert lim.attente("e", "ip") == 600


def test_memoire_bornee():
    h = Horloge()
    lim = Limiteur({"g": (5, 10)}, horloge=h, max_cles=100)
    for i in range(100):
        lim.essayer("g", f"ip{i}")
    h.t += 11                                            # toutes les entrées sont périmées
    lim.essayer("g", "nouvelle")
    assert len(lim._evenements) == 1


def test_reglages_par_variables_d_environnement():
    assert regles_depuis_env({}) == DEFAUTS
    assert regles_depuis_env({"LAFIA_DEBIT_ECHEC_JETON": "5/300"})["echec_jeton"] == (5, 300)
    for mauvais in ["5", "5/0", "0/60", "cinq/60", "5/60/1"]:
        with pytest.raises(ValueError):
            regles_depuis_env({"LAFIA_DEBIT_INSCRIPTION": mauvais})


def test_groupes():
    assert groupe_de("POST", "/api/patients") == "inscription"
    assert groupe_de("GET", "/api/journal/patients/p-01") == "lecture"
    assert groupe_de("POST", "/api/journal/chaines/c-01/entrees") == "envoi"
    assert groupe_de("GET", "/api/registre") == "defaut"
    assert groupe_de("GET", "/") is None


def fabriquer(tmp_path, regles=None, limiteur="defaut"):
    reg = tmp_path / "registre_signe.json"
    reg.write_text(json.dumps(signer(V["registre"], 1, cle_demo())), encoding="utf-8")
    pub = tmp_path / "autorite.pub.json"
    pub.write_text(json.dumps({"pub": cle_demo().verify_key.encode().hex()}), encoding="utf-8")
    lim = Limiteur({**DEFAUTS, **(regles or {})}) if limiteur == "defaut" else limiteur
    return TestClient(creer_app(db=str(tmp_path / "t.db"), registre=str(reg), autorite=str(pub), limiteur=lim))


def test_429_avec_delai_a_attendre(tmp_path):
    c = fabriquer(tmp_path, {"inscription": (2, 3600)})
    for _ in range(2):
        assert c.post("/api/patients", json={"id": "p-" + secrets.token_hex(8), "jeton": secrets.token_urlsafe(32)}).status_code == 201
    r = c.post("/api/patients", json={"id": "p-" + secrets.token_hex(8), "jeton": secrets.token_urlsafe(32)})
    assert r.status_code == 429
    assert r.json()["code"] == "TROP_DE_REQUETES"
    assert 3500 <= int(r.headers["Retry-After"]) <= 3600


def test_essais_de_secrets_en_masse_bloques_meme_avec_le_bon_ensuite(tmp_path):
    c = fabriquer(tmp_path, {"echec_jeton": (3, 600)})
    bon = secrets.token_urlsafe(32)
    c.post("/api/patients", json={"id": PATIENT, "jeton": bon})
    for _ in range(3):
        assert c.get(f"/api/journal/patients/{PATIENT}", headers={"Authorization": f"Bearer {secrets.token_urlsafe(32)}"}).status_code == 401
    # Seuil atteint : même le bon secret est refusé pour un temps, sinon le blocage ne servirait à rien.
    r = c.get(f"/api/journal/patients/{PATIENT}", headers={"Authorization": f"Bearer {bon}"})
    assert r.status_code == 429 and "secrets patients refusés" in r.json()["message"]


def test_un_patient_qui_lit_normalement_n_est_jamais_bloque(tmp_path):
    c = fabriquer(tmp_path, {"echec_jeton": (3, 600)})
    bon = secrets.token_urlsafe(32)
    c.post("/api/patients", json={"id": PATIENT, "jeton": bon})
    for _ in range(20):                                   # les lectures RÉUSSIES ne comptent pas comme échecs
        assert c.get(f"/api/journal/patients/{PATIENT}", headers={"Authorization": f"Bearer {bon}"}).status_code == 200


def test_desactivable_pour_le_developpement(tmp_path, monkeypatch):
    monkeypatch.setenv("LAFIA_DEBIT", "0")
    c = fabriquer(tmp_path, limiteur=None)
    for _ in range(30):
        assert c.post("/api/patients", json={"id": "p-" + secrets.token_hex(8), "jeton": secrets.token_urlsafe(32)}).status_code == 201
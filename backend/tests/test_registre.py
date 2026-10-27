"""Registre signé : seule l'autorité peut ajouter ou révoquer un badge ; le serveur ne peut pas revenir en arrière."""
import copy
import json
import os
import time

import pytest
from fastapi.testclient import TestClient
from nacl.signing import SigningKey

from lafia.api import creer_app
from lafia.registre import RegistreInvalide, cle_demo, main, ouvrir, signer

BADGES = json.loads(open(os.path.join(os.path.dirname(__file__), "vecteurs_journal.json"), encoding="utf-8").read())["registre"]
K = cle_demo()
PUB = K.verify_key.encode().hex()
MEDECIN = next(k for k, b in BADGES.items() if b["role"] == "medecin")
V = json.loads(open(os.path.join(os.path.dirname(__file__), "vecteurs_journal.json"), encoding="utf-8").read())


def test_signe_puis_ouvert():
    c = ouvrir(signer(BADGES, 1, K), PUB)
    assert c["version"] == 1 and c["badges"] == BADGES


def test_contenu_modifie_refuse():
    doc = signer(BADGES, 1, K)
    doc["contenu"] = doc["contenu"].replace('"medecin"', '"relais"', 1)
    with pytest.raises(RegistreInvalide, match="signature"):
        ouvrir(doc, PUB)


def test_autre_autorite_refusee():
    intrus = SigningKey.generate()
    with pytest.raises(RegistreInvalide, match="autre autorité"):
        ouvrir(signer(BADGES, 1, intrus), PUB)


def test_badge_mal_forme_refuse_a_la_signature():
    b = copy.deepcopy(BADGES)
    b[MEDECIN]["role"] = "chef"
    with pytest.raises(RegistreInvalide):
        signer(b, 1, K)
    b = copy.deepcopy(BADGES)
    b["0" * 16] = b.pop(MEDECIN)          # identifiant qui ne correspond pas à la clé
    with pytest.raises(RegistreInvalide):
        signer(b, 1, K)


def test_outil_revoquer(tmp_path):
    cle = tmp_path / "autorite.json"
    assert main(["cle-demo", "--sortie", str(cle)]) == 0
    src = tmp_path / "registry.json"
    src.write_text(json.dumps(BADGES), encoding="utf-8")
    sortie = tmp_path / "registre_signe.json"
    assert main(["signer", "--source", str(src), "--cle", str(cle), "--sortie", str(sortie)]) == 0
    assert main(["revoquer", MEDECIN, "--registre", str(sortie), "--cle", str(cle)]) == 0
    c = ouvrir(json.loads(sortie.read_text(encoding="utf-8")), PUB)
    assert c["version"] == 2 and c["badges"][MEDECIN]["revoked"] is True
    assert main(["verifier", "--registre", str(sortie), "--autorite", str(tmp_path / "autorite.pub.json")]) == 0


@pytest.fixture
def serveur(tmp_path):
    reg = tmp_path / "registre_signe.json"
    reg.write_text(json.dumps(signer(BADGES, 1, K)), encoding="utf-8")
    pub = tmp_path / "autorite.pub.json"
    pub.write_text(json.dumps({"pub": PUB}), encoding="utf-8")
    return TestClient(creer_app(db=str(tmp_path / "t.db"), registre=str(reg), autorite=str(pub))), reg


_decalage = [0]


def remplacer(reg, doc):
    reg.write_text(json.dumps(doc), encoding="utf-8")
    _decalage[0] += 1
    t = time.time() + _decalage[0]
    os.utime(reg, (t, t))                                   # chaque remplacement a une date distincte


def test_api_sert_le_document_signe_tel_quel(serveur):
    client, reg = serveur
    assert client.get("/api/registre").json() == json.loads(reg.read_text(encoding="utf-8"))


def test_revocation_prise_en_compte_sans_redemarrer(serveur):
    client, reg = serveur
    b = copy.deepcopy(BADGES); b[MEDECIN]["revoked"] = True
    remplacer(reg, signer(b, 2, K))
    assert client.get("/api/sante").json()["registre_version"] == 2
    assert ouvrir(client.get("/api/registre").json(), PUB)["badges"][MEDECIN]["revoked"] is True
    # Une lecture signée par le badge révoqué n'est plus « signee » mais « badge_inconnu ».
    jeton = "j" * 40
    client.post("/api/patients", json={"id": V["entrees"][0]["cible"], "jeton": jeton})
    assert client.post(f"/api/journal/chaines/c-{'a1' * 8}/entrees", json={"entrees": V["entrees"][:1]}).status_code == 200
    lu = client.get(f"/api/journal/patients/{V['entrees'][0]['cible']}", headers={"Authorization": f"Bearer {jeton}"}).json()
    assert lu["entrees"][0]["statut"] == "badge_inconnu"


def test_registre_falsifie_ou_plus_ancien_ignore(serveur):
    client, reg = serveur
    remplacer(reg, signer(BADGES, 5, K))
    assert client.get("/api/sante").json()["registre_version"] == 5
    doc = signer(BADGES, 6, K); doc["sig"] = "00" * 64
    remplacer(reg, doc)                                     # signature fausse : ignoré
    assert client.get("/api/sante").json()["registre_version"] == 5
    remplacer(reg, signer(BADGES, 3, K))                    # retour en arrière : ignoré
    assert client.get("/api/sante").json()["registre_version"] == 5

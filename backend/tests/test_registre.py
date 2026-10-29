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


# ---------- passer de la démo au pilote : vraie clé d'autorité et vrais badges ----------
import os as _os
import stat as _stat

from lafia.registre import est_demo as _est_demo, lire_cle as _lire_cle, lire_pub as _lire_pub, main as _main, ouvrir as _ouvrir


def test_cle_autorite_aleatoire_secrete_et_hors_depot(tmp_path, capsys):
    hors = tmp_path / "autorite" / "autorite.json"
    pub_b, pub_f = tmp_path / "autorite.pub.json", tmp_path / "front.json"
    assert _main(["cle-autorite", "--sortie", str(hors), "--label", "Ministère (pilote)", "--copier-pub", str(pub_b), str(pub_f)]) == 0
    assert _stat.S_IMODE(_os.stat(hors).st_mode) == 0o600                       # lisible par son seul propriétaire
    k = _lire_cle(hors)
    assert _lire_pub(pub_b) == _lire_pub(pub_f) == k.verify_key.encode().hex()
    assert not _est_demo(_lire_pub(pub_b))
    assert "seed" not in pub_b.read_text() and "seed" not in pub_f.read_text()  # le public ne contient jamais le secret
    # Jamais par-dessus une clé existante (une clé perdue ne se recrée pas) :
    assert _main(["cle-autorite", "--sortie", str(hors), "--label", "x"]) == 1
    assert "existe déjà" in capsys.readouterr().err


def test_secret_refuse_dans_un_depot_git(tmp_path, capsys):
    depot = tmp_path / "LAFIA"
    (depot / ".git").mkdir(parents=True)
    assert _main(["cle-autorite", "--sortie", str(depot / "backend" / "autorite.json"), "--label", "x"]) == 1
    assert "dépôt Git" in capsys.readouterr().err
    assert not (depot / "backend" / "autorite.json").exists()


def test_badges_puis_registre_signe_par_la_vraie_autorite(tmp_path):
    d = tmp_path / "autorite"
    assert _main(["cle-autorite", "--sortie", str(d / "autorite.json"), "--label", "Pilote", "--copier-pub", str(d / "autorite.pub.json")]) == 0
    source = d / "registry.json"
    for role, nom in [("infirmier", "Inf. Adjovi"), ("medecin", "Dr Sossou")]:
        assert _main(["badge", "--role", role, "--label", nom, "--etab", "3fa9c1", "--sortie", str(d / "badges" / f"{role}.json"), "--registre-source", str(source)]) == 0
    assert _stat.S_IMODE(_os.stat(d / "badges" / "infirmier.json").st_mode) == 0o600
    assert _main(["signer", "--source", str(source), "--cle", str(d / "autorite.json"), "--sortie", str(tmp_path / "registre_signe.json")]) == 0
    c = _ouvrir(json.loads((tmp_path / "registre_signe.json").read_text()), _lire_pub(d / "autorite.pub.json"))
    assert sorted(b["label"] for b in c["badges"].values()) == ["Dr Sossou", "Inf. Adjovi"]
    badge = json.loads((d / "badges" / "medecin.json").read_text())
    assert c["badges"][badge["kid"]]["role"] == "medecin"                        # le badge remis correspond à l'entrée signée
    with pytest.raises(Exception):                                               # la clé de démo ne peut pas l'ouvrir
        _ouvrir(json.loads((tmp_path / "registre_signe.json").read_text()), cle_demo().verify_key.encode().hex())
    assert _main(["badge", "--role", "medecin", "--label", "x", "--etab", "ZZ", "--sortie", str(d / "b.json"), "--registre-source", str(source)]) == 1


def test_verifier_signale_l_autorite_de_demo(tmp_path, capsys):
    reg = tmp_path / "r.json"; pub = tmp_path / "p.json"
    reg.write_text(json.dumps(signer(V["registre"], 1, cle_demo())))
    pub.write_text(json.dumps({"pub": cle_demo().verify_key.encode().hex()}))
    assert _main(["verifier", "--registre", str(reg), "--autorite", str(pub)]) == 0
    assert "DÉMONSTRATION" in capsys.readouterr().out
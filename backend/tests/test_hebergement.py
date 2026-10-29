"""Hébergement sans disque (Vercel + Turso) : base distante, appels depuis le site (CORS), adresse du client."""
import json
import socket
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from faux_turso import FauxTurso
from lafia.api import creer_app
from lafia.base import ConnexionTurso
from lafia.debit import Limiteur
from lafia.registre import cle_demo, signer
from lafia.store import Store

V = json.loads((Path(__file__).parent / "vecteurs_journal.json").read_text(encoding="utf-8"))
CHAINE = "c-" + "b2" * 8
SITE = "https://lafia-1nkp.vercel.app"


@pytest.fixture
def fichiers(tmp_path):
    reg = tmp_path / "registre_signe.json"
    reg.write_text(json.dumps(signer(V["registre"], 1, cle_demo())), encoding="utf-8")
    pub = tmp_path / "autorite.pub.json"
    pub.write_text(json.dumps({"pub": cle_demo().verify_key.encode().hex()}), encoding="utf-8")
    return str(reg), str(pub)


@pytest.fixture
def turso(tmp_path):
    f = FauxTurso(str(tmp_path / "turso.db"))
    yield f
    f.arreter()


def test_adresse_libsql_convertie_en_https():
    assert ConnexionTurso("libsql://lafia-moi.turso.io", "j").url == "https://lafia-moi.turso.io"
    assert ConnexionTurso("https://lafia-moi.turso.io/", "j").url == "https://lafia-moi.turso.io"


def test_envoi_d_entrees_en_peu_d_allers_retours(turso):
    store = Store(turso.url, jeton=turso.jeton)
    avant = turso.requetes_http
    r = store.ajouter(CHAINE, V["entrees"], V["registre"])
    assert r["acceptees"] == 5
    # BEGIN, dernier rang, insertions groupées, COMMIT, fermeture : pas un aller-retour par entrée.
    assert turso.requetes_http - avant <= 5
    # Renvoi identique : reconnu, sans écriture.
    assert store.ajouter(CHAINE, V["entrees"], V["registre"])["deja_recues"] == 5


def test_transaction_annulee_si_une_entree_est_refusee(turso):
    store = Store(turso.url, jeton=turso.jeton)
    abimees = [dict(e) for e in V["entrees"]]
    abimees[3]["hash"] = "0" * 64                          # la 4e entrée casse la chaîne
    with pytest.raises(Exception):
        store.ajouter(CHAINE, abimees, V["registre"])
    cx = store._cx()
    try:
        assert cx.executer("SELECT COUNT(*) AS n FROM entrees")[0]["n"] == 0   # tout ou rien : rien d'écrit
    finally:
        cx.fermer()


def test_base_injoignable_donne_503(fichiers, turso, monkeypatch):
    reg, pub = fichiers
    monkeypatch.setenv("LAFIA_DB_JETON", turso.jeton)
    client = TestClient(creer_app(db=turso.url, registre=reg, autorite=pub, limiteur=None))
    turso.arreter()                                        # panne de l'hébergeur de la base
    r = client.get("/api/journal/patients/p-0123456789abcdef", headers={"Authorization": "Bearer " + "x" * 43})
    assert r.status_code == 503 and r.json()["code"] == "BASE_INDISPONIBLE"
    assert client.get("/api/sante").status_code == 200    # la santé ne dépend que du registre


def test_jeton_turso_faux_au_demarrage_est_une_erreur_claire(fichiers, turso):
    reg, pub = fichiers
    with pytest.raises(Exception):
        creer_app(db=turso.url + "", registre=reg, autorite=pub)   # aucun jeton fourni
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    with pytest.raises(Exception, match="injoignable|répondu"):
        Store(f"http://127.0.0.1:{port}", jeton="j")


def test_sur_vercel_sans_base_distante_le_demarrage_refuse(fichiers, monkeypatch):
    reg, pub = fichiers
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("LAFIA_DB", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="Turso"):
        creer_app(registre=reg, autorite=pub)


def test_cors_seulement_pour_le_site_autorise(fichiers, tmp_path, monkeypatch):
    reg, pub = fichiers
    monkeypatch.setenv("LAFIA_ORIGINES", SITE + "/")
    client = TestClient(creer_app(db=str(tmp_path / "t.db"), registre=reg, autorite=pub))
    pre = {"Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"}
    ok = client.options("/api/journal/patients/p-0123456789abcdef", headers={"Origin": SITE, **pre})
    assert ok.status_code == 200 and ok.headers["access-control-allow-origin"] == SITE
    autre = client.options("/api/sante", headers={"Origin": "https://pirate.example", **pre})
    assert "access-control-allow-origin" not in autre.headers
    assert client.get("/api/sante", headers={"Origin": SITE}).headers["access-control-allow-origin"] == SITE


def test_sans_origines_configurees_pas_de_cors(fichiers, tmp_path, monkeypatch):
    reg, pub = fichiers
    monkeypatch.delenv("LAFIA_ORIGINES", raising=False)
    client = TestClient(creer_app(db=str(tmp_path / "t.db"), registre=reg, autorite=pub))
    assert "access-control-allow-origin" not in client.get("/api/sante", headers={"Origin": SITE}).headers


def test_adresse_client_lue_dans_l_entete_de_la_plateforme(fichiers, tmp_path, monkeypatch):
    reg, pub = fichiers
    monkeypatch.setenv("VERCEL", "1")                      # x-forwarded-for choisi automatiquement
    monkeypatch.setenv("LAFIA_ORIGINES", SITE)
    lim = Limiteur({"defaut": (2, 60), "inscription": (100, 60), "lecture": (100, 60), "echec_jeton": (100, 60), "envoi": (100, 60)})
    client = TestClient(creer_app(db=str(tmp_path / "t.db"), registre=reg, autorite=pub, limiteur=lim))
    a = {"x-forwarded-for": "41.85.1.1, 76.76.21.21", "Origin": SITE}
    b = {"x-forwarded-for": "41.85.2.2", "Origin": SITE}
    assert [client.get("/api/sante", headers=a).status_code for _ in range(3)] == [200, 200, 429]
    r = client.get("/api/sante", headers=a)
    assert r.headers["access-control-allow-origin"] == SITE   # le site peut lire le 429 (sinon : « injoignable »)
    assert client.get("/api/sante", headers=b).status_code == 200   # un autre client n'est pas bloqué
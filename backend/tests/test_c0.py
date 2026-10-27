"""Carte C0 : le Python reproduit le navigateur au caractère près, dans les deux sens (vecteurs croisés)."""
import copy
import hashlib
import json
import os
from pathlib import Path

import pytest
from nacl.signing import SigningKey

from lafia import cbor
from lafia.c0 import (
    VERSION, Badge, NotReviewedError, SchemaError, b45decode, b45encode, nouveau_brouillon, pack, relire,
    signer, to_link, unpack, verify,
)

ICI = Path(__file__).parent
V = json.loads((ICI / "vecteurs_carte.json").read_text(encoding="utf-8"))
REG = V["registre"]
NOW = 1_790_000_000
MEDECIN = Badge.depuis_graine(hashlib.sha256(b"lafia-demo:medecin").hexdigest())
INFIRMIER = Badge.depuis_graine(hashlib.sha256(b"lafia-demo:infirmier").hexdigest())
INTRUS = Badge.depuis_graine("11" * 32)
ETAB = next(iter(REG.values()))["etab"]


def signe(p, badge=MEDECIN, base=None):
    return signer(relire(nouveau_brouillon(p), badge.kid), badge, base)[0]


# ---------- navigateur → Python ----------
@pytest.mark.parametrize("cas", V["cas"], ids=[c["nom"] for c in V["cas"]])
def test_cartes_du_navigateur_meme_verdict(cas):
    """Même résultat, champ par champ (code d'erreur, message, contenu, avertissements), que le navigateur."""
    assert verify(cas["texte"], REG, cas["maintenant"]) == cas["attendu"]


def test_badges_de_demo_identiques_au_navigateur():
    assert MEDECIN.kid in REG and INFIRMIER.kid in REG and INTRUS.kid not in REG


# ---------- primitives ----------
def test_base45_rfc9285():
    assert b45encode(b"AB") == "BB8" and b45encode(b"Hello!!") == "%69 VD92EX0" and b45decode("QED8WEX0") == b"ietf!"
    for bad in ("A", "GGW", "a"):
        with pytest.raises(ValueError):
            b45decode(bad)


def test_cbor_aller_retour_et_refus():
    v = {"a": [1, -2, 3_000_000_000, b"\x00\xff", "é", True, None], "b": {}}
    assert cbor.decode(cbor.encode(v)) == v
    with pytest.raises(cbor.CborError):
        cbor.decode(cbor.encode(1) + b"\x00")          # octets en trop
    with pytest.raises(cbor.CborError):
        cbor.decode(b"\x9f\x01\xff")                  # longueur indéfinie


def test_bombe_zlib_refusee():
    import zlib
    texte = "L2:" + b45encode(zlib.compress(b"\x00" * 10_000_000, 9))
    assert verify(texte, REG, NOW)["code"] == "UNREADABLE"


# ---------- cycle et règles ----------
def payload(**patch):
    p = {"v": 2, "id": "p-0123456789abcdef", "iat": NOW, "pr": {"al": ["PEN"], "gs": "O+"},
         "co": [{"t": NOW - 60, "f": ETAB, "a": MEDECIN.kid, "m": "FIEV", "c": {"temp": 390}}]}
    p.update(patch)
    return p


def test_brouillon_non_relu_ou_autre_signataire_refuse():
    with pytest.raises(NotReviewedError):
        signer(nouveau_brouillon(payload()), MEDECIN)
    with pytest.raises(NotReviewedError):
        signer(relire(nouveau_brouillon(payload()), INFIRMIER.kid), MEDECIN)


@pytest.mark.parametrize("patch", [
    {"pr": {"ah": ["DREPANO"]}}, {"pr": {"tx": [{"c": "PARA", "d": "500mg"}]}}, {"id": "p-0123456789abcdef\n"},
    {"pr": {"gs": "Z+"}}, {"co": [{"t": NOW, "f": "etab-1", "a": MEDECIN.kid, "m": "FIEV"}]}, {"iat": True},
])
def test_schema_refuse(patch):
    with pytest.raises(SchemaError):
        nouveau_brouillon(payload(**patch))


def test_revoque_refuse():
    reg = copy.deepcopy(REG)
    reg[MEDECIN.kid]["revoked"] = True
    assert verify(signe(payload()), reg, NOW)["code"] == "UNKNOWN_SIGNER"


def test_lien_refuse_localhost():
    for base in ("http://localhost:5173/", "http://127.0.0.1/", "ftp://lafia.example/"):
        with pytest.raises(ValueError):
            to_link(signe(payload()), base)


# ---------- Python → navigateur ----------
def cartes_python():
    complet = payload(pr={"al": ["PEN", "QUIN"], "tx": [{"c": "AVK", "d": "T2:L10"}], "ah": ["GROSSESSE"], "vs": ["GROSSESSE"],
                          "ec": {"n": "Awa Hounsou ï", "tel": "+229 01 23 45 67"}, "gs": "AB-", "yb": 1990, "sx": "F"})
    carte = signe(complet)
    corps = cbor.encode(payload(pr={"sx": "X"}))
    hors_schema = pack(cbor.encode([VERSION, bytes.fromhex(MEDECIN.kid), corps, MEDECIN.cle.sign(corps).signature]))
    cas = [
        ("complète, signée par le Python", carte, NOW + 60),
        ("minimale", signe({"v": 2, "id": "p-00000000", "iat": NOW}, INFIRMIER), NOW),
        ("lien #L2B", to_link(carte, "https://lafia.example/"), NOW),
        ("signataire hors registre", signe(payload(co=[]), INTRUS), NOW),
        ("hors schéma", hors_schema, NOW),
        ("datée dans le futur", signe(payload(iat=NOW + 5 * 86400)), NOW),
    ]
    return [{"nom": n, "texte": t, "maintenant": m, "attendu": verify(t, REG, m)} for n, t, m in cas]


def test_cartes_python_et_fichier_pour_le_navigateur():
    cas = cartes_python()
    assert [c["attendu"]["ok"] for c in cas] == [True, True, True, False, False, False]
    assert [c["attendu"].get("code") for c in cas[3:]] == ["UNKNOWN_SIGNER", "BAD_SCHEMA", "FUTURE_DATE"]
    fichier = ICI / "vecteurs_carte_python.json"
    if os.environ.get("LAFIA_ECRIRE_VECTEURS") == "1":
        fichier.write_text(json.dumps({"cas": cas}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    enregistres = json.loads(fichier.read_text(encoding="utf-8"))["cas"]
    assert [c["texte"] for c in cas] == [c["texte"] for c in enregistres]   # déterministe : mêmes entrées, mêmes cartes
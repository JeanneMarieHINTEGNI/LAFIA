"""Le Python vérifie, octet pour octet, les entrées produites par le journal du navigateur (vecteurs partagés)."""
import copy
import json
from pathlib import Path

import pytest

from lafia.journal import ZERO, Entree, EntreeInvalide, calculer_hash, verifier_entree

V = json.loads((Path(__file__).parent / "vecteurs_journal.json").read_text(encoding="utf-8"))
REG, BRUTES = V["registre"], V["entrees"]
MAINTENANT = 1_790_001_000


def verifier_tout(brutes, registre=REG):
    prev, statuts = ZERO, []
    for k, b in enumerate(brutes):
        e = Entree.depuis_dict(b)
        statuts.append(verifier_entree(e, k, prev, registre, MAINTENANT))
        prev = e.hash
    return statuts


def test_vecteurs_du_navigateur_acceptes_avec_le_bon_statut():
    assert verifier_tout(BRUTES) == ["signee", "sans_badge", "signee", "signee", "sans_badge"]


def test_motif_compte_dans_l_empreinte_et_reste_retrocompatible():
    assert BRUTES[4]["motif"] == "INCONSCIENT"
    assert all("motif" not in b for b in BRUTES[:4])          # anciennes entrées : format inchangé
    b = copy.deepcopy(BRUTES)
    b[4]["motif"] = "VITAL"                                     # changer le motif casse l'empreinte
    with pytest.raises(EntreeInvalide) as e:
        verifier_tout(b)
    assert e.value.code == "HASH"


def test_motif_hors_catalogue_refuse():
    with pytest.raises(EntreeInvalide) as e:
        Entree.depuis_dict({**BRUTES[4], "motif": "CURIOSITE"})
    assert e.value.code == "FORME"


def test_hash_python_identique_au_hash_typescript():
    for b in BRUTES:
        assert calculer_hash(Entree.depuis_dict(b)) == b["hash"]


def test_aller_retour_dict_sans_perte():
    for b in BRUTES:
        assert Entree.depuis_dict(b).vers_dict() == b


@pytest.mark.parametrize("champ,valeur,code", [
    ("cible", "p-ffffffffffffffff", "HASH"),     # contenu modifié
    ("prev", "1" * 64, "CHAINE"),                # maillon déplacé
    ("i", 7, "RANG"),                            # rang falsifié
])
def test_modification_detectee(champ, valeur, code):
    b = copy.deepcopy(BRUTES)
    b[0][champ] = valeur
    with pytest.raises(EntreeInvalide) as e:
        verifier_tout(b)
    assert e.value.code == code


def test_signature_d_un_autre_badge_refusee():
    b = copy.deepcopy(BRUTES)
    b[0]["sig"] = b[2]["sig"]                    # signature de l'infirmier sur une entrée attribuée au médecin
    with pytest.raises(EntreeInvalide) as e:
        verifier_tout(b)
    assert e.value.code == "SIGNATURE"


def test_entree_attribuee_mais_non_signee_refusee():
    b = copy.deepcopy(BRUTES)
    del b[0]["sig"]
    with pytest.raises(EntreeInvalide) as e:
        verifier_tout(b)
    assert e.value.code == "SIGNATURE"


def test_badge_revoque_accepte_mais_jamais_presente_comme_verifie():
    reg = copy.deepcopy(REG)
    kid = BRUTES[0]["acteur"]
    reg[kid]["revoked"] = True
    assert verifier_tout(BRUTES, reg)[0] == "badge_inconnu"


def test_date_dans_le_futur_refusee():
    e = Entree.depuis_dict(BRUTES[1])
    with pytest.raises(EntreeInvalide) as err:
        verifier_entree(e, 1, BRUTES[0]["hash"], REG, maintenant=e.t - 2 * 24 * 3600)
    assert err.value.code == "DATE"


@pytest.mark.parametrize("patch", [
    {"cible": "Robert"}, {"action": "SUPPRESSION"}, {"rubriques": []}, {"etab": "etab-1"}, {"secret": "x"}, {"t": "hier"},
])
def test_forme_refusee(patch):
    with pytest.raises(EntreeInvalide) as e:
        Entree.depuis_dict({**BRUTES[0], **patch})
    assert e.value.code == "FORME"


@pytest.mark.parametrize("champ", ["cible", "prev", "hash", "acteur"])
def test_saut_de_ligne_final_refuse(champ):
    """« $ » de Python accepte un saut de ligne final : les formats sont vérifiés en entier (fullmatch)."""
    with pytest.raises(EntreeInvalide):
        Entree.depuis_dict({**BRUTES[0], champ: BRUTES[0][champ] + "\n"})
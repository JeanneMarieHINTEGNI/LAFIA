"""Registre de confiance SIGNÉ : la liste des badges soignants autorisés (et révoqués), signée par une autorité.

Format du document (identique côté navigateur, `frontend/src/ui/trust.ts`) :

    {"v": 1, "autorite": "<kid 16 hex>", "contenu": "<JSON en texte>", "sig": "<Ed25519 128 hex>"}
    contenu = {"version": N, "emis": <epoch s>, "badges": {kid: {pub, role, label?, etab?, revoked?}}}

La signature porte sur les OCTETS UTF-8 de `contenu`, tels quels : aucune remise en forme à la vérification.
Le serveur ne détient PAS la clé d'autorité : il distribue un document déjà signé (outil ci-dessous, à lancer
sur le poste de l'autorité). Un serveur compromis ne peut donc ni ajouter un badge, ni annuler une révocation.

Ligne de commande (depuis le dossier backend) :
    python -m lafia.registre signer   --source registry.json --cle secrets_demo/autorite.json --sortie registre_signe.json
    python -m lafia.registre revoquer <kid> --registre registre_signe.json --cle secrets_demo/autorite.json
    python -m lafia.registre verifier --registre registre_signe.json --autorite autorite.pub.json
    python -m lafia.registre cle-demo --sortie secrets_demo/autorite.json      (clé de DÉMO, interdite en production)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from typing import Mapping

from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey

RX_KID = re.compile(r"^[0-9a-f]{16}$")
RX_PUB = re.compile(r"^[0-9a-f]{64}$")
ROLES = ("infirmier", "medecin", "relais")


class RegistreInvalide(ValueError):
    pass


def kid_de(pub_hex: str) -> str:
    return pub_hex[:16]


def valider_badges(badges: Mapping) -> dict:
    if not isinstance(badges, dict) or not badges:
        raise RegistreInvalide("badges : objet non vide attendu")
    for kid, b in badges.items():
        if not RX_KID.match(kid) or not isinstance(b, dict) or not RX_PUB.match(str(b.get("pub", ""))):
            raise RegistreInvalide(f"badge {kid!r} : identifiant ou clé publique invalide")
        if kid_de(b["pub"]) != kid:
            raise RegistreInvalide(f"badge {kid} : l'identifiant doit être le début de la clé publique")
        if b.get("role") not in ROLES:
            raise RegistreInvalide(f"badge {kid} : rôle inconnu")
        inconnus = set(b) - {"pub", "role", "label", "etab", "revoked"}
        if inconnus:
            raise RegistreInvalide(f"badge {kid} : champs inconnus {sorted(inconnus)}")
    return dict(badges)


def signer(badges: Mapping, version: int, cle: SigningKey, emis: int | None = None) -> dict:
    contenu = json.dumps({"version": version, "emis": emis or int(time.time()), "badges": valider_badges(badges)},
                         ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    sig = cle.sign(contenu.encode("utf-8")).signature.hex()
    return {"v": 1, "autorite": kid_de(cle.verify_key.encode().hex()), "contenu": contenu, "sig": sig}


def ouvrir(doc: Mapping, pub_autorite_hex: str) -> dict:
    """Vérifie la signature de l'autorité et renvoie {version, emis, badges}. Lève RegistreInvalide."""
    if not isinstance(doc, dict) or doc.get("v") != 1 or not isinstance(doc.get("contenu"), str) or not isinstance(doc.get("sig"), str):
        raise RegistreInvalide("document de registre mal formé")
    if doc.get("autorite") != kid_de(pub_autorite_hex):
        raise RegistreInvalide("registre signé par une autre autorité")
    try:
        VerifyKey(bytes.fromhex(pub_autorite_hex)).verify(doc["contenu"].encode("utf-8"), bytes.fromhex(doc["sig"]))
    except (BadSignatureError, ValueError):
        raise RegistreInvalide("signature de l'autorité invalide : registre modifié") from None
    c = json.loads(doc["contenu"])
    if not isinstance(c.get("version"), int) or c["version"] < 1 or not isinstance(c.get("emis"), int):
        raise RegistreInvalide("version ou date d'émission invalide")
    c["badges"] = valider_badges(c.get("badges"))
    return c


# ---------- fichiers de clés ----------
def cle_demo() -> SigningKey:
    """Clé d'autorité de DÉMONSTRATION, dérivée d'un nom (comme les badges de démo). INTERDITE en production."""
    return SigningKey(hashlib.sha256(b"lafia-demo:autorite").digest())


def lire_cle(chemin: str | Path) -> SigningKey:
    d = json.loads(Path(chemin).read_text(encoding="utf-8"))
    return SigningKey(bytes.fromhex(d["seed"]))


def lire_pub(chemin: str | Path) -> str:
    pub = json.loads(Path(chemin).read_text(encoding="utf-8"))["pub"]
    if not RX_PUB.match(pub):
        raise RegistreInvalide("clé publique d'autorité invalide")
    return pub


def _ecrire(chemin: str | Path, obj: dict):
    Path(chemin).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m lafia.registre", description="Outil de l'autorité : signer et révoquer le registre des badges.")
    sp = p.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("signer", help="signe un registry.json (non signé) en registre_signe.json")
    s.add_argument("--source", required=True); s.add_argument("--cle", required=True); s.add_argument("--sortie", required=True)
    s.add_argument("--version", type=int, default=1)
    r = sp.add_parser("revoquer", help="révoque un badge et re-signe (version + 1)")
    r.add_argument("kid"); r.add_argument("--registre", required=True); r.add_argument("--cle", required=True)
    v = sp.add_parser("verifier", help="vérifie un registre signé et l'affiche")
    v.add_argument("--registre", required=True); v.add_argument("--autorite", required=True)
    c = sp.add_parser("cle-demo", help="écrit la clé d'autorité de DÉMO et sa clé publique")
    c.add_argument("--sortie", required=True)
    a = p.parse_args(argv)

    try:
        if a.cmd == "cle-demo":
            k = cle_demo()
            Path(a.sortie).parent.mkdir(parents=True, exist_ok=True)
            _ecrire(a.sortie, {"_avertissement": "CLÉ D'AUTORITÉ DE DÉMONSTRATION — INTERDITE EN PRODUCTION", "seed": bytes(k).hex()})
            pub = {"pub": k.verify_key.encode().hex(), "label": "Autorité de démonstration (Ministère, démo)"}
            _ecrire(Path(a.sortie).with_name("autorite.pub.json"), pub)
            print(f"Clé écrite dans {a.sortie} ; clé publique : {pub['pub']}")
        elif a.cmd == "signer":
            doc = signer(json.loads(Path(a.source).read_text(encoding="utf-8")), a.version, lire_cle(a.cle))
            _ecrire(a.sortie, doc)
            print(f"Registre version {a.version} signé → {a.sortie}")
        elif a.cmd == "revoquer":
            k = lire_cle(a.cle)
            c = ouvrir(json.loads(Path(a.registre).read_text(encoding="utf-8")), k.verify_key.encode().hex())
            if a.kid not in c["badges"]:
                print(f"Badge {a.kid} absent du registre.", file=sys.stderr); return 1
            c["badges"][a.kid]["revoked"] = True
            _ecrire(a.registre, signer(c["badges"], c["version"] + 1, k))
            print(f"Badge {a.kid} révoqué → registre version {c['version'] + 1}. Le serveur le distribue dès maintenant.")
        elif a.cmd == "verifier":
            c = ouvrir(json.loads(Path(a.registre).read_text(encoding="utf-8")), lire_pub(a.autorite))
            print(f"Registre valide, version {c['version']}, émis le {time.strftime('%d/%m/%Y %H:%M', time.localtime(c['emis']))}")
            for kid, b in sorted(c["badges"].items()):
                print(f"  {kid}  {b['role']:<10} {b.get('label', ''):<24} {'RÉVOQUÉ' if b.get('revoked') else 'actif'}")
    except (RegistreInvalide, OSError, KeyError, json.JSONDecodeError) as e:
        print(f"Erreur : {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

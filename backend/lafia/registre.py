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

Pilote réel (voir README, « Passer de la démo au pilote ») :
      python -m lafia.registre cle-autorite --sortie ~/lafia-autorite/autorite.json --label "…" \
        --copier-pub autorite.pub.json ../frontend/src/data/autorite.json
    python -m lafia.registre badge --role infirmier --label "…" --etab 3fa9c1 \
        --sortie ~/lafia-autorite/badges/infirmier-x.json --registre-source ~/lafia-autorite/registry.json
Les fichiers SECRETS (clé d'autorité, badges) sont écrits hors de tout dépôt Git, lisibles par leur seul propriétaire.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Mapping

from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey

RX_KID = re.compile(r"^[0-9a-f]{16}$")
RX_PUB = re.compile(r"^[0-9a-f]{64}$")
RX_ETAB = re.compile(r"^[0-9a-f]{4,8}$")
ROLES = ("infirmier", "medecin", "relais")


class RegistreInvalide(ValueError):
    pass


def kid_de(pub_hex: str) -> str:
    return pub_hex[:16]


def valider_badges(badges: Mapping) -> dict:
    if not isinstance(badges, dict) or not badges:
        raise RegistreInvalide("badges : objet non vide attendu")
    for kid, b in badges.items():
        if not RX_KID.fullmatch(kid) or not isinstance(b, dict) or not RX_PUB.fullmatch(str(b.get("pub", ""))):
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


def est_demo(pub_hex: str) -> bool:
    """La clé publique est-elle celle de l'autorité de DÉMONSTRATION (connue de tous) ?"""
    return pub_hex == cle_demo().verify_key.encode().hex()


def dans_un_depot(chemin: str | Path) -> Path | None:
    """Renvoie le dossier du dépôt Git qui contiendrait ce fichier (un secret n'a rien à y faire), sinon None."""
    p = Path(chemin).expanduser().resolve()
    for d in [p.parent, *p.parent.parents]:
        if (d / ".git").exists():
            return d
    return None


def ecrire_secret(chemin: str | Path, obj: dict, forcer: bool = False) -> Path:
    """Écrit un fichier secret : jamais dans un dépôt Git, jamais par-dessus un fichier existant, lisible par son seul propriétaire."""
    p = Path(chemin).expanduser()
    depot = dans_un_depot(p)
    if depot and not forcer:
        raise RegistreInvalide(f"{p} est dans le dépôt Git {depot} : un secret ne doit jamais y être. Choisissez un dossier hors du projet.")
    if p.exists():
        raise RegistreInvalide(f"{p} existe déjà : je ne l'écrase pas (une clé perdue ne se recrée pas).")
    p.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")
    return p


def lire_cle(chemin: str | Path) -> SigningKey:
    d = json.loads(Path(chemin).read_text(encoding="utf-8"))
    return SigningKey(bytes.fromhex(d["seed"]))


def lire_pub(chemin: str | Path) -> str:
    pub = json.loads(Path(chemin).read_text(encoding="utf-8"))["pub"]
    if not RX_PUB.fullmatch(pub):
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
    ca = sp.add_parser("cle-autorite", help="crée une VRAIE clé d'autorité (aléatoire), hors du dépôt")
    ca.add_argument("--sortie", required=True, help="fichier secret, hors de tout dépôt Git")
    ca.add_argument("--label", required=True, help="nom affiché de l'autorité, ex. « Ministère de la Santé (pilote Bassila) »")
    ca.add_argument("--copier-pub", nargs="*", default=[], help="fichiers où écrire la clé PUBLIQUE (backend/autorite.pub.json, frontend/src/data/autorite.json)")
    ca.add_argument("--forcer", action="store_true", help=argparse.SUPPRESS)
    bg = sp.add_parser("badge", help="crée un VRAI badge soignant (aléatoire) et l'ajoute à la source du registre")
    bg.add_argument("--role", required=True, choices=ROLES); bg.add_argument("--label", required=True)
    bg.add_argument("--etab", required=True, help="code de l'établissement (4 à 8 caractères 0-9 a-f)")
    bg.add_argument("--sortie", required=True, help="fichier secret du badge, à remettre au seul soignant")
    bg.add_argument("--registre-source", required=True, help="registry.json (non signé) à compléter")
    bg.add_argument("--forcer", action="store_true", help=argparse.SUPPRESS)
    a = p.parse_args(argv)

    try:
        if a.cmd == "cle-demo":
            k = cle_demo()
            Path(a.sortie).parent.mkdir(parents=True, exist_ok=True)
            _ecrire(a.sortie, {"_avertissement": "CLÉ D'AUTORITÉ DE DÉMONSTRATION — INTERDITE EN PRODUCTION", "seed": bytes(k).hex()})
            pub = {"pub": k.verify_key.encode().hex(), "label": "Autorité de démonstration (Ministère, démo)"}
            _ecrire(Path(a.sortie).with_name("autorite.pub.json"), pub)
            print(f"Clé écrite dans {a.sortie} ; clé publique : {pub['pub']}")
        elif a.cmd == "cle-autorite":
            k = SigningKey.generate()
            pub = k.verify_key.encode().hex()
            secret = ecrire_secret(a.sortie, {"_avertissement": "CLÉ D'AUTORITÉ LAFIA — SECRÈTE. Ne jamais la copier dans un dépôt, un e-mail ou une messagerie.",
                                              "label": a.label, "pub": pub, "seed": bytes(k).hex()}, a.forcer)
            for cible in a.copier_pub:
                _ecrire(cible, {"pub": pub, "label": a.label})
            print(f"Clé d'autorité créée : {secret} (lisible par vous seul). Sauvegardez-la sur une clé USB rangée à part.")
            print(f"Clé publique : {pub}" + (f" → écrite dans {', '.join(a.copier_pub)}" if a.copier_pub else ""))
        elif a.cmd == "badge":
            if not RX_ETAB.fullmatch(a.etab):
                raise RegistreInvalide("code d'établissement : 4 à 8 caractères parmi 0-9 et a-f")
            k = SigningKey.generate()
            pub = k.verify_key.encode().hex()
            kid = kid_de(pub)
            source = Path(a.registre_source).expanduser()
            badges = json.loads(source.read_text(encoding="utf-8")) if source.exists() else {}
            badges = {kid_: b for kid_, b in badges.items() if not kid_.startswith("_")}
            badges[kid] = {"pub": pub, "role": a.role, "label": a.label, "etab": a.etab}
            valider_badges(badges)
            ecrire_secret(a.sortie, {"_avertissement": "BADGE SOIGNANT LAFIA — SECRET, à remettre à son seul titulaire.", "kid": kid, "role": a.role, "label": a.label, "seed": bytes(k).hex()}, a.forcer)
            source.parent.mkdir(parents=True, exist_ok=True)
            _ecrire(source, badges)
            print(f"Badge {kid} ({a.role}, {a.label}) créé → {a.sortie}. Ajouté à {source} : re-signez le registre pour qu'il soit accepté.")
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
            if est_demo(lire_pub(a.autorite)):
                print("  ATTENTION : autorité de DÉMONSTRATION (clé connue de tous) : ne pas utiliser pour de vrais patients.")
            for kid, b in sorted(c["badges"].items()):
                print(f"  {kid}  {b['role']:<10} {b.get('label', ''):<24} {'RÉVOQUÉ' if b.get('revoked') else 'actif'}")
    except (RegistreInvalide, OSError, KeyError, json.JSONDecodeError) as e:
        print(f"Erreur : {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
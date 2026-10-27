"""Carte d'urgence C0 — miroir Python EXACT de `frontend/src/core/` (schema.ts + signing.ts + base45.ts).

Toute modification du format se fait dans les DEUX langages ; les vecteurs croisés le vérifient dans les deux sens :
  - tests/vecteurs_carte.json         cartes produites par le navigateur, vérifiées ici ;
  - tests/vecteurs_carte_python.json  cartes produites ici, vérifiées par le navigateur (frontend/test/vecteurs-carte.test.ts).

Format (docs/CONTRAT.md) :
  payload CBOR {v:2, id, iat, pr?, co?} ; enveloppe CBOR [2, kid (8 octets), corps (octets signés), signature Ed25519 (64)]
  texte « L2: » + Base45(zlib(enveloppe))   ou lien « <base>#L2B: » + base64url(zlib(enveloppe))
La signature porte sur les octets du corps reçus, tels quels.

Confidentialité : ce module sert aux outils (tests, autorité, contrôle qualité). Le serveur Lafia n'expose AUCUNE
route qui recevrait une carte : la carte contient des données médicales en clair et n'a rien à faire sur le serveur.
"""
from __future__ import annotations

import base64
import re
import time
import zlib
from dataclasses import dataclass, field
from typing import Any, Literal, Mapping
from urllib.parse import unquote, urlsplit, urlunsplit

from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey

from . import cbor

# ---------- constantes du contrat (identiques à schema.ts) ----------
VERSION = 2
MAX_QR_CHARS = 1400
MAX_CONSULTATIONS = 3
FUTURE_SKEW_S = 24 * 3600
STALE_DAYS = 30

CATALOG = {
    "motifs": ["AUTR", "CONS", "CTRL", "EVAC", "FIEV", "PREN", "TRAU", "VACC"],
    "orientations": ["DOM", "EVAC", "SUIV"],
    "tests": {"TDR": ["NEG", "POS"]},
    "groupes": ["A+", "A-", "AB+", "AB-", "B+", "B-", "O+", "O-"],
    "roles": ["infirmier", "medecin", "relais"],
    "sensibles": ["ADDICT", "ARV", "DREPANO", "GROSSESSE", "IVG", "PSY", "VIH"],
}

# fullmatch partout : « $ » seul accepterait un saut de ligne final.
CODE = re.compile(r"[A-Z0-9_]{2,12}")
FACILITY = re.compile(r"[0-9a-f]{4,8}")
KID = re.compile(r"[0-9a-f]{16}")
PID = re.compile(r"p-[0-9a-f]{8,16}")
DOSE = re.compile(r"T\d{1,2}:L\d{1,2}")
TEL = re.compile(r"\+?[0-9 ]{6,18}")
CONTROLE = re.compile(r"[\x00-\x1f]")
EPOCH_MIN, EPOCH_MAX = 1_600_000_000, 4_000_000_000
MAX_ENVELOPPE = 64 * 1024   # garde-fou contre une « bombe » zlib (une vraie carte fait < 2 Ko)


class SchemaError(ValueError):
    pass


class NotReviewedError(ValueError):
    pass


# ---------- Base45 (RFC 9285), identique à base45.ts ----------
ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"
_IDX = {c: i for i, c in enumerate(ALPHABET)}


def b45encode(data: bytes) -> str:
    out = []
    for i in range(0, len(data) - 1, 2):
        n = data[i] * 256 + data[i + 1]
        c, n = n % 45, n // 45
        d, e = n % 45, n // 45
        out.append(ALPHABET[c] + ALPHABET[d] + ALPHABET[e])
    if len(data) % 2:
        v = data[-1]
        out.append(ALPHABET[v % 45] + ALPHABET[v // 45])
    return "".join(out)


def b45decode(s: str) -> bytes:
    try:
        vals = [_IDX[ch] for ch in s]
    except KeyError:
        raise ValueError("base45 invalide") from None
    if len(vals) % 3 == 1:
        raise ValueError("base45 invalide")
    out = bytearray()
    for i in range(0, len(vals) - 2, 3):
        n = vals[i] + vals[i + 1] * 45 + vals[i + 2] * 2025
        if n > 0xFFFF:
            raise ValueError("base45 invalide")
        out += bytes([n >> 8, n & 255])
    if len(vals) % 3 == 2:
        n = vals[-2] + vals[-1] * 45
        if n > 255:
            raise ValueError("base45 invalide")
        out.append(n)
    return bytes(out)


def _b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def _unb64u(s: str) -> bytes:
    return base64.b64decode(s + "=" * (-len(s) % 4), altchars=b"-_", validate=True)


# ---------- transport ----------
def pack(raw: bytes, link_base: str | None = None) -> str:
    z = zlib.compress(raw, 9)
    return f"{link_base}#L2B:{_b64u(z)}" if link_base else f"L2:{b45encode(z)}"


def _inflate(z: bytes) -> bytes:
    """Décompression zlib IDENTIQUE à `unzlibSync` (fflate) côté navigateur :
    en-tête vérifié, mais somme de contrôle Adler-32 (4 derniers octets) IGNORÉE. Ainsi une carte modifiée donne le même
    verdict des deux côtés (« signature invalide : carte modifiée ») ; l'intégrité, elle, repose sur la signature Ed25519."""
    if len(z) < 2 or (z[0] & 15) != 8 or (z[0] >> 4) > 7 or ((z[0] << 8 | z[1]) % 31) or (z[1] >> 5 & 1):
        raise ValueError("en-tête zlib invalide")
    d = zlib.decompressobj(wbits=-15)                 # DEFLATE brut, sans en-tête ni somme de contrôle
    out = d.decompress(z[2:-4], MAX_ENVELOPPE)
    if d.unconsumed_tail or not d.eof:
        raise ValueError("données compressées invalides ou trop grandes")
    return out


def unpack(text: str) -> bytes:
    s = text.strip()
    if "#" in s:
        s = unquote(s[s.index("#") + 1:], errors="strict")   # lien : seul le fragment compte
    if s.startswith("L2B:"):
        return _inflate(_unb64u(s[4:]))
    if s.startswith("L2:"):
        return _inflate(b45decode(s[3:]))
    raise ValueError("préfixe LAFIA absent")


# ---------- schéma (identique à validate() de schema.ts) ----------
def _keys(o: Any, allowed: list[str], where: str) -> dict:
    if not isinstance(o, dict):
        raise SchemaError(f"{where}: objet attendu")
    bad = [k for k in o if k not in allowed]
    if bad:
        raise SchemaError(f"{where}: clés inconnues {','.join(bad)}")
    return o


def _int(v: Any, lo: int, hi: int, where: str):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or (isinstance(v, float) and not v.is_integer()) or not lo <= v <= hi:
        raise SchemaError(f"{where}: entier attendu entre {lo} et {hi}")


def _code(v: Any, where: str, rx: re.Pattern = CODE):
    if not isinstance(v, str) or not rx.fullmatch(v):
        raise SchemaError(f"{where}: code invalide")


def _list(v: Any, where: str, n: int) -> list:
    if not isinstance(v, list) or len(v) > n:
        raise SchemaError(f"{where}: liste de {n} éléments maximum")
    return v


def _js_len(s: str) -> int:
    """Longueur comme en JavaScript (unités UTF-16) : un emoji compte pour 2, comme dans le navigateur."""
    return len(s.encode("utf-16-le", "surrogatepass")) // 2


def _text(v: Any, where: str, n: int):
    if not isinstance(v, str) or not 1 <= _js_len(v) <= n or CONTROLE.search(v):
        raise SchemaError(f"{where}: texte de 1 à {n} caractères sans contrôle")


def validate(p: Any) -> None:
    top = _keys(p, ["v", "id", "iat", "pr", "co"], "C0")
    if top.get("v") != VERSION:
        raise SchemaError("version non supportée")
    _code(top.get("id"), "id", PID)
    _int(top.get("iat"), EPOCH_MIN, EPOCH_MAX, "iat")
    pr = _keys(top.get("pr") if top.get("pr") is not None else {}, ["al", "tx", "ah", "ec", "gs", "yb", "sx", "vs"], "pr")
    for k in ("al", "ah"):
        for i, c in enumerate(_list(pr.get(k) if pr.get(k) is not None else [], k, 6)):
            _code(c, f"{k}[{i}]")
    for t in _list(pr.get("tx") if pr.get("tx") is not None else [], "tx", 6):
        o = _keys(t, ["c", "d"], "tx")
        _code(o.get("c"), "tx.c")
        if "d" in o and not (isinstance(o["d"], str) and DOSE.fullmatch(o["d"])):
            raise SchemaError("tx.d: la dose est une référence de table (ex. T1:L3)")
    vs = _list(pr.get("vs") if pr.get("vs") is not None else [], "vs", 6)
    for c in vs:
        if c not in CATALOG["sensibles"]:
            raise SchemaError("vs: ne peut contenir que des catégories sensibles")
    montres = list(pr.get("ah") or []) + [x.get("c") for x in (pr.get("tx") or [])]
    for c in montres:
        if c in CATALOG["sensibles"] and c not in vs:
            raise SchemaError(f"{c}: catégorie sensible hors C0 sans choix explicite du patient (pr.vs)")
    if "ec" in pr:
        ec = _keys(pr["ec"], ["n", "tel"], "ec")
        _text(ec.get("n"), "ec.n", 30)
        if not (isinstance(ec.get("tel"), str) and TEL.fullmatch(ec["tel"])):
            raise SchemaError("ec.tel invalide")
    if "gs" in pr and pr["gs"] not in CATALOG["groupes"]:
        raise SchemaError("gs invalide")
    if "yb" in pr:
        _int(pr["yb"], 1900, 2100, "yb")
    if "sx" in pr and pr["sx"] not in ("F", "M"):
        raise SchemaError("sx invalide")
    for i, raw in enumerate(_list(top.get("co") if top.get("co") is not None else [], "co", MAX_CONSULTATIONS)):
        w = f"co[{i}]"
        e = _keys(raw, ["t", "f", "a", "m", "c", "x", "adm", "o"], w)
        _int(e.get("t"), EPOCH_MIN, EPOCH_MAX, w + ".t")
        _code(e.get("f"), w + ".f", FACILITY)
        _code(e.get("a"), w + ".a", KID)
        if e.get("m") not in CATALOG["motifs"]:
            raise SchemaError(f"{w}.m: motif hors catalogue")
        if "c" in e:
            c = _keys(e["c"], ["temp", "poids", "pt"], w + ".c")
            if "temp" in c:
                _int(c["temp"], 300, 450, w + ".c.temp")
            if "poids" in c:
                _int(c["poids"], 5, 3000, w + ".c.poids")
                _int(c.get("pt"), EPOCH_MIN, EPOCH_MAX, w + ".c.pt")
            elif "pt" in c:
                raise SchemaError(w + ".c.pt sans poids")
        for j, xr in enumerate(_list(e.get("x") if e.get("x") is not None else [], w + ".x", 3)):
            x = _keys(xr, ["k", "v"], w + ".x")
            if x.get("v") not in CATALOG["tests"].get(x.get("k") if isinstance(x.get("k"), str) else "", []):
                raise SchemaError(f"{w}.x[{j}]: test ou résultat hors catalogue")
        for ar in _list(e.get("adm") if e.get("adm") is not None else [], w + ".adm", 4):
            a = _keys(ar, ["c", "h"], w + ".adm")
            _code(a.get("c"), w + ".adm.c")
            _int(a.get("h"), EPOCH_MIN, EPOCH_MAX, w + ".adm.h")
        if "o" in e:
            o = _keys(e["o"], ["k", "d"], w + ".o")
            if o.get("k") not in CATALOG["orientations"]:
                raise SchemaError(w + ".o.k hors catalogue")
            if "d" in o:
                _code(o["d"], w + ".o.d", FACILITY)


# ---------- badges et cycle brouillon → relu → signé ----------
@dataclass(frozen=True)
class Badge:
    kid: str
    cle: SigningKey = field(repr=False)

    @staticmethod
    def depuis_graine(seed_hex: str) -> "Badge":
        k = SigningKey(bytes.fromhex(seed_hex))
        return Badge(kid=k.verify_key.encode().hex()[:16], cle=k)


@dataclass(frozen=True)
class Brouillon:
    payload: dict
    origine: Literal["human", "ai"] = "human"
    statut: Literal["draft", "reviewed", "signed"] = "draft"
    relu_par: str | None = None


def nouveau_brouillon(payload: dict, origine: Literal["human", "ai"] = "human") -> Brouillon:
    validate(payload)
    return Brouillon(payload=payload, origine=origine)


def relire(b: Brouillon, kid_relecteur: str) -> Brouillon:
    return Brouillon(payload=b.payload, origine=b.origine, statut="reviewed", relu_par=kid_relecteur)


def _sans_none(v):
    """Équivalent de JSON.parse(JSON.stringify(v)) côté navigateur : retire les champs absents (None)."""
    if isinstance(v, dict):
        return {k: _sans_none(x) for k, x in v.items() if x is not None}
    if isinstance(v, list):
        return [_sans_none(x) for x in v]
    return v


def signer(b: Brouillon, badge: Badge, link_base: str | None = None) -> tuple[str, Brouillon]:
    if b.statut != "reviewed":
        raise NotReviewedError("refus : brouillon non relu par un humain")
    if b.relu_par != badge.kid:
        raise NotReviewedError("refus : le signataire doit être le relecteur")
    payload = _sans_none(b.payload)
    validate(payload)
    corps = cbor.encode(payload)
    sig = badge.cle.sign(corps).signature
    texte = pack(cbor.encode([VERSION, bytes.fromhex(badge.kid), corps, sig]), link_base)
    if len(texte) > MAX_QR_CHARS:
        raise SchemaError(f"carte trop volumineuse ({len(texte)} > {MAX_QR_CHARS} caractères)")
    return texte, Brouillon(payload=b.payload, origine=b.origine, statut="signed", relu_par=b.relu_par)


# ---------- vérification (identique à verify() de signing.ts) ----------
def verify(text: str, registre: Mapping[str, Mapping], now: int | None = None) -> dict:
    now = int(time.time()) if now is None else now

    def fail(code: str, raison: str) -> dict:
        return {"ok": False, "code": code, "reason": raison}

    try:
        env = cbor.decode(unpack(text))
        # Comme la déstructuration JavaScript [ver, kid, corps, sig] : les éléments en trop sont ignorés.
        if not isinstance(env, list) or len(env) < 4:
            raise ValueError("enveloppe")
        ver, kid_b, corps, sig = env[:4]
        if not isinstance(kid_b, bytes) or not isinstance(corps, bytes) or not isinstance(sig, bytes):
            raise ValueError("enveloppe")
    except Exception:
        return fail("UNREADABLE", "QR illisible")
    if ver != VERSION:
        return fail("UNREADABLE", "version non supportée")
    kid = kid_b.hex()
    entree = registre.get(kid)
    if not entree or entree.get("revoked"):
        return fail("UNKNOWN_SIGNER", "signataire inconnu ou révoqué")
    try:
        VerifyKey(bytes.fromhex(entree["pub"])).verify(corps, sig)
    except (BadSignatureError, ValueError):
        return fail("BAD_SIGNATURE", "signature invalide : carte modifiée")
    try:
        payload = cbor.decode(corps)
        validate(payload)
    except (SchemaError, cbor.CborError) as e:
        return fail("BAD_SCHEMA", str(e) or "schéma invalide")
    if payload["iat"] > now + FUTURE_SKEW_S:
        return fail("FUTURE_DATE", "date d'émission dans le futur (horloge ?)")
    age = max(0, (now - payload["iat"]) // 86400)
    avert = [f"carte émise il y a {age} jours : des données plus récentes peuvent exister"] if age > STALE_DAYS else []
    res = {"ok": True, "payload": payload, "kid": kid, "role": entree["role"], "iat": payload["iat"], "ageDays": age, "warnings": avert}
    for k in ("label", "etab"):
        if k in entree:
            res[k] = entree[k]
    return res


# ---------- liens ----------
_BOUCLE = re.compile(r"127(?:\.\d{1,3}){3}")


def assert_shareable_base(base: str):
    try:
        u = urlsplit(base)
    except ValueError:
        raise ValueError("Adresse invalide : une URL complète est attendue (https://…)") from None
    if not u.scheme or not u.netloc:
        raise ValueError("Adresse invalide : une URL complète est attendue (https://…)")
    if u.scheme not in ("http", "https"):
        raise ValueError("L'adresse doit commencer par http:// ou https://")
    h = (u.hostname or "").lower()
    if h in ("localhost", "::1") or _BOUCLE.fullmatch(h):
        raise ValueError("localhost ne s'ouvre pas sur un téléphone : utilisez une adresse publique ou du réseau local")
    return u


def to_link(text: str, base: str) -> str:
    u = assert_shareable_base(base)
    racine = urlunsplit((u.scheme, u.netloc, u.path or "/", u.query, ""))
    lien = pack(unpack(text), racine)
    if len(lien) > MAX_QR_CHARS:
        raise SchemaError(f"lien trop long pour le QR ({len(lien)} > {MAX_QR_CHARS} caractères)")
    return lien


# ---------- ligne de commande ----------
def main(argv: list[str] | None = None) -> int:
    """python -m lafia.c0 verifier "L2:…"   (ou un lien …#L2B:…, ou - pour lire l'entrée standard)

    Vérifie une carte avec le registre SIGNÉ (dont la signature d'autorité est d'abord contrôlée), et affiche le verdict.
    Tout se passe sur cette machine : rien n'est envoyé nulle part.
    """
    import argparse
    import json
    import sys
    from pathlib import Path

    from .registre import RegistreInvalide, lire_pub, ouvrir

    racine = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(prog="python -m lafia.c0", description="Vérifier une carte d'urgence Lafia (hors ligne).")
    sp = p.add_subparsers(dest="cmd", required=True)
    v = sp.add_parser("verifier", help="vérifie une carte et affiche son contenu")
    v.add_argument("carte", help="texte L2:… ou lien …#L2B:… (« - » pour lire l'entrée standard)")
    v.add_argument("--registre", default=str(racine / "registre_signe.json"))
    v.add_argument("--autorite", default=str(racine / "autorite.pub.json"))
    v.add_argument("--json", action="store_true", help="sortie JSON brute")
    a = p.parse_args(argv)
    try:
        badges = ouvrir(json.loads(Path(a.registre).read_text(encoding="utf-8")), lire_pub(a.autorite))["badges"]
    except (RegistreInvalide, OSError, ValueError) as e:
        print(f"Registre inutilisable : {e}", file=sys.stderr)
        return 2
    texte = sys.stdin.read() if a.carte == "-" else a.carte
    r = verify(texte, badges)
    if a.json:
        print(json.dumps(r, ensure_ascii=False, indent=2))
    elif not r["ok"]:
        print(f"✗ Carte refusée ({r['code']}) : {r['reason']}")
    else:
        pr = r["payload"].get("pr", {})
        print(f"✓ Signature valide : {r['role']}{' · ' + r['label'] if r.get('label') else ''}, émise il y a {r['ageDays']} jour(s)")
        for w in r["warnings"]:
            print(f"  ⚠ {w}")
        for cle, nom in (("al", "Allergies"), ("tx", "Traitements"), ("ah", "Antécédents"), ("gs", "Groupe sanguin"), ("yb", "Né(e) en"), ("sx", "Sexe")):
            val = pr.get(cle)
            if val is None:
                print(f"  {nom:<15} non renseigné")
            elif isinstance(val, list):
                print(f"  {nom:<15} {', '.join(x['c'] if isinstance(x, dict) else x for x in val) or 'aucun connu'}")
            else:
                print(f"  {nom:<15} {val}")
        print(f"  {'Consultations':<15} {len(r['payload'].get('co', []))}")
    return 0 if r["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
"""Journal d'accès Lafia — miroir EXACT de `frontend/src/journal/index.ts`.

Une entrée est produite par l'appareil qui lit la carte (téléphone du soignant). Le serveur ne la crée jamais :
il la recalcule et la vérifie avant de l'accepter. Toute divergence avec le TypeScript casse
`tests/test_vecteurs.py` (entrées réellement produites par le code du navigateur).

    hash = SHA-256( JSON.stringify([i, t, action, cible, rubriques, etab|null, acteur|null, prev]) )   (hex)
    sig  = Ed25519( octets du hash ), par le badge `acteur`, quand il y en a un

Chaque appareil lecteur tient SA chaîne (i = 0, 1, 2… ; prev = hash précédent, 64 zéros pour la première).
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Literal, Mapping

from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

ZERO = "0" * 64
FUTUR_TOLERE_S = 24 * 3600

RX_PATIENT = re.compile(r"^p-[0-9a-f]{8,16}$")
RX_RUBRIQUE = re.compile(r"^[A-Z0-9_]{1,12}$")
RX_ETAB = re.compile(r"^[0-9a-f]{4,8}$")
RX_KID = re.compile(r"^[0-9a-f]{16}$")
RX_HASH = re.compile(r"^[0-9a-f]{64}$")
RX_SIG = re.compile(r"^[0-9a-f]{128}$")
ACTIONS = ("LECTURE", "ECRITURE")
# Motifs d'une lecture SANS badge (catalogue fermé, identique à MOTIFS_LECTURE dans frontend/src/journal/index.ts).
MOTIFS_LECTURE = ("INCONSCIENT", "NE_PARLE_PAS", "VITAL", "AUTRE")

Statut = Literal["signee", "sans_badge", "badge_inconnu"]


class EntreeInvalide(ValueError):
    """Entrée refusée ; `code` est stable (renvoyé tel quel par l'API)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class Entree:
    i: int
    t: int
    action: str
    cible: str
    rubriques: tuple[str, ...]
    prev: str
    hash: str
    etab: str | None = None
    acteur: str | None = None
    sig: str | None = None
    motif: str | None = None

    @staticmethod
    def depuis_dict(d: Mapping) -> "Entree":
        """Valide la FORME (types, motifs). Les champs inconnus sont refusés : rien d'imprévu n'entre en base."""
        permis = {"i", "t", "action", "cible", "rubriques", "etab", "acteur", "motif", "prev", "hash", "sig"}
        inconnus = set(d) - permis
        if inconnus:
            raise EntreeInvalide("FORME", f"champs inconnus : {', '.join(sorted(inconnus))}")

        def entier(nom: str, lo: int, hi: int) -> int:
            v = d.get(nom)
            if not isinstance(v, int) or isinstance(v, bool) or not lo <= v <= hi:
                raise EntreeInvalide("FORME", f"{nom} : entier attendu entre {lo} et {hi}")
            return v

        def texte(nom: str, rx: re.Pattern, optionnel: bool = False) -> str | None:
            v = d.get(nom)
            if v is None and optionnel:
                return None
            if not isinstance(v, str) or not rx.fullmatch(v):
                raise EntreeInvalide("FORME", f"{nom} : format invalide")
            return v

        action = d.get("action")
        if action not in ACTIONS:
            raise EntreeInvalide("FORME", "action : LECTURE ou ECRITURE attendu")
        rub = d.get("rubriques")
        if not isinstance(rub, list) or not 1 <= len(rub) <= 4 or not all(isinstance(r, str) and RX_RUBRIQUE.fullmatch(r) for r in rub):
            raise EntreeInvalide("FORME", "rubriques : 1 à 4 codes attendus")
        motif = d.get("motif")
        if motif is not None and motif not in MOTIFS_LECTURE:
            raise EntreeInvalide("FORME", "motif : hors catalogue")
        return Entree(
            i=entier("i", 0, 10_000_000),
            t=entier("t", 1_600_000_000, 4_000_000_000),
            action=action,
            cible=texte("cible", RX_PATIENT),  # type: ignore[arg-type]
            rubriques=tuple(rub),
            etab=texte("etab", RX_ETAB, optionnel=True),
            acteur=texte("acteur", RX_KID, optionnel=True),
            prev=texte("prev", RX_HASH),  # type: ignore[arg-type]
            hash=texte("hash", RX_HASH),  # type: ignore[arg-type]
            sig=texte("sig", RX_SIG, optionnel=True),
            motif=motif,
        )

    def vers_dict(self) -> dict:
        d = {"i": self.i, "t": self.t, "action": self.action, "cible": self.cible, "rubriques": list(self.rubriques)}
        if self.etab:
            d["etab"] = self.etab
        if self.acteur:
            d["acteur"] = self.acteur
        if self.motif:
            d["motif"] = self.motif
        d.update(prev=self.prev, hash=self.hash)
        if self.sig:
            d["sig"] = self.sig
        return d


def contenu(e: Entree) -> str:
    """Sérialisation canonique, identique à `JSON.stringify([...])` côté navigateur (champs ASCII validés).
    Le motif n'est ajouté en fin de tableau que s'il existe : les entrées antérieures gardent leur empreinte."""
    base = [e.i, e.t, e.action, e.cible, list(e.rubriques), e.etab, e.acteur, e.prev]
    return json.dumps(base + [e.motif] if e.motif else base, separators=(",", ":"), ensure_ascii=False)


def calculer_hash(e: Entree) -> str:
    return hashlib.sha256(contenu(e).encode("utf-8")).hexdigest()


def verifier_entree(e: Entree, attendu_i: int, attendu_prev: str, registre: Mapping[str, Mapping], maintenant: int) -> Statut:
    """Vérifie UNE entrée à sa place dans la chaîne. Lève EntreeInvalide, ou renvoie le statut de l'auteur.

    - signature d'un badge du registre : vérifiée, sinon refus ;
    - badge absent du registre ou révoqué : acceptée mais marquée « badge_inconnu » (jamais présentée comme vérifiée) ;
    - pas de badge : « sans_badge ».
    """
    if e.i != attendu_i:
        raise EntreeInvalide("RANG", f"rang {e.i} reçu, {attendu_i} attendu")
    if e.prev != attendu_prev:
        raise EntreeInvalide("CHAINE", f"l'entrée {e.i} ne suit pas la précédente")
    if calculer_hash(e) != e.hash:
        raise EntreeInvalide("HASH", f"l'empreinte de l'entrée {e.i} ne correspond pas à son contenu")
    if e.t > maintenant + FUTUR_TOLERE_S:
        raise EntreeInvalide("DATE", f"l'entrée {e.i} est datée dans le futur")
    if not e.acteur:
        if e.sig:
            raise EntreeInvalide("SIGNATURE", f"l'entrée {e.i} porte une signature sans auteur")
        return "sans_badge"
    if not e.sig:
        raise EntreeInvalide("SIGNATURE", f"l'entrée {e.i} est attribuée à un badge mais n'est pas signée")
    badge = registre.get(e.acteur)
    if not badge or badge.get("revoked"):
        return "badge_inconnu"
    try:
        VerifyKey(bytes.fromhex(badge["pub"])).verify(bytes.fromhex(e.hash), bytes.fromhex(e.sig))
    except (BadSignatureError, ValueError):
        raise EntreeInvalide("SIGNATURE", f"signature invalide sur l'entrée {e.i}") from None
    return "signee"
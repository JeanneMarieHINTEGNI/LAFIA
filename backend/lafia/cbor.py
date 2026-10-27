"""CBOR minimal (RFC 8949) pour la carte Lafia : exactement le sous-ensemble produit par le navigateur (cbor-x).

Pas de dépendance externe : le format de la carte est petit et fermé, et un décodeur maison se lit en entier.
Types pris en charge : entiers, octets, texte, listes, dictionnaires, booléens, null, flottants (décodage seul).
Refusés : longueurs indéfinies, étiquettes (tags), octets restants après la valeur (comme cbor-x).
"""
from __future__ import annotations

import struct


class CborError(ValueError):
    pass


MAX_PROFONDEUR = 16
MAX_ELEMENTS = 10_000


def _tete(majeur: int, n: int) -> bytes:
    if n < 24:
        return bytes([majeur << 5 | n])
    for code, fmt, limite in ((24, ">B", 0xFF), (25, ">H", 0xFFFF), (26, ">I", 0xFFFFFFFF), (27, ">Q", 0xFFFFFFFFFFFFFFFF)):
        if n <= limite:
            return bytes([majeur << 5 | code]) + struct.pack(fmt, n)
    raise CborError("entier trop grand")


def encode(v) -> bytes:
    if v is False:
        return b"\xf4"
    if v is True:
        return b"\xf5"
    if v is None:
        return b"\xf6"
    if isinstance(v, int):
        return _tete(0, v) if v >= 0 else _tete(1, -1 - v)
    if isinstance(v, (bytes, bytearray)):
        return _tete(2, len(v)) + bytes(v)
    if isinstance(v, str):
        b = v.encode("utf-8")
        return _tete(3, len(b)) + b
    if isinstance(v, (list, tuple)):
        return _tete(4, len(v)) + b"".join(encode(x) for x in v)
    if isinstance(v, dict):
        out = [_tete(5, len(v))]
        for k, x in v.items():
            if not isinstance(k, str):
                raise CborError("clé de dictionnaire non textuelle")
            out += [encode(k), encode(x)]
        return b"".join(out)
    raise CborError(f"type non pris en charge : {type(v).__name__}")


class _Lecteur:
    def __init__(self, data: bytes):
        self.d, self.i, self.n = data, 0, 0

    def octets(self, k: int) -> bytes:
        if self.i + k > len(self.d):
            raise CborError("données tronquées")
        b = self.d[self.i:self.i + k]
        self.i += k
        return b

    def longueur(self, info: int) -> int:
        if info < 24:
            return info
        if info in (24, 25, 26, 27):
            return int.from_bytes(self.octets(1 << (info - 24)), "big")
        raise CborError("longueur indéfinie ou réservée")

    def valeur(self, profondeur: int = 0):
        if profondeur > MAX_PROFONDEUR:
            raise CborError("imbrication trop profonde")
        self.n += 1
        if self.n > MAX_ELEMENTS:
            raise CborError("trop d'éléments")
        t = self.octets(1)[0]
        majeur, info = t >> 5, t & 31
        if majeur == 7:
            if info == 20:
                return False
            if info == 21:
                return True
            if info in (22, 23):
                return None
            if info == 25:
                return struct.unpack(">e", self.octets(2))[0]
            if info == 26:
                return struct.unpack(">f", self.octets(4))[0]
            if info == 27:
                return struct.unpack(">d", self.octets(8))[0]
            raise CborError("valeur simple non prise en charge")
        n = self.longueur(info)
        if majeur == 0:
            return n
        if majeur == 1:
            return -1 - n
        if majeur == 2:
            return self.octets(n)
        if majeur == 3:
            try:
                return self.octets(n).decode("utf-8")
            except UnicodeDecodeError:
                raise CborError("texte UTF-8 invalide") from None
        if majeur == 4:
            return [self.valeur(profondeur + 1) for _ in range(n)]
        if majeur == 5:
            d = {}
            for _ in range(n):
                k = self.valeur(profondeur + 1)
                if not isinstance(k, str):
                    raise CborError("clé de dictionnaire non textuelle")
                d[k] = self.valeur(profondeur + 1)
            return d
        raise CborError("étiquettes CBOR non prises en charge")


def decode(data: bytes):
    lec = _Lecteur(bytes(data))
    v = lec.valeur()
    if lec.i != len(lec.d):
        raise CborError("octets en trop après la valeur")
    return v
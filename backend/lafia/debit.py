"""Limitation du débit des requêtes, par adresse IP (fenêtre glissante, en mémoire).

But : qu'un robot ne puisse ni saturer le serveur, ni essayer des secrets patients en masse. Les limites par défaut
sont larges pour un usage humain (un centre de santé entier derrière une même adresse IP doit passer).

Réglage par variables d'environnement, au format « nombre/secondes » :
    LAFIA_DEBIT_INSCRIPTION     POST /api/patients                       (défaut 20/3600)
    LAFIA_DEBIT_LECTURE         GET  /api/journal/patients/{id}          (défaut 120/60)
    LAFIA_DEBIT_ECHEC_JETON     secrets patients REFUSÉS (réponses 401)  (défaut 20/600)
    LAFIA_DEBIT_ENVOI           POST /api/journal/chaines/…/entrees      (défaut 120/60)
    LAFIA_DEBIT_DEFAUT          tout le reste de /api                    (défaut 300/60)
    LAFIA_DEBIT=0               désactive tout (développement uniquement)

Limite assumée : la mémoire est propre à chaque processus. Avec plusieurs processus uvicorn, chaque limite est
multipliée par leur nombre ; le déploiement actuel n'en lance qu'un.
"""
from __future__ import annotations

import math
import os
import re
import threading
import time
from collections import deque
from typing import Callable, Mapping

DEFAUTS: dict[str, tuple[int, int]] = {
    "inscription": (20, 3600),
    "lecture": (120, 60),
    "echec_jeton": (20, 600),
    "envoi": (120, 60),
    "defaut": (300, 60),
}

RX_REGLE = re.compile(r"(\d{1,6})/(\d{1,6})")


def regles_depuis_env(env: Mapping[str, str] | None = None) -> dict[str, tuple[int, int]]:
    env = os.environ if env is None else env
    regles = dict(DEFAUTS)
    for groupe in DEFAUTS:
        brut = env.get(f"LAFIA_DEBIT_{groupe.upper()}")
        if brut is None:
            continue
        m = RX_REGLE.fullmatch(brut.strip())
        if not m or int(m.group(1)) < 1 or int(m.group(2)) < 1:
            raise ValueError(f"LAFIA_DEBIT_{groupe.upper()}={brut!r} : format attendu « nombre/secondes », ex. 20/600")
        regles[groupe] = (int(m.group(1)), int(m.group(2)))
    return regles


class Limiteur:
    """Fenêtre glissante : au plus `n` événements par `fenetre` secondes, pour chaque (groupe, clé)."""

    def __init__(self, regles: Mapping[str, tuple[int, int]], horloge: Callable[[], float] = time.monotonic, max_cles: int = 50_000):
        self.regles = dict(regles)
        self.horloge = horloge
        self.max_cles = max_cles
        self._evenements: dict[tuple[str, str], deque[float]] = {}
        self._verrou = threading.Lock()

    def _file(self, groupe: str, cle: str, maintenant: float) -> deque[float]:
        n, fenetre = self.regles[groupe]
        f = self._evenements.get((groupe, cle))
        if f is None:
            if len(self._evenements) >= self.max_cles:
                self._nettoyer(maintenant)
            f = self._evenements[(groupe, cle)] = deque()
        while f and f[0] <= maintenant - fenetre:
            f.popleft()
        return f

    def _nettoyer(self, maintenant: float):
        """Mémoire bornée : on oublie les clés sans événement récent ; en dernier recours, on repart de zéro."""
        for (groupe, cle), f in list(self._evenements.items()):
            if not f or f[-1] <= maintenant - self.regles[groupe][1]:
                del self._evenements[(groupe, cle)]
        if len(self._evenements) >= self.max_cles:
            self._evenements.clear()

    def _attente(self, groupe: str, f: deque[float], maintenant: float) -> float:
        n, fenetre = self.regles[groupe]
        return max(1.0, f[0] + fenetre - maintenant) if len(f) >= n else 0.0

    def essayer(self, groupe: str, cle: str) -> float:
        """Compte un événement s'il est permis. Renvoie 0 si permis, sinon le nombre de secondes à attendre."""
        with self._verrou:
            t = self.horloge()
            f = self._file(groupe, cle, t)
            attente = self._attente(groupe, f, t)
            if not attente:
                f.append(t)
            return attente

    def attente(self, groupe: str, cle: str) -> float:
        """Comme `essayer`, sans rien compter (pour les échecs, comptés seulement après coup avec `noter`)."""
        with self._verrou:
            t = self.horloge()
            return self._attente(groupe, self._file(groupe, cle, t), t)

    def noter(self, groupe: str, cle: str):
        with self._verrou:
            t = self.horloge()
            self._file(groupe, cle, t).append(t)


def groupe_de(methode: str, chemin: str) -> str | None:
    """Groupe de limitation d'une requête ; None = hors /api (non limité ici)."""
    if not chemin.startswith("/api/"):
        return None
    if methode == "POST" and chemin == "/api/patients":
        return "inscription"
    if methode == "GET" and chemin.startswith("/api/journal/patients/"):
        return "lecture"
    if methode == "POST" and chemin.startswith("/api/journal/chaines/"):
        return "envoi"
    return "defaut"


def secondes_entieres(attente: float) -> int:
    return max(1, math.ceil(attente))
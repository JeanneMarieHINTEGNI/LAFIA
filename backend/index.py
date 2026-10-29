"""Point d'entrée Vercel (fonction Python) : l'application FastAPI de Lafia, servie sous /api/.

Sur Vercel, le disque n'est pas conservé : la base est Turso (LAFIA_DB = libsql://…, LAFIA_DB_JETON), et le site
appelle cette API depuis une autre adresse (LAFIA_ORIGINES = https://lafia-1nkp.vercel.app). Voir README.md.
"""
import os

os.environ.setdefault("LAFIA_AUTOSTART", "0")   # l'application est créée ici, une seule fois

from fastapi import FastAPI  # noqa: E402

from lafia.api import creer_app  # noqa: E402

app: FastAPI = creer_app()
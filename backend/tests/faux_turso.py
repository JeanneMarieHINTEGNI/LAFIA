"""Faux serveur Turso pour les tests : l'API HTTP `POST /v2/pipeline` (format Hrana v2), exécutée sur un fichier SQLite.

Il reproduit ce dont dépend notre client : jeton Bearer, arguments typés (entiers en texte), lignes typées,
résultat d'erreur, et le « baton » qui garde la même connexion d'une requête à l'autre (transactions).
"""
from __future__ import annotations

import base64
import json
import secrets
import sqlite3
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def _val(a: dict):
    t = a["type"]
    if t == "null":
        return None
    if t == "integer":
        assert isinstance(a["value"], str), "Turso attend les entiers en texte"
        return int(a["value"])
    if t == "float":
        return float(a["value"])
    if t == "blob":
        return base64.b64decode(a["base64"])
    return a["value"]


def _cell(v):
    if v is None:
        return {"type": "null"}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    if isinstance(v, bytes):
        return {"type": "blob", "base64": base64.b64encode(v).decode()}
    return {"type": "text", "value": v}


class FauxTurso:
    def __init__(self, chemin: str, jeton: str = "jeton-de-test"):
        self.chemin, self.jeton = chemin, jeton
        self.connexions: dict[str, sqlite3.Connection] = {}
        self.requetes_http = 0
        self.verrou = threading.Lock()
        faux = self

        class Gestion(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                if self.path != "/v2/pipeline":
                    self.send_error(404); return
                if self.headers.get("Authorization") != f"Bearer {faux.jeton}":
                    self.send_error(401); return
                corps = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                rep = faux.traiter(corps)
                data = json.dumps(rep).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.serveur = ThreadingHTTPServer(("127.0.0.1", 0), Gestion)
        self.url = f"http://127.0.0.1:{self.serveur.server_port}"
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()

    def traiter(self, corps: dict) -> dict:
        with self.verrou:
            self.requetes_http += 1
            baton = corps.get("baton")
            if baton:
                cx = self.connexions.pop(baton)
            else:
                cx = sqlite3.connect(self.chemin, isolation_level=None, check_same_thread=False, timeout=10)
            resultats, ferme = [], False
            for r in corps["requests"]:
                if r["type"] == "close":
                    ferme = True
                    resultats.append({"type": "ok", "response": {"type": "close"}})
                    continue
                st = r["stmt"]
                try:
                    cur = cx.execute(st["sql"], [_val(a) for a in st.get("args", [])])
                    lignes = cur.fetchall()
                    cols = [{"name": d[0], "decltype": None} for d in (cur.description or [])]
                    resultats.append({"type": "ok", "response": {"type": "execute", "result": {
                        "cols": cols, "rows": [[_cell(v) for v in l] for l in lignes],
                        "affected_row_count": cur.rowcount if cur.rowcount > 0 else 0, "last_insert_rowid": None}}})
                except sqlite3.Error as e:
                    resultats.append({"type": "error", "error": {"message": str(e), "code": "SQLITE_ERROR"}})
            if ferme:
                cx.close()
                return {"baton": None, "base_url": None, "results": resultats}
            nouveau = secrets.token_hex(8)
            self.connexions[nouveau] = cx
            return {"baton": nouveau, "base_url": None, "results": resultats}

    def arreter(self):
        self.serveur.shutdown()
        self.serveur.server_close()
        for cx in self.connexions.values():
            cx.close()
# syntax=docker/dockerfile:1
# Backend Lafia (FastAPI) derrière le Caddy commun (~/apps/edge), joint par le réseau « edge », jamais publié sur l'hôte.
# À FAIRE avant la production : épingler l'image par son empreinte (digest), comme le frontend.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY requirements.txt ./
# Dépendances d'exécution seulement (pytest/httpx servent aux tests, pas au serveur).
RUN grep -vE '^(pytest|httpx)==' requirements.txt > req-prod.txt && pip install -r req-prod.txt && rm req-prod.txt
COPY lafia ./lafia
# Registre SIGNÉ et clé PUBLIQUE de l'autorité. La clé privée (secrets_demo/) n'entre jamais dans l'image.
COPY registre_signe.json autorite.pub.json ./

# Utilisateur non root ; seul /data (volume) est inscriptible : la base SQLite y vit.
RUN useradd --uid 1000 --no-create-home --shell /usr/sbin/nologin lafia && mkdir -p /data /registre && chown lafia /data \
 && cp /app/registre_signe.json /registre/   # copie de départ ; en production, /registre est monté depuis l'hôte (compose.yaml)
USER 1000:1000
ENV LAFIA_DB=/data/lafia.db LAFIA_REGISTRE=/registre/registre_signe.json LAFIA_AUTORITE=/app/autorite.pub.json
EXPOSE 8000
HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/sante').status==200 else 1)"
CMD ["uvicorn", "lafia.api:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]

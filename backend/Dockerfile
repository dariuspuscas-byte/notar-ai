# notar-ai REST API (FastAPI + notar_ai_core).
# Build context: backend/  (see root docker-compose.yml)
FROM python:3.14-slim

# poppler-utils provides `pdftoppm`, used to rasterize PDFs for classification.
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Installed editable so notar_ai_core.config still resolves the backend root
# to /app (it derives it from its own source path).
COPY core ./core
COPY api ./api
RUN pip install -e ./core -e ./api

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Run as an unprivileged user. The documents dir is created (and owned) here so
# a fresh named volume mounted over it inherits that ownership.
RUN useradd --system --uid 10001 --no-create-home app \
    && mkdir -p /app/data/documents \
    && chown -R app:app /app/data
USER app

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["sh", "-c", "exec uvicorn notar_ai_api.app:app --app-dir api/src --host 0.0.0.0 --port ${PORT:-3000} --proxy-headers --forwarded-allow-ips='*'"]

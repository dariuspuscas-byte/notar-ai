#!/bin/sh
# Applies DB migrations and seeds the act-type catalog (idempotent) before
# starting the API. Set SKIP_MIGRATIONS=true to skip both steps.
set -e

if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
    echo "Running database migrations..."
    (cd /app/core && alembic upgrade head)
    echo "Seeding act types..."
    (cd /app/core && python seed.py)
fi

exec "$@"

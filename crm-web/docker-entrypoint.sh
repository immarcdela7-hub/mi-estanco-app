#!/bin/sh
set -e

echo "→ Esperando a la base de datos y aplicando migraciones…"
# Reintenta migrate deploy hasta que Postgres acepte conexiones
tries=0
until node node_modules/prisma/build/index.js migrate deploy; do
  tries=$((tries + 1))
  if [ "$tries" -ge 30 ]; then
    echo "✗ La base de datos no respondió tras 30 intentos. Abortando."
    exit 1
  fi
  echo "  base de datos no lista todavía (intento $tries), reintentando en 2s…"
  sleep 2
done

echo "✓ Migraciones aplicadas. Arrancando el servidor."
exec "$@"

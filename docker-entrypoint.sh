#!/bin/sh
set -eu
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  npx prisma migrate deploy
fi
if [ "${RUN_SEED:-false}" = "true" ]; then
  node dist/prisma/seed.js
fi
if [ "$#" -gt 0 ]; then
  exec "$@"
fi
exec node dist/src/server.js

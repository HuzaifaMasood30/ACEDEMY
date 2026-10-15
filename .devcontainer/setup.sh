#!/usr/bin/env bash
# One-time codespace setup: create .env, install deps, migrate, seed.
# Safe to re-run — it will not overwrite an existing .env.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "→ Writing .env for the codespace database"
  cat > .env <<'EOF'
DATABASE_URL="postgresql://academy:academy@db:5432/academy_erp?schema=public"
APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="Al-Noor Academy"
AUTH_SECRET="codespace-dev-only-secret-change-before-any-real-deployment"
AUTH_TRUST_HOST="true"
SESSION_MAX_AGE="28800"
LOGIN_MAX_ATTEMPTS="5"
LOGIN_LOCKOUT_MINUTES="15"
ACADEMY_NAME="Al-Noor Academy"
ACADEMY_TIMEZONE="Asia/Karachi"
ACADEMY_CURRENCY="PKR"
ACADEMY_LOCALE="en"
STORAGE_DRIVER="local"
STORAGE_LOCAL_DIR="./storage/uploads"
STORAGE_MAX_FILE_MB="10"
WHATSAPP_MODE="mock"
WHATSAPP_GRAPH_API_VERSION="v21.0"
WHATSAPP_API_BASE="https://graph.facebook.com"
WHATSAPP_DEFAULT_LOCALE="en"
WHATSAPP_QUIET_HOURS_START="21:00"
WHATSAPP_QUIET_HOURS_END="07:00"
WHATSAPP_RATE_LIMIT_PER_MINUTE="60"
WORKER_POLL_INTERVAL_MS="5000"
WORKER_BATCH_SIZE="25"
WORKER_MAX_ATTEMPTS="4"
WORKER_CONCURRENCY="4"
SEED_DEFAULT_PASSWORD="Academy@123"
EOF
else
  echo "→ .env already exists, leaving it alone"
fi

echo "→ Installing dependencies"
npm install

echo "→ Waiting for PostgreSQL"
for i in $(seq 1 30); do
  if npx prisma db execute --stdin --schema prisma/schema.prisma <<< 'SELECT 1' >/dev/null 2>&1; then
    echo "   database is up"
    break
  fi
  sleep 2
done

echo "→ Applying migrations"
npx prisma migrate deploy

echo "→ Seeding demo data"
npm run db:seed || echo "   seed skipped (already seeded)"

echo "✅ Setup complete. The app will start automatically."

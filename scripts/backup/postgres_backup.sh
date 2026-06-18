#!/usr/bin/env sh
set -eu

BACKUP_OUTPUT_DIR=${BACKUP_OUTPUT_DIR:-./backups}
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$BACKUP_OUTPUT_DIR"

make_url() {
  host="$1"
  port="$2"
  db="$3"
  user="$4"
  password="$5"
  if [ -z "$host" ] || [ -z "$db" ] || [ -z "$user" ]; then
    echo ""
    return 0
  fi
  echo "postgresql://${user}:${password}@${host}:${port:-5432}/${db}"
}

backup_db() {
  name="$1"
  url="$2"
  if [ -z "$url" ]; then
    echo "skip $name: database url is empty"
    return 0
  fi

  output="$BACKUP_OUTPUT_DIR/${name}_${TIMESTAMP}.sql.gz"
  echo "creating backup for $name -> $output"
  pg_dump "$url" | gzip -c > "$output"

  if [ ! -s "$output" ]; then
    echo "backup failed for $name: output is empty" >&2
    exit 1
  fi
}

IDENTITY_URL=${IDENTITY_DATABASE_URL:-$(make_url "${IDENTITY_DB_HOST:-${DB_HOST:-}}" "${IDENTITY_DB_PORT:-${DB_PORT:-5432}}" "${IDENTITY_DB_NAME:-${DB_NAME:-}}" "${IDENTITY_DB_USER:-${DB_USER:-}}" "${IDENTITY_DB_PASSWORD:-${DB_PASSWORD:-}}")}
CATALOG_URL=${CATALOG_DATABASE_URL:-$(make_url "${CATALOG_DB_HOST:-}" "${CATALOG_DB_PORT:-5432}" "${CATALOG_DB_NAME:-}" "${CATALOG_DB_USER:-}" "${CATALOG_DB_PASSWORD:-}")}
SUBSCRIPTION_URL=${SUBSCRIPTION_DATABASE_URL:-$(make_url "${SUBSCRIPTION_DB_HOST:-}" "${SUBSCRIPTION_DB_PORT:-5432}" "${SUBSCRIPTION_DB_NAME:-}" "${SUBSCRIPTION_DB_USER:-}" "${SUBSCRIPTION_DB_PASSWORD:-}")}
ENGAGEMENT_URL=${ENGAGEMENT_DATABASE_URL:-$(make_url "${ENGAGEMENT_DB_HOST:-}" "${ENGAGEMENT_DB_PORT:-5432}" "${ENGAGEMENT_DB_NAME:-}" "${ENGAGEMENT_DB_USER:-}" "${ENGAGEMENT_DB_PASSWORD:-}")}

backup_db identity "$IDENTITY_URL"
backup_db catalog "$CATALOG_URL"
backup_db subscription "$SUBSCRIPTION_URL"
backup_db engagement "$ENGAGEMENT_URL"

echo "postgres backups completed in $BACKUP_OUTPUT_DIR"

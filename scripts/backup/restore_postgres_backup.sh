#!/usr/bin/env sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <database_url> <backup_file.sql.gz>" >&2
  exit 1
fi

DATABASE_URL="$1"
BACKUP_FILE="$2"

if [ ! -s "$BACKUP_FILE" ]; then
  echo "backup file does not exist or is empty: $BACKUP_FILE" >&2
  exit 1
fi

gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
echo "restore completed from $BACKUP_FILE"

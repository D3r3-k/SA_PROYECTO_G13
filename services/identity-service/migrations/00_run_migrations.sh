#!/bin/sh
set -e

echo "Running Identity Service migrations..."

run_sql_dir() {
  DIR=$1

  if [ -d "$DIR" ]; then
    for file in "$DIR"/*.sql; do
      if [ -f "$file" ]; then
        echo "Running migration: $file"
        psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$file"
      fi
    done
  fi
}

run_sql_dir /docker-entrypoint-initdb.d/01_extensions
run_sql_dir /docker-entrypoint-initdb.d/02_tables
run_sql_dir /docker-entrypoint-initdb.d/03_functions
run_sql_dir /docker-entrypoint-initdb.d/04_views
run_sql_dir /docker-entrypoint-initdb.d/05_procedures
run_sql_dir /docker-entrypoint-initdb.d/06_triggers

echo "Identity Service migrations completed."

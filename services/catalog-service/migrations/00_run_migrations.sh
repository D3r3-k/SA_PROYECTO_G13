#!/bin/bash
set -e

echo "Running Catalog Service migrations..."

run_sql_dir() {
  DIR=$1

  if [ -d "$DIR" ]; then
    for file in "$DIR"/*.sql; do
      if [ -f "$file" ]; then
        echo "======================================="
        echo "Running migration: $file"
        echo "First lines:"
        head -n 10 "$file"
        echo "======================================="
        mysql \
          -uroot \
          -p"$MYSQL_ROOT_PASSWORD" \
          "$MYSQL_DATABASE" < "$file"
      fi
    done
  fi
}

run_sql_dir /docker-entrypoint-initdb.d/migrations/01_extensions
run_sql_dir /docker-entrypoint-initdb.d/migrations/02_tables
run_sql_dir /docker-entrypoint-initdb.d/migrations/03_functions
run_sql_dir /docker-entrypoint-initdb.d/migrations/04_views
run_sql_dir /docker-entrypoint-initdb.d/migrations/05_procedures
run_sql_dir /docker-entrypoint-initdb.d/migrations/06_triggers

echo "Catalog Service migrations completed."
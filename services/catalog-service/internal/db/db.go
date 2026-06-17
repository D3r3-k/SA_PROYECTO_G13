package db

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 5
	cfg.MinConns = 1
	cfg.MaxConnLifetime = 30 * time.Minute
	return pgxpool.NewWithConfig(ctx, cfg)
}

func ApplyMigrations(ctx context.Context, pool *pgxpool.Pool, migrationsDir string) error {
	files, err := filepath.Glob(filepath.Join(migrationsDir, "*.sql"))
	if err != nil {
		return err
	}
	sort.Strings(files)

	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("[catalog-service] Error: acquire migration connection: %w", err)
	}
	defer conn.Release()

	for _, file := range files {
		sqlBytes, err := os.ReadFile(file)
		if err != nil {
			return fmt.Errorf("[catalog-service] Error: read migration %s: %w", file, err)
		}
		// pgconn.Exec usa simple query protocol, que soporta multi-statement SQL
		// con BEGIN/COMMIT explicito (a diferencia del extended protocol de pool.Exec).
		mrr := conn.Conn().PgConn().Exec(ctx, string(sqlBytes))
		for mrr.NextResult() {
			if _, err := mrr.ResultReader().Close(); err != nil {
				_ = mrr.Close()
				return fmt.Errorf("[catalog-service] Error: apply migration %s: %w", file, err)
			}
		}
		if err := mrr.Close(); err != nil {
			return fmt.Errorf("[catalog-service] Error: apply migration %s: %w", file, err)
		}
	}
	return nil
}


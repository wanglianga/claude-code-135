package main

import (
	"context"
	"embed"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed sql/schema.sql sql/seed.sql
var schemaFS embed.FS

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func connectDB(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 8
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

// waitDB 等待数据库就绪（compose 场景）
func waitDB(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	var last error
	for i := 0; i < 30; i++ {
		pool, err := connectDB(ctx, dsn)
		if err == nil {
			return pool, nil
		}
		last = err
		time.Sleep(time.Second)
	}
	return nil, fmt.Errorf("database not ready: %w", last)
}

func migrate(ctx context.Context, db *pgxpool.Pool) error {
	schema, err := schemaFS.ReadFile("sql/schema.sql")
	if err != nil {
		return err
	}
	if _, err := db.Exec(ctx, string(schema)); err != nil {
		return fmt.Errorf("migrate schema: %w", err)
	}
	// 演示种子数据：仅在空库时执行一次
	var userCount int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&userCount); err != nil {
		return fmt.Errorf("check seed: %w", err)
	}
	if userCount == 0 {
		seed, err := schemaFS.ReadFile("sql/seed.sql")
		if err != nil {
			return err
		}
		if _, err := db.Exec(ctx, string(seed)); err != nil {
			return fmt.Errorf("migrate seed: %w", err)
		}
	}
	return nil
}

package db

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v4/pgxpool"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

func Connect(databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 10
	cfg.ConnConfig.RuntimeParams["timezone"] = "Asia/Shanghai"
	var pool *pgxpool.Pool
	for i := 0; i < 30; i++ {
		pool, err = pgxpool.ConnectConfig(context.Background(), cfg)
		if err == nil {
			if e := pool.Ping(context.Background()); e == nil {
				return pool, nil
			}
			err = pool.Ping(context.Background())
		}
		time.Sleep(time.Second)
	}
	return nil, fmt.Errorf("连接数据库失败: %w", err)
}

// Migrate 执行 migrations 目录下尚未应用的 SQL 文件（按文件名排序）。
func Migrate(pool *pgxpool.Pool) error {
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		filename TEXT PRIMARY KEY,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`); err != nil {
		return err
	}

	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		var ok bool
		if err := pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE filename=$1)`, name).Scan(&ok); err != nil {
			return err
		}
		if ok {
			continue
		}
		content, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		tx, err := pool.Begin(ctx)
		if err != nil {
			return err
		}
		// 多语句 SQL 走 simple protocol
		if _, err := tx.Exec(ctx, string(content)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("执行迁移 %s 失败: %w", name, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO schema_migrations(filename) VALUES($1)`, name); err != nil {
			_ = tx.Rollback(ctx)
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
	}
	return nil
}

package main

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// queryRows 执行查询并返回 JSON 友好的行切片，按列的 OID 做类型规整
func queryRows(ctx context.Context, pool *pgxpool.Pool, sql string, args ...any) ([]map[string]any, error) {
	rows, err := pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	out := make([]map[string]any, 0)
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			return nil, err
		}
		row := make(map[string]any, len(fields))
		for i, f := range fields {
			row[f.Name] = normalizeValue(vals[i], f.DataTypeOID)
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func queryOne(ctx context.Context, pool *pgxpool.Pool, sql string, args ...any) (map[string]any, error) {
	rows, err := queryRows(ctx, pool, sql, args...)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, pgx.ErrNoRows
	}
	return rows[0], nil
}

func normalizeValue(v any, oid uint32) any {
	switch x := v.(type) {
	case nil:
		return nil
	case pgtype.Numeric:
		if f, err := x.Float64Value(); err == nil && f.Valid {
			return f.Float64
		}
		return nil
	case []byte:
		// json/jsonb 直接解析，其余按字符串
		if oid == pgJSONBOID || oid == pgJSONOID {
			var parsed any
			if err := json.Unmarshal(x, &parsed); err == nil {
				return parsed
			}
		}
		return string(x)
	default:
		// int64/bool/float64/time.Time 等保持原生类型，交给 JSON 编码
		return v
	}
}

const (
	pgNumericOID uint32 = 1700
	pgJSONOID    uint32 = 114
	pgJSONBOID   uint32 = 3802
)

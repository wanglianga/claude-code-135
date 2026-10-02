package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgtype"
	"github.com/jackc/pgx/v4"
	"github.com/jackc/pgx/v4/pgxpool"
)

type Server struct {
	Pool *pgxpool.Pool
	Mux  *http.ServeMux
}

type ctxKey string

const userCtxKey ctxKey = "user"

type User struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Phone  string `json:"phone"`
	Role   string `json:"role"`
	FarmID *int64 `json:"farm_id"`
}

func New(pool *pgxpool.Pool) *Server {
	s := &Server{Pool: pool, Mux: http.NewServeMux()}
	s.routes()
	return s
}

// ---------- 工具 ----------

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]interface{}{"error": msg})
}

func decode(r *http.Request, v interface{}) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
}

func hashPassword(p string) string {
	sum := sha256.Sum256([]byte(p))
	return hex.EncodeToString(sum[:])
}

func newToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// numericToFloat64 把 pgtype.Numeric 转成 float64
func numericToFloat64(n pgtype.Numeric) interface{} {
	if n.Status != pgtype.Present || n.Int == nil {
		return nil
	}
	f := new(big.Float).SetInt(n.Int)
	if n.Exp != 0 {
		f.Mul(f, big.NewFloat(math.Pow10(int(n.Exp))))
	}
	out, _ := f.Float64()
	return out
}

// queryRows 通用查询，返回列名->值的 map 切片（NUMERIC 转 float64）
func (s *Server) queryRows(ctx context.Context, sqlText string, args ...interface{}) ([]map[string]interface{}, error) {
	rows, err := s.Pool.Query(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	fields := rows.FieldDescriptions()
	var out []map[string]interface{}
	for rows.Next() {
		vals := make([]interface{}, len(fields))
		ptrs := make([]interface{}, len(fields))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		row := make(map[string]interface{}, len(fields))
		for i, v := range vals {
			name := string(fields[i].Name)
			switch vv := v.(type) {
			case nil:
				row[name] = nil
			case pgtype.Numeric:
				row[name] = numericToFloat64(vv)
			case time.Time:
				row[name] = vv
			case int32:
				row[name] = int64(vv)
			case int16:
				row[name] = int64(vv)
			case []byte:
				// JSON/JSONB 在 pgx v4 下可能以 []byte 返回
				var parsed interface{}
				if err := json.Unmarshal(vv, &parsed); err == nil {
					row[name] = parsed
				} else {
					row[name] = string(vv)
				}
			default:
				row[name] = v
			}
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Server) queryOne(ctx context.Context, sqlText string, args ...interface{}) (map[string]interface{}, error) {
	rows, err := s.queryRows(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, pgx.ErrNoRows
	}
	return rows[0], nil
}

// insertRow 白名单字段插入，返回新行（含 RETURNING *）
func (s *Server) insertRow(ctx context.Context, table string, data map[string]interface{}, jsonCols ...string) (map[string]interface{}, error) {
	cols := make([]string, 0, len(data))
	args := make([]interface{}, 0, len(data))
	i := 1
	jsonSet := map[string]bool{}
	for _, c := range jsonCols {
		jsonSet[c] = true
	}
	// 固定顺序，便于测试稳定
	keys := make([]string, 0, len(data))
	for k := range data {
		keys = append(keys, k)
	}
	// 简单排序
	for a := 0; a < len(keys); a++ {
		for b := a + 1; b < len(keys); b++ {
			if keys[b] < keys[a] {
				keys[a], keys[b] = keys[b], keys[a]
			}
		}
	}
	for _, k := range keys {
		cols = append(cols, k)
		v := data[k]
		if jsonSet[k] && v != nil {
			if _, ok := v.(string); !ok {
				b, _ := json.Marshal(v)
				v = string(b)
			}
		}
		args = append(args, v)
		i++
	}
	placeholders := make([]string, len(cols))
	for j := range cols {
		placeholders[j] = fmt.Sprintf("$%d", j+1)
	}
	q := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) RETURNING *",
		table, strings.Join(cols, ","), strings.Join(placeholders, ","))
	return s.queryOne(ctx, q, args...)
}

// ---------- 认证 ----------

func (s *Server) currentUser(r *http.Request) *User {
	if u, ok := r.Context().Value(userCtxKey).(*User); ok {
		return u
	}
	return nil
}

func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, ok := s.authenticate(w, r, true)
		if !ok {
			return
		}
		ctx := context.WithValue(r.Context(), userCtxKey, u)
		next(w, r.WithContext(ctx))
	}
}

// optionalAuth 有 token 则注入用户，没有也放行（用于公开读+登录写的接口）
func (s *Server) optionalAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if u, ok := s.authenticate(w, r, false); ok && u != nil {
			ctx := context.WithValue(r.Context(), userCtxKey, u)
			r = r.WithContext(ctx)
		}
		next(w, r)
	}
}

func (s *Server) authenticate(w http.ResponseWriter, r *http.Request, required bool) (*User, bool) {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token == "" {
		if required {
			writeErr(w, http.StatusUnauthorized, "未登录")
		}
		return nil, !required
	}
	u := &User{}
	err := s.Pool.QueryRow(r.Context(),
		`SELECT u.id, u.name, u.phone, u.role, u.farm_id
		 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1`, token).
		Scan(&u.ID, &u.Name, &u.Phone, &u.Role, &u.FarmID)
	if err != nil {
		if required {
			writeErr(w, http.StatusUnauthorized, "登录已失效")
		}
		return nil, !required
	}
	return u, true
}

func requireRole(u *User, roles ...string) bool {
	for _, r := range roles {
		if u.Role == r {
			return true
		}
	}
	return false
}

// f64 从请求 map 取 float64
func f64(m map[string]interface{}, key string) (float64, bool) {
	if v, ok := m[key]; ok {
		switch x := v.(type) {
		case float64:
			return x, true
		case string:
			var f float64
			_, err := fmt.Sscanf(x, "%f", &f)
			return f, err == nil
		}
	}
	return 0, false
}

func i64(m map[string]interface{}, key string) (int64, bool) {
	if v, ok := f64(m, key); ok {
		return int64(v), true
	}
	return 0, false
}

func str(m map[string]interface{}, key string) (string, bool) {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok && s != "" {
			return s, true
		}
	}
	return "", false
}

func asID(v interface{}) (int64, bool) {
	switch x := v.(type) {
	case float64:
		return int64(x), true
	case int64:
		return x, true
	case int32:
		return int64(x), true
	case int16:
		return int64(x), true
	case int:
		return int64(x), true
	}
	return 0, false
}

// numVal 从查询结果单元格取数值（整型已在 mapper 中统一为 int64）
func numVal(v interface{}) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case int64:
		return float64(x), true
	case int:
		return float64(x), true
	}
	return 0, false
}

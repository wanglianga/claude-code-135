package api

import (
	"net/http"

	"github.com/jackc/pgx/v4"
)

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, 405, "方法不允许")
		return
	}
	var in struct {
		Name     string `json:"name"`
		Phone    string `json:"phone"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if err := decode(r, &in); err != nil || in.Name == "" || in.Phone == "" || in.Password == "" {
		writeErr(w, 400, "请填写姓名、手机号和密码")
		return
	}
	if in.Role == "" {
		in.Role = "adopter"
	}
	valid := map[string]bool{"adopter": true, "farmer": true, "picker": true, "packer": true, "logistics": true, "service": true}
	if !valid[in.Role] {
		writeErr(w, 400, "角色非法（自助注册不能注册为管理员）")
		return
	}
	var id int64
	err := s.Pool.QueryRow(r.Context(),
		`INSERT INTO users(name, phone, password_hash, role) VALUES($1,$2,$3,$4) RETURNING id`,
		in.Name, in.Phone, hashPassword(in.Password), in.Role).Scan(&id)
	if err != nil {
		writeErr(w, 409, "手机号已注册")
		return
	}
	writeJSON(w, 201, map[string]interface{}{"id": id, "name": in.Name, "phone": in.Phone, "role": in.Role})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, 405, "方法不允许")
		return
	}
	var in struct {
		Phone    string `json:"phone"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, 400, "请求格式错误")
		return
	}
	u := User{}
	err := s.Pool.QueryRow(r.Context(),
		`SELECT id, name, phone, role, farm_id FROM users WHERE phone=$1 AND password_hash=$2`,
		in.Phone, hashPassword(in.Password)).
		Scan(&u.ID, &u.Name, &u.Phone, &u.Role, &u.FarmID)
	if err == pgx.ErrNoRows {
		writeErr(w, 401, "手机号或密码错误")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	token := newToken()
	if _, err := s.Pool.Exec(r.Context(),
		`INSERT INTO sessions(token, user_id) VALUES($1,$2)`, token, u.ID); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]interface{}{
		"token": token,
		"user":  u,
	})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	u := s.currentUser(r)
	row, err := s.queryOne(r.Context(),
		`SELECT id, name, phone, role, farm_id FROM users WHERE id=$1`, u.ID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, row)
}

package main

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type authUser struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	FarmID *int64 `json:"farm_id"`
	Phone  string `json:"phone"`
}

type loginReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func loginHandler(pool *pgxpool.Pool, secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req loginReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		var (
			u     authUser
			hash  string
			phone *string
		)
		err := pool.QueryRow(c,
			`SELECT id, name, role, farm_id, COALESCE(phone,''), password_hash
			 FROM users WHERE username=$1`, req.Username).
			Scan(&u.ID, &u.Name, &u.Role, &u.FarmID, &phone, &hash)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
			return
		}
		u.Phone = *phone
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"uid":  u.ID,
			"role": u.Role,
			"exp":  time.Now().Add(72 * time.Hour).Unix(),
		})
		s, err := tok.SignedString([]byte(secret))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "签发令牌失败"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"token": s, "user": u})
	}
}

func authMiddleware(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
			return
		}
		tokenStr := strings.TrimPrefix(h, "Bearer ")
		claims := jwt.MapClaims{}
		tok, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(secret), nil
		})
		if err != nil || !tok.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "登录已失效"})
			return
		}
		uidF, _ := claims["uid"].(float64)
		role, _ := claims["role"].(string)
		c.Set("uid", int64(uidF))
		c.Set("role", role)
		c.Next()
	}
}

func currentUser(c *gin.Context) (int64, string) {
	uid, _ := c.Get("uid")
	role, _ := c.Get("role")
	return uid.(int64), role.(string)
}

// requireRole 任一角色即可（admin 默认放行）
func requireRole(roles ...string) gin.HandlerFunc {
	allowed := map[string]bool{}
	for _, r := range roles {
		allowed[r] = true
	}
	return func(c *gin.Context) {
		_, role := currentUser(c)
		if !allowed[role] && role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "当前角色无权操作"})
			return
		}
		c.Next()
	}
}

func meHandler(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid, _ := currentUser(c)
		var u authUser
		var phone *string
		err := pool.QueryRow(c,
			`SELECT id, name, role, farm_id, COALESCE(phone,'') FROM users WHERE id=$1`, uid).
			Scan(&u.ID, &u.Name, &u.Role, &u.FarmID, &phone)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
			return
		}
		u.Phone = *phone
		c.JSON(http.StatusOK, u)
	}
}

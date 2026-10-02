package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

//go:embed all:frontend/dist
var distFS embed.FS

//go:generate echo "build server"

func main() {
	dsn := getenv("DATABASE_URL",
		"postgres://farm:farm@127.0.0.1:5433/farmadopt?sslmode=disable")
	addr := getenv("HTTP_ADDR", ":8080")
	jwtSecret := getenv("JWT_SECRET", "farm-adopt-dev-secret")

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	pool, err := waitDB(ctx, dsn)
	cancel()
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	defer pool.Close()

	mctx, mcancel := context.WithTimeout(context.Background(), 30*time.Second)
	if err := migrate(mctx, pool); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	mcancel()
	log.Println("database migrated")

	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.Use(corsMiddleware())

	api := r.Group("/api")
	registerRoutes(api, pool, jwtSecret)

	// 前端静态资源（SPA）
	sub, err := fs.Sub(distFS, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}
	fileServer := http.FileServer(http.FS(sub))
	r.NoRoute(func(c *gin.Context) {
		p := strings.TrimPrefix(c.Request.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(sub, p); err != nil {
			if strings.HasPrefix(c.Request.URL.Path, "/api/") {
				c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
				return
			}
			c.Request.URL.Path = "/"
		}
		fileServer.ServeHTTP(c.Writer, c.Request)
	})

	log.Printf("farm-adopt server listening on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatal(err)
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type,Authorization")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

package main

import (
	"log"
	"net/http"
	"os"
	"strings"

	"farmcrowd/internal/api"
	"farmcrowd/internal/db"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://farm:farm@127.0.0.1:5432/farmcrowd?sslmode=disable"
	}
	addr := os.Getenv("PORT")
	if addr == "" {
		addr = ":8080"
	}
	staticDir := os.Getenv("STATIC_DIR") // 容器内挂载前端构建产物

	pool, err := db.Connect(databaseURL)
	if err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}
	if err := db.Migrate(pool); err != nil {
		log.Fatalf("数据库迁移失败: %v", err)
	}
	log.Println("数据库迁移完成")

	srv := api.New(pool)

	mux := http.NewServeMux()
	// API（统一加 CORS）
	mux.Handle("/api/", cors(srv.Mux))

	// 前端静态资源（生产模式由 backend 一并托管）
	if staticDir != "" {
		fs := http.FileServer(http.Dir(staticDir))
		mux.Handle("/", spaHandler(staticDir, fs))
		log.Printf("托管前端静态资源: %s", staticDir)
	}

	log.Printf("谷香认养平台已启动: http://0.0.0.0%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// spaHandler 支持前端 history 路由：不存在的文件回退到 index.html
func spaHandler(dir string, fs http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := os.Stat(dir + "/" + p); os.IsNotExist(err) {
			r.URL.Path = "/"
		}
		fs.ServeHTTP(w, r)
	})
}

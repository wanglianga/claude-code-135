# ---- 1) 前端构建 ----
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/ ./
RUN npm install --no-audit --no-fund && npm run build

# ---- 2) 后端构建（将前端 dist 嵌入二进制） ----
FROM golang:1.22-alpine AS backend
ENV GOPROXY=https://goproxy.cn,https://proxy.golang.org,direct
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/frontend/dist ./frontend/dist
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /farmadopt .

# ---- 3) 运行镜像 ----
FROM alpine:3.19
RUN apk add --no-cache ca-certificates wget && \
    adduser -D -u 10001 appuser
COPY --from=backend /farmadopt /farmadopt
EXPOSE 8080
ENV HTTP_ADDR=:8080
USER appuser
ENTRYPOINT ["/farmadopt"]

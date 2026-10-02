# ---- 阶段 1：构建 React 前端 ----
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 阶段 2：构建 Go 后端 ----
FROM golang:1.19-alpine AS backend
WORKDIR /app/backend
# 先拷依赖以利用构建缓存
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
# 将前端构建产物嵌入运行目录（Go 服务通过 STATIC_DIR 托管）
COPY --from=frontend /app/frontend/dist ./web/dist
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/farm-server ./cmd/server

# ---- 阶段 3：运行镜像 ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata wget && \
    adduser -D -u 10001 app
WORKDIR /app
COPY --from=backend /out/farm-server /app/farm-server
COPY --from=backend /app/backend/web/dist /app/web/dist
ENV TZ=Asia/Shanghai
ENV STATIC_DIR=/app/web/dist
ENV PORT=:8080
USER app
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["/app/farm-server"]

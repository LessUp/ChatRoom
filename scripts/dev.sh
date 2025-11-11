#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
	echo "未检测到 Docker，请先安装后再运行该脚本。" >&2
	exit 1
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
	compose_cmd=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
	compose_cmd=(docker-compose)
else
	echo "当前 Docker 版本不支持 compose，请安装 docker compose v2+ 或 docker-compose。" >&2
	exit 1
fi

echo ">>> 启动/更新 Postgres 容器..."
"${compose_cmd[@]}" -f "$ROOT/docker-compose.yml" up -d postgres

echo ">>> 等待数据库通过健康检查..."
for _ in {1..20}; do
	if "${compose_cmd[@]}" -f "$ROOT/docker-compose.yml" exec -T postgres pg_isready -U postgres -d chatroom >/dev/null 2>&1; then
		break
	fi
	sleep 1
done

if ! command -v go >/dev/null 2>&1; then
	echo "未检测到 Go 开发环境，请安装 Go 1.21+。" >&2
	exit 1
fi

export APP_PORT="${APP_PORT:-8080}"
export APP_ENV="${APP_ENV:-dev}"

echo ">>> 启动 Go 后端 (Ctrl+C 可退出)..."
exec go run ./cmd/server

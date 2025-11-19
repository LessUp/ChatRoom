# ChatRoom

一套教学用的实时聊天室示例，后端使用 Gin + GORM + Zerolog，前端为轻量原生 JS，数据层采用 Docker 化的 Postgres。浏览器先通过 REST API 完成注册/登录，再使用 WebSocket 连接房间 Hub 进行消息广播与历史消息持久化。

## 功能特性

- 支持用户注册与登录
- JWT access token + refresh token 鉴权
- 聊天房间创建、加入与在线人数查询
- WebSocket 实时消息、加入/离开事件、typing 事件
- Postgres 持久化聊天记录
- Prometheus 指标暴露，方便教学演示监控

更详细的架构说明请参考：

- `docs/DESIGN.md`：系统设计与关键流程
- `PROJECT_ROADMAP.md`：路线图与迭代规划
- `AGENTS.md`：协作与开发约定

## 技术栈

- Go 1.21
- Gin（HTTP API 与静态资源托管）
- GORM（数据库访问）
- Zerolog（结构化日志）
- Postgres（通过 Docker Compose 运行）
- 原生 JavaScript 前端 + WebSocket

## 目录结构

- `cmd/server/`：程序入口，完成配置加载、日志初始化、数据库连接和 Router 构建
- `internal/config/`：解析环境变量，集中管理 `APP_PORT`、`DATABASE_DSN`、`JWT_SECRET` 等配置
- `internal/server/`：Gin Router 与 REST 处理器（注册/登录、房间 CRUD、消息分页等）
- `internal/auth/`：JWT 与刷新令牌逻辑，并封装 Gin 中间件
- `internal/ws/`：Hub/Client 抽象，处理房间内广播、心跳和 typing 事件
- `internal/mw/`：通用中间件（如限流）
- `internal/metrics/`：Prometheus 指标封装
- `internal/log/`：Zerolog 日志封装
- `web/`：静态页面和前端逻辑，由 Gin 的 `Static` 中间件托管
- `scripts/`：开发辅助脚本（例如一键启动开发环境）

## 快速开始

### 环境准备

- Go 1.21 或以上
- Docker 与 Docker Compose

### 方式一：脚本一键启动（推荐）

在项目根目录执行：

```bash
scripts/dev.sh
```

脚本会：

- 使用 `docker-compose.yml` 启动/复用 Postgres
- 执行健康检查
- 启动 Go 服务（`Ctrl + C` 结束）

### 方式二：手动启动

1. 启动数据库（确保当前目录为项目根目录）：

   ```bash
   docker compose up -d postgres
   ```

2. 启动后端服务：

   ```bash
   go run ./cmd/server
   ```

3. 在浏览器中访问：

   - 前端页面：`http://localhost:8080/`
   - REST API 前缀：`/api/v1`
   - WebSocket 示例：`ws://localhost:8080/ws?room_id=<id>&token=<jwt>`

### 常用环境变量

所有配置集中在 `internal/config`：

- `APP_PORT`：HTTP 监听端口（默认例如 `8080`）
- `DATABASE_DSN`：Postgres 连接串
- `JWT_SECRET`：JWT 密钥（请勿提交到仓库）
- `APP_ENV`：运行环境标识（如 `dev`、`prod`）
- `ACCESS_TOKEN_TTL_MINUTES`：访问令牌有效期（分钟）
- `REFRESH_TOKEN_TTL_DAYS`：刷新令牌有效期（天）

在开发环境中可以直接通过 shell 导出或写入本地未提交的 `.env` 文件（配合相关工具）来管理这些变量。

## 开发与测试

常用命令：

```bash
# 启动 Postgres（仅数据库）
docker compose up -d postgres

# 构建服务
go build ./cmd/server

# 运行全部测试
go test ./...

# 带 race detector 和覆盖率
go test ./... -race -cover
```

建议在修改数据库访问或 WebSocket 逻辑后，优先为对应包添加/更新 `_test.go` 并执行 `go test ./...`。

## 后续扩展

关于消息富文本、房间权限控制、水平扩展和 WebSocket 自动化测试等进一步改进方向，请参考 `docs/DESIGN.md` 中的“后续扩展建议”部分。

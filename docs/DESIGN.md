# ChatRoom 设计文档

## 系统概览
本项目是一套教学用的实时聊天室，后端使用 Gin + GORM + Zerolog，前端为轻量原生 JS，数据层采用 Docker 化的 Postgres。整体拓扑为：浏览器先通过 REST API 完成注册/登录，再以 `ws://host/ws?room_id=xx&token=yy` 方式建立 WebSocket，后端在 `internal/ws` 中维护房间级 Hub 实时转发消息，并将历史消息持久化到数据库。

## 模块拆分
- `cmd/server`: 程序入口，按顺序完成配置加载、日志初始化、数据库连接和 Router 构建。
- `internal/config`: 环境变量解析，集中定义 `APP_PORT`、`DATABASE_DSN`、`JWT_SECRET` 等参数。
- `internal/server`: Gin Router 与 REST handler，涵盖注册/登录、房间 CRUD、消息分页等教学示例。
- `internal/auth`: JWT + 刷新令牌逻辑，并封装 Gin 中间件。
- `internal/ws`: Hub/Client 抽象，负责房间内的广播、心跳以及 typing 事件。
- `internal/mw`、`internal/metrics`、`internal/log`: 封装限流、Prometheus 指标和 Zerolog。
- `web/`: 静态页面和前端逻辑，直接由 Gin 的 `Static` 中间件托管。

## 关键流程
### 鉴权
1. `/api/v1/auth/register` 写入 `models.User`。
2. `/api/v1/auth/login` 校验密码，签发 `access_token`（JWT）和随机生成的 `refresh_token`。
3. 前端在发起 REST 请求时使用 `Authorization: Bearer <token>`，建立 WS 时通过 `Authorization` 头或 `token` 查询参数携带。
4. `/api/v1/auth/refresh` 校验旧刷新令牌、撤销后颁发新对。

### WebSocket 广播
1. `ws.Serve` 校验房间+用户，创建 `Client` 后加入对应 `RoomHub`。
2. `Client.readPump` 将消息写入 `models.Message`，并把序列化后的结构体推送到房间的 `broadcast` 通道。
3. `RoomHub.run` 统一 fan-out 给所有客户端，同时发送 join/leave/typing 事件，并更新 `metrics.WsConnections`。
4. REST 侧通过 `hub.Online(roomID)` 即时读取在线人数，便于课堂展示。

## 数据模型
| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| `users` | `username`, `password_hash` | 账户信息，用户名唯一。 |
| `rooms` | `name`, `owner_id` | 房间基本信息，当前按创建顺序分页展示。 |
| `messages` | `room_id`, `user_id`, `content`, `created_at` | 永久存储聊天记录，REST 可分页查询。 |
| `refresh_tokens` | `token`, `expires_at`, `revoked_at` | 双 token 体系，支持一人多端。 |

## 启动与运维
开发者可直接运行脚本：

```bash
scripts/dev.sh
```

脚本会启动/复用 `docker-compose.yml` 中的 Postgres 并执行健康检查，然后启动 Go 服务（Ctrl+C 结束）。若需要自定义端口或 DSN，可在脚本前设置 `APP_PORT`、`DATABASE_DSN` 等变量。Prometheus 指标挂载在 `/metrics`，默认可供 `docker run prom/prometheus` 等外部实例拉取。

## 后续扩展建议
1. **消息富文本**：可以在 `models.Message` 增加 `metadata JSONB` 字段，前端支持贴图/代码片段。
2. **房间权限**：在 `rooms` 表新增 `visibility` 字段，结合中间件控制公开/私密房间。
3. **水平扩展**：当前 Hub 仅在单进程内共享，生产环境可结合 Redis Stream 或 NATS 做跨实例广播。
4. **自动化测试**：为 `internal/ws` 添加基于 `net/http/httptest` 的集成测试，演示如何对 WebSocket 进行 TDD。 

# 2026-02-13 代码优化与重构

## 后端

### Handler 提取（职责分离）
- 将 `internal/server/router.go` 中的内联 handler 逻辑提取到 `internal/server/handler.go`
- 新增 `Handler` 结构体，注入 `UserService`、`RoomService`、`MessageService`
- `router.go` 仅保留路由注册与中间件配置，代码行数从 282 行减至 144 行

### WebSocket writePump 批量写入
- `internal/ws/conn.go` 的 `writePump` 新增批量排空逻辑
- 每次写入循环会将 send channel 中积压的消息一并发送，减少系统调用次数

### Rate Limiter GC goroutine 泄漏修复
- `internal/mw/ratelimit.go` 中 GC goroutine 原先使用 `time.Sleep` 无限循环，无法停止
- 改为 `time.Ticker` + `stop` channel 模式，新增 `Stop()` 方法支持优雅停服

## 前端

### Textarea 自动高度
- `frontend/src/components/MessageInput.tsx` 新增 `autoResize` 逻辑
- 输入多行文本时 textarea 自动增高（最大 120px），发送后自动复位

### 消息去重
- `frontend/src/App.tsx` WebSocket `message` 事件处理增加 id 去重判断
- 防止加入房间加载历史消息与 WebSocket 实时推送之间的消息重复

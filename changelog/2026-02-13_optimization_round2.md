# 2026-02-13 第二轮优化

## 后端

### CORS 中间件
- 新增 `internal/mw/cors.go`，dev 环境允许所有来源，生产环境仅允许同源
- 在 `router.go` 中于 Recovery 之后、metrics 之前注册，确保 OPTIONS 预检请求被正确处理

### Message 查询索引优化
- `internal/models/models.go` 中 Message.RoomID 使用命名索引 `idx_msg_room_id`
- 优化 `ListByRoom` 查询 `WHERE room_id=? ORDER BY id DESC` 的执行效率

### 房间重名检查
- `internal/service/room.go` Create 方法新增重名检查，返回 `ErrRoomNameTaken`
- `internal/service/errors.go` 新增 `ErrRoomNameTaken` 错误定义
- `internal/server/handler.go` CreateRoom 处理 409 Conflict 响应

### 代码风格
- `internal/ws/conn.go` import 分组按 stdlib / internal / third-party 规范整理

## 前端

### 消息列表滚动优化
- `frontend/src/components/MessageList.tsx` 重写滚动逻辑
- 加载旧消息时保持当前视口位置（不再跳到底部）
- 新消息到达时仅在用户位于底部附近才自动滚动

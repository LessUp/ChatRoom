# React 前端迁移与后端安全加固

**日期**: 2025-12-15  

## 概述

本次变更以“个人演示 + Go 1.24 + 允许安全校验 + 迁移到 React 前端”为目标，逐步将现有 `web/` 原生前端迁移到 `frontend/`（React + TypeScript + Vite），并同步对后端做基础安全与健壮性修复。

## 变更项

### 后端（Go）

- 配置解析与启动校验：增强 TTL 解析兜底，并在启动时进行基础配置校验。
- API 健壮性：补齐关键路径错误处理与输入校验（注册/登录/刷新令牌/创建房间等）。
- WebSocket 安全：生产环境按 Origin 做更严格校验（开发环境保持宽松以便演示）。
- 静态资源：优先托管 React 构建产物（如存在），否则回退到 `web/`。

### 前端（React）

- 初始化 React 应用结构，逐步实现登录/注册/房间列表/聊天（WS + 历史分页 + typing）。
- 本地开发体验：配置 Vite 代理，避免额外 CORS 配置。
- 完成主界面 `App`：认证后进入房间列表 + 创建房间 + 加载历史消息（滚动到顶部自动分页）+ WebSocket 实时消息 + typing 指示 + 在线人数/连接状态展示。
- 修复前端 TypeScript 构建错误：移除对 `JSX` 命名空间的显式类型依赖（改用类型推导），并补充 React 类型声明。

## 文件变更

- `internal/config/config.go`
- `cmd/server/main.go`

### 后端（Go）追加

- `internal/server/router.go`
- `internal/ws/conn.go`

### 前端（React）追加

- `frontend/tsconfig.app.json`
- `frontend/src/App.tsx`
- `frontend/src/screens/AuthScreen.tsx`
- `frontend/src/toast.tsx`

### 测试（Go）追加

- `internal/auth/auth_test.go`
- `internal/ws/hub_test.go`
- `internal/server/router_test.go`

## 最小回归

- `go test ./...`

> 后续变更会在此文件持续补充。

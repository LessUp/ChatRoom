# ChatRoom

[![CI](https://github.com/your-username/chatroom/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/chatroom/actions/workflows/ci.yml)
[![Go Report Card](https://goreportcard.com/badge/github.com/your-username/chatroom)](https://goreportcard.com/report/github.com/your-username/chatroom)
[![codecov](https://codecov.io/gh/your-username/chatroom/branch/main/graph/badge.svg)](https://codecov.io/gh/your-username/chatroom)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Go Version](https://img.shields.io/badge/Go-1.24-blue.svg)](https://golang.org/)

一套实时聊天室应用，后端使用 Go (Gin + GORM + WebSocket)，前端使用 React + TypeScript，数据层采用 PostgreSQL。

## ✨ 功能特性

- 🔐 用户注册与登录（JWT + Refresh Token）
- 💬 实时聊天消息（WebSocket）
- 🏠 多房间支持
- 👥 在线用户显示
- ⌨️ 正在输入提示
- 📜 历史消息分页加载
- 📊 Prometheus 指标监控
- 🐳 Docker 一键部署

## 🛠 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Go 1.24, Gin, GORM, gorilla/websocket |
| 前端 | React 19, TypeScript, Vite |
| 数据库 | PostgreSQL 16 |
| 日志 | Zerolog |
| 监控 | Prometheus, Grafana |
| 容器 | Docker, Kubernetes |

## 🚀 快速开始

### 前置要求

- Go 1.24+
- Node.js 20+
- Docker & Docker Compose

### 方式一：Docker Compose（推荐）

```bash
# 克隆仓库
git clone https://github.com/your-username/chatroom.git
cd chatroom

# 启动所有服务
docker compose up -d

# 访问应用
open http://localhost:8080
```

### 方式二：本地开发

```bash
# 启动数据库
docker compose up -d postgres

# 启动后端
go run ./cmd/server

# 启动前端（另一个终端）
cd frontend && npm install && npm run dev
```

### 方式三：开发脚本

```bash
./scripts/dev.sh
```

## 📁 项目结构

```
chatroom/
├── cmd/server/          # 程序入口
├── internal/
│   ├── auth/            # JWT 认证
│   ├── config/          # 配置管理
│   ├── db/              # 数据库连接
│   ├── models/          # 数据模型
│   ├── mw/              # HTTP 中间件
│   ├── server/          # HTTP 路由
│   ├── ws/              # WebSocket 处理
│   ├── metrics/         # Prometheus 指标
│   └── log/             # 日志配置
├── frontend/            # React 前端
├── web/                 # 静态前端（备用）
├── deploy/
│   ├── docker/          # Dockerfile
│   └── k8s/             # Kubernetes 清单
├── docs/                # 文档
└── scripts/             # 开发脚本
```

## 🔧 配置

通过环境变量配置，参考 [.env.example](.env.example)：

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `APP_PORT` | 8080 | HTTP 端口 |
| `APP_ENV` | dev | 环境：dev/test/prod |
| `DATABASE_DSN` | - | PostgreSQL 连接串 |
| `JWT_SECRET` | - | JWT 签名密钥 |
| `ACCESS_TOKEN_TTL_MINUTES` | 15 | 访问令牌有效期 |
| `REFRESH_TOKEN_TTL_DAYS` | 7 | 刷新令牌有效期 |

## 📖 文档

- [API 文档](docs/API.md)
- [架构设计](docs/ARCHITECTURE.md)
- [系统设计](docs/DESIGN.md)
- [监控指南](docs/monitoring/README.md)

## 🧪 开发

```bash
# 安装开发工具
make tools

# 运行测试
make test

# 代码检查
make lint

# 格式化代码
make fmt

# 构建
make build
```

## 🐳 Docker

```bash
# 构建镜像
make docker-build

# 运行完整栈
docker compose up -d

# 包含监控
docker compose --profile monitoring up -d
```

## ☸️ Kubernetes

```bash
# 部署到 Kubernetes
kubectl apply -f deploy/k8s/
```

## 🤝 贡献

欢迎贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解如何参与。

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 🔗 相关链接

- [项目路线图](PROJECT_ROADMAP.md)
- [变更日志](CHANGELOG.md)
- [安全策略](SECURITY.md)

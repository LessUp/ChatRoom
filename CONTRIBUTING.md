# Contributing to ChatRoom

感谢你对 ChatRoom 项目的关注！我们欢迎各种形式的贡献。

## 行为准则

参与本项目即表示你同意遵守我们的 [行为准则](CODE_OF_CONDUCT.md)。

## 如何贡献

### 报告 Bug

1. 在 [Issues](../../issues) 中搜索是否已有相同问题
2. 如果没有，创建新 Issue 并使用 Bug Report 模板
3. 提供详细的复现步骤、环境信息和错误日志

### 提出新功能

1. 在 [Issues](../../issues) 中搜索是否已有相同建议
2. 如果没有，创建新 Issue 并使用 Feature Request 模板
3. 描述功能的使用场景和预期行为

### 提交代码

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m 'Add some feature'`
4. 推送分支：`git push origin feature/your-feature`
5. 创建 Pull Request

## 开发环境设置

### 前置要求

- Go 1.24+
- Node.js 20+
- Docker & Docker Compose
- Make

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/your-username/chatroom.git
cd chatroom

# 启动数据库
docker compose up -d postgres

# 运行后端
go run ./cmd/server

# 运行前端（另一个终端）
cd frontend && npm install && npm run dev
```

### 常用命令

```bash
make build      # 构建项目
make test       # 运行测试
make lint       # 代码检查
make fmt        # 格式化代码
make docker     # 构建 Docker 镜像
```

## 代码风格

### Go 代码

- 使用 `gofmt` 格式化代码
- 遵循 [Effective Go](https://golang.org/doc/effective_go) 指南
- 使用 `golangci-lint` 进行静态检查
- 导出标识符使用 `CamelCase`，内部标识符使用 `camelCase`
- JSON 标签使用 `snake_case`

### TypeScript/React 代码

- 使用 ESLint 和 Prettier 格式化
- 组件使用函数式组件和 Hooks
- 文件名使用 `kebab-case`

### 提交信息

- 使用祈使句，首字母大写
- 主题行不超过 50 字符
- 可选的详细说明用空行分隔
- 引用相关 Issue：`Refs #123` 或 `Fixes #123`

示例：
```
Add user authentication middleware

- Implement JWT validation
- Add refresh token rotation
- Update API documentation

Refs #42
```

## Pull Request 流程

1. 确保所有测试通过：`make test`
2. 确保代码检查通过：`make lint`
3. 更新相关文档
4. 填写 PR 模板中的所有必要信息
5. 等待代码审查

### PR 检查清单

- [ ] 代码遵循项目风格指南
- [ ] 添加了必要的测试
- [ ] 所有测试通过
- [ ] 更新了相关文档
- [ ] 提交信息清晰明了

## 测试指南

### 运行测试

```bash
# 运行所有测试
make test

# 运行带覆盖率的测试
go test -race -cover ./...

# 运行特定包的测试
go test ./internal/auth/...
```

### 编写测试

- 使用表驱动测试
- 测试文件命名：`*_test.go`
- 测试函数命名：`Test<Function>_<Scenario>_<Expected>`
- 使用接口模拟依赖

## 发布流程

版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

- `MAJOR`：不兼容的 API 变更
- `MINOR`：向后兼容的功能新增
- `PATCH`：向后兼容的问题修复

## 获取帮助

- 查看 [文档](docs/)
- 在 [Discussions](../../discussions) 中提问
- 查看 [FAQ](docs/FAQ.md)

再次感谢你的贡献！🎉

# Implementation Plan: Open Source Excellence

## Overview

本实现计划将 ChatRoom 项目从教学 Demo 提升为符合开源社区标准的优秀项目。任务按优先级和依赖关系排序，从基础文件开始，逐步完善 CI/CD、测试、容器化等方面。

## Tasks

- [x] 1. 创建开源标准文件
  - [x] 1.1 创建 LICENSE 文件（MIT 许可证）
    - 使用 MIT 许可证模板
    - 填入正确的年份和版权持有者
    - _Requirements: 1.1_

  - [x] 1.2 创建 CONTRIBUTING.md 贡献指南
    - 包含开发环境设置说明
    - 包含代码风格要求
    - 包含 PR 提交流程
    - 包含 Issue 报告指南
    - _Requirements: 1.2_

  - [x] 1.3 创建 CODE_OF_CONDUCT.md 行为准则
    - 采用 Contributor Covenant 2.1 版本
    - _Requirements: 1.3_

  - [x] 1.4 创建 SECURITY.md 安全策略
    - 包含漏洞报告流程
    - 包含支持的版本信息
    - _Requirements: 1.4_

  - [x] 1.5 创建 CHANGELOG.md 变更日志
    - 采用 Keep a Changelog 格式
    - 初始化 v0.1.0 版本记录
    - _Requirements: 1.5, 7.3_

- [x] 2. 创建 GitHub 模板文件
  - [x] 2.1 创建 Issue 模板
    - 创建 .github/ISSUE_TEMPLATE/bug_report.md
    - 创建 .github/ISSUE_TEMPLATE/feature_request.md
    - _Requirements: 1.6_

  - [x] 2.2 创建 Pull Request 模板
    - 创建 .github/PULL_REQUEST_TEMPLATE.md
    - 包含变更描述、测试说明、检查清单
    - _Requirements: 1.6_

- [x] 3. 配置代码质量工具
  - [x] 3.1 创建 .golangci.yml 配置文件
    - 启用 errcheck、gosimple、govet、staticcheck、gosec 等 linter
    - 配置合理的排除规则
    - _Requirements: 3.1_

  - [x] 3.2 创建 .editorconfig 文件
    - 配置缩进、换行符、字符集等
    - _Requirements: 3.4_

  - [x] 3.3 创建 Makefile
    - 添加 build、test、lint、fmt 等常用目标
    - 添加 docker-build、docker-run 目标
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.4 编写属性测试验证代码格式化一致性
    - **Property 1: Code Formatting Consistency**
    - **Validates: Requirements 3.3**

- [x] 4. Checkpoint - 基础配置完成
  - 确保所有标准文件已创建
  - 运行 `make lint` 验证配置正确
  - 如有问题请告知

- [x] 5. 配置 CI/CD 流水线
  - [x] 5.1 创建主 CI 工作流
    - 创建 .github/workflows/ci.yml
    - 配置 lint、test、build 任务
    - 配置 PostgreSQL 服务容器
    - 配置覆盖率上报
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.2 创建发布工作流
    - 创建 .github/workflows/release.yml
    - 配置多平台二进制构建
    - 配置 Docker 镜像构建和推送
    - 配置自动生成 Release Notes
    - _Requirements: 5.4, 5.5, 7.4, 7.5_

  - [x] 5.3 创建安全扫描工作流
    - 创建 .github/workflows/security.yml
    - 配置 gosec 和 trivy 扫描
    - _Requirements: 9.3_

  - [x] 5.4 创建 dependabot.yml 配置
    - 配置 Go 和 npm 依赖自动更新
    - _Requirements: 9.3_

- [x] 6. 完善容器化配置
  - [x] 6.1 创建多阶段 Dockerfile
    - 创建 deploy/docker/Dockerfile
    - 使用 golang:1.24-alpine 构建
    - 使用 alpine:3.19 运行
    - 优化镜像大小
    - _Requirements: 6.1_

  - [x] 6.2 更新 docker-compose.yml
    - 添加应用服务定义
    - 配置健康检查
    - 配置环境变量
    - _Requirements: 6.2_

  - [x] 6.3 创建 .env.example 文件
    - 列出所有环境变量及说明
    - _Requirements: 6.3_

  - [x] 6.4 创建 Kubernetes 部署清单
    - 创建 deploy/k8s/deployment.yaml
    - 创建 deploy/k8s/service.yaml
    - 创建 deploy/k8s/configmap.yaml
    - _Requirements: 6.4_

- [x] 7. Checkpoint - CI/CD 和容器化完成
  - 验证 CI 工作流语法正确
  - 验证 Dockerfile 可以成功构建
  - 如有问题请告知

- [x] 8. 实现健康检查端点
  - [x] 8.1 添加健康检查路由和处理器
    - 在 internal/server/router.go 添加 /health 和 /ready 端点
    - /health 返回简单存活状态
    - /ready 检查数据库连接状态
    - _Requirements: 6.5, 10.4_

  - [x] 8.2 编写健康端点属性测试
    - **Property 4: Health Endpoint Correctness**
    - **Validates: Requirements 6.5, 10.4**

  - [x] 8.3 添加版本信息端点
    - 添加 /version 端点返回构建信息
    - 通过 ldflags 注入版本号
    - _Requirements: 7.1_

- [x] 9. 增强安全配置
  - [x] 9.1 添加生产环境 JWT 密钥验证
    - 在 internal/config/config.go 添加验证逻辑
    - 生产环境使用默认密钥时拒绝启动
    - _Requirements: 9.5_

  - [x] 9.2 编写 JWT 密钥验证属性测试
    - **Property 6: Production JWT Secret Validation**
    - **Validates: Requirements 9.5**

- [x] 10. 完善项目文档
  - [x] 10.1 更新 README.md
    - 添加项目徽章（CI、覆盖率、许可证）
    - 优化功能特性描述
    - 添加快速开始示例
    - _Requirements: 2.1, 2.2_

  - [x] 10.2 创建 API 文档
    - 创建 docs/API.md
    - 记录所有 REST API 端点
    - 包含请求/响应示例
    - _Requirements: 2.3, 2.5_

  - [x] 10.3 创建架构文档
    - 创建 docs/ARCHITECTURE.md
    - 包含系统架构图
    - 包含组件交互说明
    - _Requirements: 2.4_

  - [x] 10.4 创建监控文档和 Grafana 仪表盘
    - 创建 docs/monitoring/README.md
    - 创建 docs/monitoring/grafana-dashboard.json
    - _Requirements: 10.3_

- [x] 11. 补充测试覆盖
  - [x] 11.1 补充 auth 包单元测试
    - 测试密码哈希和验证
    - 测试 JWT 生成和解析
    - 测试刷新令牌生命周期
    - _Requirements: 4.1, 4.2_

  - [x] 11.2 补充 HTTP API 集成测试
    - 测试注册/登录流程
    - 测试房间 CRUD 操作
    - 测试消息分页查询
    - _Requirements: 4.3_

  - [x] 11.3 补充 WebSocket 集成测试
    - 测试连接建立和鉴权
    - 测试消息广播
    - 测试 join/leave 事件
    - _Requirements: 4.4_

  - [x] 11.4 编写导出函数测试覆盖属性测试
    - **Property 3: Test Coverage for Exported Functions**
    - **Validates: Requirements 4.2**

- [x] 12. 前端工程化完善
  - [x] 12.1 添加 Prettier 配置
    - 创建 frontend/.prettierrc
    - 更新 package.json scripts
    - _Requirements: 8.2_

  - [x] 12.2 配置前端测试框架
    - 安装 Vitest 和 React Testing Library
    - 创建测试配置文件
    - _Requirements: 8.4_

  - [x] 12.3 添加前端工具函数测试
    - 为 api.ts、storage.ts 添加单元测试
    - _Requirements: 8.4_

- [x] 13. Final Checkpoint - 项目完善完成
  - 运行完整测试套件 `make test`
  - 验证 CI 流水线配置
  - 验证文档完整性
  - 如有问题请告知

## Notes

- 所有任务都是必须完成的，包括属性测试
- 每个任务都引用了具体的需求编号以便追溯
- Checkpoint 任务用于阶段性验证，确保增量进展
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况

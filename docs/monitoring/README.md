# ChatRoom 监控指南

本文档介绍如何使用 Prometheus 和 Grafana 监控 ChatRoom 应用。

## 快速开始

### 启动监控服务

```bash
# 启动完整监控栈
docker compose --profile monitoring up -d
```

### 访问地址

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)
- **应用指标**: http://localhost:8080/metrics

## 可用指标

### HTTP 指标

| 指标名称 | 类型 | 描述 |
|---------|------|------|
| `http_requests_total` | Counter | HTTP 请求总数 |
| `http_request_duration_seconds` | Histogram | HTTP 请求延迟 |
| `http_requests_in_flight` | Gauge | 当前处理中的请求数 |

### WebSocket 指标

| 指标名称 | 类型 | 描述 |
|---------|------|------|
| `ws_connections_total` | Counter | WebSocket 连接总数 |
| `ws_connections_current` | Gauge | 当前活跃连接数 |
| `ws_messages_total` | Counter | WebSocket 消息总数 |

### 业务指标

| 指标名称 | 类型 | 描述 |
|---------|------|------|
| `chatroom_users_total` | Counter | 注册用户总数 |
| `chatroom_rooms_total` | Counter | 房间总数 |
| `chatroom_messages_total` | Counter | 消息总数 |

## Grafana 仪表盘

### 导入仪表盘

1. 登录 Grafana (http://localhost:3000)
2. 进入 Dashboards > Import
3. 上传 `grafana-dashboard.json` 文件
4. 选择 Prometheus 数据源
5. 点击 Import

### 仪表盘面板

- **概览**: 请求量、错误率、延迟 P99
- **WebSocket**: 连接数、消息吞吐量
- **系统**: CPU、内存、Goroutine 数量

## 告警规则

### 示例告警规则

```yaml
groups:
  - name: chatroom
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"

      - alert: HighLatency
        expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected"

      - alert: TooManyConnections
        expr: ws_connections_current > 1000
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Too many WebSocket connections"
```

## 常用 PromQL 查询

### 请求速率

```promql
rate(http_requests_total[5m])
```

### 错误率

```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
```

### P99 延迟

```promql
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

### WebSocket 连接数

```promql
ws_connections_current
```

## 故障排查

### 指标端点无响应

1. 检查应用是否运行: `curl http://localhost:8080/health`
2. 检查指标端点: `curl http://localhost:8080/metrics`
3. 检查 Prometheus 目标状态: http://localhost:9090/targets

### Grafana 无数据

1. 确认 Prometheus 数据源配置正确
2. 检查时间范围是否正确
3. 验证 PromQL 查询语法

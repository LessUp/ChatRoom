# ChatRoom API 文档

## 概述

ChatRoom 提供 RESTful API 和 WebSocket 接口用于实时聊天功能。

- **Base URL**: `http://localhost:8080`
- **API 前缀**: `/api/v1`
- **认证方式**: Bearer Token (JWT)

## 认证

### 注册

创建新用户账户。

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

**请求参数**

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| username | string | 是 | 用户名，2-64 字符 |
| password | string | 是 | 密码，4-128 字符 |

**响应示例**

```json
{
  "id": 1,
  "username": "alice"
}
```

**错误响应**

| 状态码 | 描述 |
|--------|------|
| 400 | 无效的请求参数 |
| 409 | 用户名已存在 |

---

### 登录

用户登录获取访问令牌。

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

**响应示例**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "a1b2c3d4e5f6...",
  "user": {
    "id": 1,
    "username": "alice"
  }
}
```

**错误响应**

| 状态码 | 描述 |
|--------|------|
| 400 | 无效的请求参数 |
| 401 | 用户名或密码错误 |

---

### 刷新令牌

使用刷新令牌获取新的访问令牌。

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "string"
}
```

**响应示例**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "x1y2z3..."
}
```

**错误响应**

| 状态码 | 描述 |
|--------|------|
| 400 | 无效的请求参数 |
| 401 | 刷新令牌无效或已过期 |

---

## 房间

### 创建房间

创建新的聊天房间。

```http
POST /api/v1/rooms
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "string"
}
```

**请求参数**

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| name | string | 是 | 房间名称，最大 128 字符 |

**响应示例**

```json
{
  "id": 1,
  "name": "General",
  "room": {
    "id": 1,
    "name": "General"
  }
}
```

---

### 获取房间列表

获取所有聊天房间。

```http
GET /api/v1/rooms
Authorization: Bearer <access_token>
```

**响应示例**

```json
{
  "rooms": [
    {
      "id": 1,
      "name": "General",
      "online": 5
    },
    {
      "id": 2,
      "name": "Random",
      "online": 2
    }
  ]
}
```

---

### 获取房间消息

获取指定房间的历史消息。

```http
GET /api/v1/rooms/:id/messages
Authorization: Bearer <access_token>
```

**查询参数**

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| limit | int | 50 | 返回消息数量，最大 200 |
| before_id | int | - | 获取此 ID 之前的消息（分页） |

**响应示例**

```json
{
  "messages": [
    {
      "type": "message",
      "id": 1,
      "room_id": 1,
      "user_id": 1,
      "username": "alice",
      "content": "Hello, world!",
      "created_at": "2025-01-08T10:00:00Z"
    }
  ]
}
```

---

## WebSocket

### 连接

建立 WebSocket 连接加入聊天房间。

```
ws://localhost:8080/ws?room_id=<room_id>&token=<access_token>
```

或使用 Authorization 头：

```
ws://localhost:8080/ws?room_id=<room_id>
Authorization: Bearer <access_token>
```

### 消息格式

所有 WebSocket 消息使用 JSON 格式。

#### 发送消息

```json
{
  "type": "message",
  "content": "Hello, everyone!"
}
```

#### 接收消息

```json
{
  "type": "message",
  "id": 123,
  "room_id": 1,
  "user_id": 1,
  "username": "alice",
  "content": "Hello, everyone!",
  "created_at": "2025-01-08T10:00:00Z"
}
```

#### 用户加入

```json
{
  "type": "join",
  "user_id": 2,
  "username": "bob"
}
```

#### 用户离开

```json
{
  "type": "leave",
  "user_id": 2,
  "username": "bob"
}
```

#### 正在输入

发送：
```json
{
  "type": "typing"
}
```

接收：
```json
{
  "type": "typing",
  "user_id": 1,
  "username": "alice"
}
```

---

## 健康检查

### 存活检查

```http
GET /health
```

**响应示例**

```json
{
  "status": "ok",
  "timestamp": "2025-01-08T10:00:00Z"
}
```

### 就绪检查

```http
GET /ready
```

**响应示例**

```json
{
  "status": "ready",
  "checks": {
    "database": "healthy"
  }
}
```

### 版本信息

```http
GET /version
```

**响应示例**

```json
{
  "version": "v1.0.0",
  "git_commit": "abc1234",
  "build_time": "2025-01-08T10:00:00Z",
  "go_version": "go1.24"
}
```

---

## 指标

```http
GET /metrics
```

返回 Prometheus 格式的指标数据。

---

## 错误响应格式

所有错误响应使用统一格式：

```json
{
  "error": "error message"
}
```

## 状态码说明

| 状态码 | 描述 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未认证或认证失败 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 资源冲突 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

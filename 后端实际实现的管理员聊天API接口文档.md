# 后端实际实现的管理员聊天API接口文档

**后端项目**: 餐厅积分抽奖系统 v2.0  
**实施时间**: 2025年08月12日  
**接口版本**: v2.0  
**技术栈**: Node.js + Express + Sequelize + WebSocket  

---

## 🔧 **后端已实现的API端点**

### 1. **管理员聊天会话列表API**

```http
GET /api/v2/admin/chat/sessions
```

**请求头**：
```
Authorization: Bearer {admin_token}
Content-Type: application/json
```

**查询参数**：
- `status` (可选): 会话状态筛选
  - `all`: 全部会话 (默认)
  - `pending`: 等待分配的会话
  - `active`: 当前管理员的活跃会话
  - `waiting`: 等待中的会话
  - `closed`: 已关闭的会话
- `page` (可选): 页码，默认1
- `pageSize` (可选): 每页数量，默认10

**响应格式**：
```json
{
  "code": 0,
  "msg": "管理员会话列表获取成功",
  "data": {
    "sessions": [
      {
        "sessionId": "session_1754985854512_4d116f10",
        "userId": 31,
        "userInfo": {
          "userId": 31,
          "nickname": "管理员用户",
          "avatar": null,
          "mobile": "13612227930"
        },
        "adminId": 31,
        "status": "active",
        "createdAt": "2025-08-12T16:17:34.000Z",
        "lastMessageTime": "2025-08-12T17:00:12.000Z",
        "lastMessage": {
          "content": "[最终测试] 管理员您好！这是用户界面发送的消息，请确认是否能在管理员界面收到 - 8/12/2025, 5:05:25 PM",
          "messageType": "text",
          "senderId": 31,
          "senderType": "user",
          "createdAt": "2025-08-12T17:05:25.000Z"
        },
        "messageCount": 4,
        "unreadCount": 4,
        "isOnline": true
      }
    ],
    "totalCount": 1,
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "hasMore": false
    }
  },
  "timestamp": "2025-08-12T18:13:49.572Z"
}
```

### 2. **管理员聊天消息历史API**

```http
GET /api/v2/admin/chat/sessions/{sessionId}/messages
```

**路径参数**：
- `sessionId`: 会话ID

**查询参数**：
- `page` (可选): 页码，默认1
- `pageSize` (可选): 每页数量，默认20

**响应格式**：
```json
{
  "code": 0,
  "msg": "消息历史获取成功",
  "data": {
    "messages": [
      {
        "messageId": "final_test_1755018325458",
        "sessionId": "session_1754985854512_4d116f10",
        "senderId": 31,
        "senderType": "user",
        "content": "[最终测试] 管理员您好！这是用户界面发送的消息，请确认是否能在管理员界面收到 - 8/12/2025, 5:05:25 PM",
        "messageType": "text",
        "status": "sent",
        "createdAt": "2025-08-12T17:05:25.000Z",
        "attachments": [],
        "sender": {
          "userId": 31,
          "nickname": "管理员用户",
          "avatar": null
        }
      }
    ],
    "totalCount": 4,
    "pagination": {
      "currentPage": 1,
      "pageSize": 20,
      "totalPages": 1,
      "hasMore": false
    }
  },
  "timestamp": "2025-08-12T18:14:01.901Z"
}
```

### 3. **管理员发送消息API**

```http
POST /api/v2/admin/chat/sessions/{sessionId}/messages
```

**路径参数**：
- `sessionId`: 会话ID

**请求体**：
```json
{
  "content": "管理员回复内容",
  "messageType": "text"
}
```

**响应格式**：
```json
{
  "code": 0,
  "msg": "消息发送成功",
  "data": {
    "messageId": "msg_1755022855478_a1b2c3d4",
    "status": "sent",
    "timestamp": "2025-08-12T18:20:55.478Z"
  },
  "timestamp": "2025-08-12T18:20:55.478Z"
}
```

### 4. **管理员今日统计API**

```http
GET /api/v2/admin/chat/stats/today
```

**响应格式**：
```json
{
  "code": 0,
  "msg": "今日统计获取成功",
  "data": {
    "stats": {
      "totalSessions": 1,
      "completedSessions": 0,
      "activeSessions": 1,
      "waitingSessions": 0,
      "todayMessages": 4,
      "avgResponseTime": "2分钟",
      "customerSatisfaction": 4.8,
      "responseRate": 0
    },
    "date": "2025-08-12",
    "adminId": 31
  },
  "timestamp": "2025-08-12T18:14:15.228Z"
}
```

---

## 🔌 **WebSocket实时通信**

### **连接地址**
```
ws://your-domain:3000/ws?token={admin_token}
```

### **管理员端接收的WebSocket消息类型**

#### **1. 新用户消息通知**
```json
{
  "type": "new_message",
  "data": {
    "sessionId": "session_abc123",
    "messageId": "msg_abc123",
    "senderId": 31,
    "senderType": "user",
    "content": "用户消息内容",
    "messageType": "text",
    "tempMessageId": "temp_123",
    "createdAt": "2025-08-12T18:30:00.000Z",
    "sender": {
      "userId": 31,
      "nickname": "用户昵称",
      "isAdmin": false
    }
  },
  "timestamp": "2025-08-12T18:30:00.000Z",
  "messageId": "msg_1755023800000_xyz789"
}
```

#### **2. 新会话通知**
```json
{
  "type": "new_session",
  "data": {
    "sessionId": "session_abc123",
    "userId": 31,
    "userInfo": {
      "userId": 31,
      "nickname": "用户昵称",
      "avatar": "头像URL",
      "mobile": "13612227930"
    },
    "priority": 1,
    "source": "mobile",
    "createdAt": "2025-08-12T18:30:00.000Z"
  },
  "timestamp": "2025-08-12T18:30:00.000Z",
  "messageId": "msg_1755023800000_abc123"
}
```

#### **3. 用户输入状态**
```json
{
  "type": "user_typing",
  "data": {
    "sessionId": "session_abc123",
    "userId": 31,
    "typing": true,
    "senderType": "user",
    "timestamp": "2025-08-12T18:30:00.000Z"
  },
  "timestamp": "2025-08-12T18:30:00.000Z",
  "messageId": "msg_1755023800000_typing"
}
```

#### **4. 会话状态变更**
```json
{
  "type": "session_status",
  "data": {
    "sessionId": "session_abc123",
    "status": "active",
    "oldStatus": "waiting",
    "adminInfo": {
      "adminId": 31,
      "name": "管理员用户",
      "avatar": null
    }
  },
  "timestamp": "2025-08-12T18:30:00.000Z",
  "messageId": "msg_1755023800000_status"
}
```

### **管理员端发送的WebSocket消息类型**

#### **1. 发送聊天消息**
```json
{
  "type": "chat_message",
  "data": {
    "sessionId": "session_abc123",
    "content": "管理员回复内容",
    "messageType": "text",
    "tempMessageId": "temp_admin_123"
  }
}
```

#### **2. 输入状态通知**
```json
{
  "type": "typing_start",
  "data": {
    "sessionId": "session_abc123"
  }
}
```

```json
{
  "type": "typing_stop",
  "data": {
    "sessionId": "session_abc123"
  }
}
```

#### **3. 标记消息已读**
```json
{
  "type": "mark_read",
  "data": {
    "sessionId": "session_abc123",
    "allMessages": true
  }
}
```

---

## 🗄️ **数据库表结构**

### **聊天会话表 `customer_sessions`**
```sql
CREATE TABLE customer_sessions (
  session_id VARCHAR(100) PRIMARY KEY,
  user_id INT NOT NULL,
  admin_id INT NULL,
  status ENUM('waiting', 'assigned', 'active', 'closed') DEFAULT 'waiting',
  source VARCHAR(50) DEFAULT 'mobile',
  priority INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_message_at TIMESTAMP NULL,
  closed_at TIMESTAMP NULL,
  satisfaction_score DECIMAL(3,2) NULL,
  
  INDEX idx_user_id (user_id),
  INDEX idx_admin_id (admin_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);
```

### **聊天消息表 `chat_messages`**
```sql
CREATE TABLE chat_messages (
  message_id VARCHAR(100) PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  sender_id INT NOT NULL,
  sender_type ENUM('user', 'admin') NOT NULL,
  content TEXT NOT NULL,
  message_type ENUM('text', 'image', 'file', 'system') DEFAULT 'text',
  status ENUM('sending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'sent',
  temp_message_id VARCHAR(100) NULL,
  metadata JSON NULL,
  attachments JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_session_id (session_id),
  INDEX idx_sender_id (sender_id),
  INDEX idx_created_at (created_at),
  INDEX idx_status (status)
);
```

### **管理员状态表 `admin_statuses`**
```sql
CREATE TABLE admin_statuses (
  admin_id INT PRIMARY KEY,
  status ENUM('online', 'busy', 'offline') DEFAULT 'offline',
  current_sessions INT DEFAULT 0,
  max_sessions INT DEFAULT 5,
  last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 🔑 **权限和认证**

### **认证要求**
- 所有API端点需要有效的JWT Token
- 管理员API需要 `is_admin: true` 权限
- WebSocket连接需要在URL参数中传递token

### **Token格式**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### **Token获取**
```http
POST /api/v2/auth/login
Content-Type: application/json

{
  "mobile": "13612227930",
  "verificationCode": "123456"
}
```

---

## 📱 **前端对接注意事项**

### **1. API路径兼容**
- ✅ 后端实际路径: `/api/v2/admin/chat/sessions`
- ✅ 支持前端期望的路径: `/admin/chat/sessions` (已通过兼容路由实现)

### **2. 响应格式标准**
```json
{
  "code": 0,          // 0表示成功，非0表示错误
  "msg": "操作结果说明",
  "data": {           // 实际数据
    // ...具体数据内容
  },
  "timestamp": "2025-08-12T18:30:00.000Z"
}
```

### **3. 错误处理**
```json
{
  "code": 4002,
  "msg": "访问令牌无效或已过期",
  "data": null,
  "timestamp": "2025-08-12T18:30:00.000Z"
}
```

### **4. WebSocket连接建议**
- 连接后立即发送心跳消息维持连接
- 监听 `connection_established` 事件确认连接成功
- 实现断线重连机制
- 处理离线消息队列

### **5. 实时性保证**
- 用户发送消息后，管理员端通过WebSocket实时收到
- 管理员回复后，用户端立即收到
- 支持输入状态实时显示
- 支持消息已读状态同步

---

## 🧪 **测试用例**

### **1. 获取会话列表**
```bash
curl -H "Authorization: Bearer {token}" \
     "http://localhost:3000/api/v2/admin/chat/sessions?status=all&page=1&pageSize=10"
```

### **2. 获取消息历史**
```bash
curl -H "Authorization: Bearer {token}" \
     "http://localhost:3000/api/v2/admin/chat/sessions/session_123/messages?page=1"
```

### **3. 发送消息**
```bash
curl -X POST \
     -H "Authorization: Bearer {token}" \
     -H "Content-Type: application/json" \
     -d '{"content":"管理员回复","messageType":"text"}' \
     "http://localhost:3000/api/v2/admin/chat/sessions/session_123/messages"
```

### **4. 获取今日统计**
```bash
curl -H "Authorization: Bearer {token}" \
     "http://localhost:3000/api/v2/admin/chat/stats/today"
```

---

## 📈 **性能和限制**

- **并发连接**: 支持最大1000个WebSocket连接
- **消息队列**: 每用户最多缓存100条离线消息
- **心跳间隔**: 90秒
- **消息大小**: 最大16KB
- **分页限制**: 最大pageSize为50

---

## 🔄 **更新记录**

- **2025-08-12**: 初始版本，实现所有管理员聊天API和WebSocket功能
- **功能状态**: ✅ 已完成并测试通过

---

**技术支持**: 如有问题，请联系后端开发团队  
**文档版本**: v1.0  
**最后更新**: 2025年08月12日 
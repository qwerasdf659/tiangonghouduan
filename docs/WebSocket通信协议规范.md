# WebSocket通信协议规范

**文档版本**: v1.0  
**创建时间**: 2025年11月23日  
**技术栈**: Socket.IO 4.7.2  
**适用范围**: 前端管理系统 + 微信小程序 + 后端WebSocket服务

---

## 📋 目录

1. [连接建立](#连接建立)
2. [事件命名规范](#事件命名规范)
3. [数据格式规范](#数据格式规范)
4. [错误处理](#错误处理)
5. [最佳实践](#最佳实践)

---

## 🔌 连接建立

### 客户端连接（前端）

```javascript
// 管理后台标准连接方式
const socket = io({
  auth: {
    token: getToken() // JWT Token
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

// 连接成功处理
socket.on('connect', () => {
  console.log('✅ WebSocket连接成功', socket.id);
});

// 连接错误处理
socket.on('connect_error', (error) => {
  console.error('❌ WebSocket连接失败:', error);
});
```

### 服务端连接处理（后端）

```javascript
// services/ChatWebSocketService.js

this.io.on('connection', (socket) => {
  console.log('🔌 客户端连接:', socket.id);
  
  // 从handshake中获取token
  const token = socket.handshake.auth.token;
  
  // 验证token...
  
  // 注册用户连接
  socket.on('register_user', (data) => {
    const { user_id, user_type } = data;
    // 保存连接映射
  });
});
```

---

## 📝 事件命名规范

### 命名格式

**标准**: `<模块>:<操作>`

**示例**:
- ✅ `notification:new` - 新通知
- ✅ `chat:new_message` - 新聊天消息
- ❌ `notification` - 缺少模块前缀
- ❌ `newMessage` - 使用驼峰命名（不推荐）

### 模块分类

#### 1. 通知模块 (notification)

| 事件名称 | 方向 | 用途 | 数据格式 |
|---------|------|------|---------|
| `notification:new` | 服务端→客户端 | 推送新通知给指定管理员 | NotificationData |
| `notification:broadcast` | 服务端→客户端 | 广播通知给所有管理员 | NotificationData |
| `notification:update` | 服务端→客户端 | 通知状态更新 | { notification_id, is_read } |
| `notification:mark_read` | 客户端→服务端 | 标记通知为已读 | { notification_id } |

#### 2. 聊天模块 (chat)

| 事件名称 | 方向 | 用途 | 数据格式 |
|---------|------|------|---------|
| `chat:new_message` | 服务端→客户端 | 新聊天消息 | ChatMessageData |
| `chat:session_update` | 服务端→客户端 | 会话状态更新 | SessionData |
| `chat:session_assigned` | 服务端→客户端 | 会话分配通知 | AssignmentData |
| `chat:send_message` | 客户端→服务端 | 发送消息 | { session_id, content } |
| `chat:typing` | 客户端→服务端 | 正在输入 | { session_id } |

#### 3. 系统模块 (system)

| 事件名称 | 方向 | 用途 | 数据格式 |
|---------|------|------|---------|
| `system:status_change` | 服务端→客户端 | 系统状态变更 | StatusData |
| `system:alert` | 服务端→客户端 | 系统警告 | AlertData |
| `system:maintenance` | 服务端→客户端 | 系统维护通知 | MaintenanceData |

---

## 📊 数据格式规范

### NotificationData（通知数据）

```typescript
interface NotificationData {
  notification_id: number;          // 通知ID
  type: 'system' | 'user' | 'order' | 'alert';  // 通知类型
  title: string;                    // 通知标题
  content: string;                  // 通知内容
  link?: string;                    // 相关链接（可选）
  created_at: string;               // 创建时间（北京时间ISO格式）
  is_read: boolean;                 // 是否已读
  target_user_id?: number;          // 目标用户ID（可选）
}
```

**示例**:
```json
{
  "notification_id": 123,
  "type": "system",
  "title": "系统维护通知",
  "content": "系统将于今晚22:00进行维护",
  "created_at": "2025-11-23T20:00:00.000+08:00",
  "is_read": false
}
```

### ChatMessageData（聊天消息数据）

```typescript
interface ChatMessageData {
  message_id: number;               // 消息ID
  session_id: number;               // 会话ID
  sender_type: 'user' | 'admin';    // 发送者类型
  sender_id: number;                // 发送者ID
  message_content: string;          // 消息内容
  message_type: 'text' | 'image' | 'system';  // 消息类型
  created_at: string;               // 创建时间（北京时间ISO格式）
}
```

**示例**:
```json
{
  "message_id": 456,
  "session_id": 789,
  "sender_type": "admin",
  "sender_id": 1,
  "message_content": "您好，有什么可以帮助您的？",
  "message_type": "text",
  "created_at": "2025-11-23T20:05:00.000+08:00"
}
```

### SessionData（会话数据）

```typescript
interface SessionData {
  session_id: number;               // 会话ID
  user_id: number;                  // 用户ID
  admin_id: number | null;          // 客服ID（null表示未分配）
  status: 'waiting' | 'active' | 'closed';  // 会话状态
  priority: number;                 // 优先级（1-5）
  unread_count: number;             // 未读消息数
  last_message: string;             // 最后一条消息
  created_at: string;               // 创建时间（北京时间ISO格式）
  updated_at: string;               // 更新时间（北京时间ISO格式）
}
```

---

## 🔧 后端实现规范

### 推送通知给指定管理员

```javascript
// services/ChatWebSocketService.js

/**
 * 推送通知给指定管理员
 * @param {Number} admin_id - 管理员用户ID
 * @param {Object} notification - 通知数据对象
 * @returns {Boolean} 是否推送成功
 */
pushNotificationToAdmin(admin_id, notification) {
  const socketId = this.connectedAdmins.get(admin_id);
  if (socketId) {
    try {
      // 使用标准事件名称: notification:new
      this.io.to(socketId).emit('notification:new', notification);
      console.log(`🔔 通知已推送给管理员 ${admin_id}`);
      return true;
    } catch (error) {
      wsLogger.error('推送通知失败', { admin_id, error: error.message });
      return false;
    }
  }
  console.log(`⚠️ 管理员 ${admin_id} 不在线，无法推送通知`);
  return false;
}
```

### 广播通知给所有管理员

```javascript
/**
 * 广播通知给所有在线管理员
 * @param {Object} notification - 通知数据对象
 * @returns {Number} 成功推送的管理员数量
 */
broadcastNotificationToAllAdmins(notification) {
  let successCount = 0;
  
  for (const [admin_id, socketId] of this.connectedAdmins.entries()) {
    try {
      // 使用标准事件名称: notification:broadcast
      this.io.to(socketId).emit('notification:broadcast', notification);
      successCount++;
    } catch (error) {
      wsLogger.error('广播通知失败', { admin_id, error: error.message });
    }
  }
  
  console.log(`📢 通知已广播给 ${successCount} 个在线管理员`);
  return successCount;
}
```

---

## 💻 前端实现规范

### 通知中心页面（notifications.html）

```javascript
/**
 * 初始化WebSocket连接
 */
function initWebSocket() {
  try {
    wsConnection = io({
      auth: { token: getToken() },
      transports: ['websocket', 'polling']
    });
    
    // 连接成功
    wsConnection.on('connect', () => {
      console.log('✅ WebSocket连接成功', wsConnection.id);
    });
    
    // ✅ 监听新通知事件（单播）
    wsConnection.on('notification:new', (data) => {
      console.log('📬 收到新通知:', data);
      loadNotifications(true); // 刷新通知列表
      showToast('新通知', data.title); // 显示提示
    });
    
    // ✅ 监听广播通知事件
    wsConnection.on('notification:broadcast', (data) => {
      console.log('📢 收到广播通知:', data);
      loadNotifications(true); // 刷新通知列表
      showToast('系统通知', data.title); // 显示提示
    });
    
    // 错误处理
    wsConnection.on('connect_error', (error) => {
      console.error('❌ WebSocket连接失败:', error);
    });
    
    // 断开处理
    wsConnection.on('disconnect', (reason) => {
      console.log('🔌 WebSocket断开:', reason);
    });
    
  } catch (error) {
    console.error('❌ WebSocket初始化失败:', error);
  }
}
```

### 客服工作台页面（customer-service.html）

```javascript
/**
 * 初始化WebSocket连接
 */
function initWebSocket() {
  try {
    wsConnection = io({
      auth: { token: getToken() },
      transports: ['websocket', 'polling']
    });
    
    wsConnection.on('connect', () => {
      console.log('✅ WebSocket连接成功');
    });
    
    // ✅ 监听新聊天消息
    wsConnection.on('chat:new_message', (data) => {
      console.log('💬 收到新消息:', data);
      if (data.session_id === currentSessionId) {
        appendMessage(data.message);
      }
      loadSessions(true); // 更新会话列表
    });
    
    // ✅ 监听会话状态更新
    wsConnection.on('chat:session_update', (data) => {
      console.log('🔄 会话状态更新:', data);
      loadSessions(true);
    });
    
    // ✅ 监听会话分配通知
    wsConnection.on('chat:session_assigned', (data) => {
      console.log('📋 收到会话分配:', data);
      loadSessions(true);
      showToast('新会话', '您有新的客服会话待处理');
    });
    
    // 错误处理
    wsConnection.on('connect_error', (error) => {
      console.error('❌ WebSocket连接失败:', error);
    });
    
  } catch (error) {
    console.error('❌ WebSocket初始化失败:', error);
  }
}
```

---

## 🛡️ 错误处理规范

### 必需的错误处理事件

**所有WebSocket连接必须监听以下错误事件**:

```javascript
// 1. 连接错误
wsConnection.on('connect_error', (error) => {
  console.error('❌ WebSocket连接错误:', error);
  // 可选：显示用户友好的错误提示
});

// 2. 连接断开
wsConnection.on('disconnect', (reason) => {
  console.log('🔌 WebSocket连接已断开:', reason);
  // Socket.IO会自动重连，无需手动处理
});

// 3. 重连成功（可选）
wsConnection.on('reconnect', (attemptNumber) => {
  console.log('✅ WebSocket重连成功，尝试次数:', attemptNumber);
  // 可选：重新加载数据
});

// 4. 重连失败（可选）
wsConnection.on('reconnect_failed', () => {
  console.error('❌ WebSocket重连失败');
  // 可选：显示错误提示，建议用户刷新页面
});
```

### 页面卸载时断开连接

```javascript
window.addEventListener('beforeunload', () => {
  if (wsConnection && wsConnection.connected) {
    wsConnection.disconnect();
    console.log('🔌 WebSocket已断开（页面卸载）');
  }
});
```

---

## 📚 使用场景示例

### 场景1：管理员发送系统通知

**流程**:
```
管理员点击"发送通知" 
  ↓
前端调用 POST /api/v4/notifications/send
  ↓
后端NotificationService处理
  ↓
调用 ChatWebSocketService.broadcastNotificationToAllAdmins()
  ↓
发送 notification:broadcast 事件
  ↓
所有在线管理员收到通知
  ↓
前端刷新通知列表并显示提示
```

**后端代码**:
```javascript
// services/NotificationService.js

async createAdminNotification(type, title, content) {
  // 构造通知数据
  const notification = {
    notification_id: generateId(),
    type,
    title,
    content,
    created_at: BeijingTimeHelper.now(),
    is_read: false
  };
  
  // 广播给所有在线管理员
  const count = ChatWebSocketService.broadcastNotificationToAllAdmins(notification);
  
  console.log(`📢 通知已广播给 ${count} 个在线管理员`);
  
  return notification;
}
```

**前端代码**:
```javascript
// public/admin/notifications.html

wsConnection.on('notification:broadcast', (data) => {
  console.log('📢 收到广播通知:', data);
  
  // 刷新通知列表
  loadNotifications(true);
  
  // 显示提示（可选）
  showToast('系统通知', data.title);
  
  // 更新未读计数
  updateUnreadCount();
});
```

### 场景2：用户发起客服会话

**流程**:
```
用户发送消息
  ↓
前端调用 POST /api/v4/customer-service/sessions
  ↓
后端创建会话并分配客服
  ↓
调用 ChatWebSocketService.pushMessageToAdmin()
  ↓
发送 chat:session_assigned 事件给客服
  ↓
客服端收到通知并刷新会话列表
```

**后端代码**:
```javascript
// routes/v4/system.js

// 会话分配通知
const assignmentData = {
  type: 'session_assigned',
  session_id: sessionId,
  user_id: session.user_id,
  priority: session.priority
};

ChatWebSocketService.pushMessageToAdmin(admin_id, assignmentData);
```

**前端代码**:
```javascript
// public/admin/customer-service.html

wsConnection.on('chat:session_assigned', (data) => {
  console.log('📋 收到会话分配:', data);
  
  // 刷新会话列表
  loadSessions(true);
  
  // 显示提示
  showToast('新会话', '您有新的客服会话待处理');
});
```

---

## ✅ 最佳实践

### 1. 连接管理

**✅ 推荐做法**:
```javascript
// 单例模式 - 全局只创建一个连接
let wsConnection = null;

function initWebSocket() {
  if (wsConnection && wsConnection.connected) {
    console.log('WebSocket已连接，无需重复初始化');
    return wsConnection;
  }
  
  wsConnection = io({ /* 配置 */ });
  return wsConnection;
}
```

**❌ 错误做法**:
```javascript
// 每次都创建新连接 - 造成连接泄漏
function sendMessage() {
  const socket = io(); // ❌ 不要这样做
  socket.emit('message', data);
}
```

### 2. 事件监听

**✅ 推荐做法**:
```javascript
// 页面初始化时监听一次
document.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  
  wsConnection.on('notification:new', handleNotification);
  wsConnection.on('notification:broadcast', handleBroadcast);
});
```

**❌ 错误做法**:
```javascript
// 重复监听 - 造成事件处理器堆积
function refreshData() {
  wsConnection.on('notification:new', handleNotification); // ❌ 每次刷新都添加监听器
}
```

### 3. 错误处理

**✅ 推荐做法**:
```javascript
wsConnection.on('connect_error', (error) => {
  console.error('连接错误:', error);
  
  // 用户友好的错误提示
  if (error.message.includes('timeout')) {
    showError('连接超时', '请检查网络连接');
  } else if (error.message.includes('unauthorized')) {
    showError('认证失败', '请重新登录');
  }
});
```

**❌ 错误做法**:
```javascript
// 没有错误处理 - 用户不知道发生了什么
wsConnection = io(); // ❌ 连接失败了也不知道
```

### 4. 性能优化

**✅ 推荐做法**:
```javascript
// 静默刷新 - 避免频繁显示加载状态
wsConnection.on('notification:new', (data) => {
  loadNotifications(true); // silent=true，不显示loading
});

// 防抖处理 - 避免频繁刷新
let refreshTimer = null;
wsConnection.on('notification:broadcast', (data) => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => loadNotifications(true), 1000);
});
```

---

## 🧪 测试和验证

### 单元测试

```javascript
// tests/websocket/events.test.js

describe('WebSocket事件命名规范', () => {
  test('通知事件应使用notification:前缀', () => {
    const events = getEmittedEvents();
    events.forEach(event => {
      if (event.includes('notification')) {
        expect(event).toMatch(/^notification:/);
      }
    });
  });
  
  test('聊天事件应使用chat:前缀', () => {
    const events = getEmittedEvents();
    events.forEach(event => {
      if (event.includes('message') || event.includes('session')) {
        expect(event).toMatch(/^chat:/);
      }
    });
  });
});
```

### 集成测试

```bash
# 1. 启动服务
npm run pm:start

# 2. 检查WebSocket服务状态
curl http://localhost:3000/health | grep websocket

# 3. 访问管理后台页面
# http://localhost:3000/admin/notifications.html

# 4. 打开浏览器控制台
# 应该看到: "✅ WebSocket连接成功"

# 5. 发送测试通知
# 应该实时收到通知并刷新列表
```

---

## 📋 检查清单

### 开发新功能时

- [ ] 确定功能属于哪个模块（notification/chat/system）
- [ ] 按照命名规范定义事件名称
- [ ] 后端实现事件发送逻辑
- [ ] 前端实现事件监听逻辑
- [ ] 添加错误处理
- [ ] 编写测试用例
- [ ] 更新本文档的事件列表

### 修改WebSocket相关代码时

- [ ] 检查事件名称是否符合规范
- [ ] 前后端事件名称是否一致
- [ ] 数据格式是否符合TypeScript接口定义
- [ ] 是否添加了错误处理
- [ ] 运行验证脚本: `npm run frontend:verify:websocket`

---

## 🔗 相关文档

- [前端管理系统-CSP和WebSocket问题系统性预防方案](./前端管理系统-CSP和WebSocket问题系统性预防方案.md)
- [Socket.IO官方文档](https://socket.io/docs/v4/)
- [第三方库版本管理](../public/admin/js/vendor/README.md)

---

**文档维护**: 后端开发团队  
**最后更新**: 2025年11月23日


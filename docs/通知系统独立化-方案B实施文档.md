# 通知系统独立化 — 方案 B 实施文档

> 创建时间：2026-02-25
> **数据来源：Node.js (mysql2) 连接 Sealos 真实数据库实时验证（dbconn.sealosbja.site:42569）**
> **代码来源：`/home/devbox/project` 后端源码实际审计**
> 状态：排查完成 + 数据清理完成 + 6 项拍板决定已确认，等待实施
> 最后更新：2026-02-25（新增业界调研 + 拍板决定章节）

---

## 一、问题排查结论（基于真实数据库数据）

### 1.1 现象

微信小程序"在线客服"聊天页面中，出现大量灰色系统消息（挂牌成功、挂牌已撤回、购买成功等），淹没了真实的人工客服对话。

### 1.2 数据库实查（清理前快照 2026-02-24）

**chat_messages 表消息分布：**

| message_source | 数量 | 占比 |
|---|---|---|
| `system`（系统通知） | 661 | 97.6% |
| `admin_client`（管理员人工消息） | 16 | 2.4% |
| `user_client`（用户消息） | 0 | 0% |

**系统通知类型分布（notification_type）：**

| 通知类型 | 数量 | 触发场景 |
|---|---|---|
| `purchase_completed` | 449 | 买家购买成交 |
| `listing_created` | 151 | 卖家挂牌上架 |
| `listing_withdrawn` | 44 | 卖家撤回挂牌 |
| `lottery_win` | 5 | 抽奖中奖 |
| `listing_sold` | 3 | 卖家资产被买走 |
| `test_notification` | 3 | 开发测试 |

**受影响最严重的会话：**

| session_id | user_id | 系统消息 | 人工消息 | 系统消息占比 |
|---|---|---|---|---|
| 1796 | 135 | 301 | 0 | 100% |
| 1953 | 31 | 204 | 0 | 100% |
| 1797 | 32 | 105 | 0 | 100% |

共 21 个用户受到影响。

### 1.3 根因

这是**有意为之的设计**，不是 bug。`NotificationService` 文件头部注释明确写着：

> 所有通知通过客服聊天系统的系统消息发送

`send()` 方法只有一条路径 → `sendToChat()` → `ChatMessage.create()` 写入客服会话。

当初设计时通知量极低（中奖、审核等低频事件），交易市场上线后高频操作使得客服聊天被系统消息淹没。

### 1.4 触发通知的 6 个生产代码入口

| 文件位置 | 通知方法 | 触发操作 |
|---|---|---|
| `services/market-listing/CoreService.js:928` | `notifyListingCreated` | 创建挂牌 |
| `services/market-listing/CoreService.js:1045` | `notifyListingWithdrawn` | 撤回挂牌 |
| `services/TradeOrderService.js:766` | `notifyListingSold` | 资产售出 |
| `services/TradeOrderService.js:779` | `notifyPurchaseCompleted` | 购买完成 |
| `jobs/hourly-expire-fungible-asset-listings.js:226` | `notifyListingExpired` | 挂牌过期（定时任务） |
| `routes/v4/lottery/draw.js:284` | `notifyLotteryWin` | 抽奖中奖 |

### 1.5 数据清理记录

**执行时间：** 2026-02-25
**操作：** `DELETE FROM chat_messages WHERE message_source = 'system'`
**删除行数：** 661
**保留行数：** 16（全部为 `message_source = 'admin_client'` 的真实人工消息）
**风险评估：** `chat_messages` 表无被外键引用，安全删除。

---

## 二、业界调研与拍板决定

### 2.1 业界通知系统设计对比

#### 大厂（美团/阿里/腾讯）

| 维度 | 做法 |
|---|---|
| 通知 vs 客服 | 严格分离，通知走独立消息中台，客服走 IM 通道 |
| 存储 | 阿里消息中台：HBase 存储（日均 2000 万条），按消息类型分级分泳道 |
| 分类 | 美团：交易物流 / 活动 / 服务通知 分 Tab；淘宝类似 |
| 已读 | 点击单条标已读 + 全部已读按钮（美团/淘宝/京东通用做法） |
| 保留策略 | 交易类永久保留（是交易凭证），营销类 30 天清理 |
| 未读数 | Redis 缓存未读计数，异步写数据库保证一致性 |
| 推送 | WebSocket 实时推送 + 微信服务通知（交易状态变化） |

#### 二手/虚拟物品交易平台（闲鱼/转转/Steam）

| 维度 | 做法 |
|---|---|
| 通知 vs 客服 | 闲鱼：消息 Tab 内分子 Tab（交易物流/互动消息/系统通知），与客服对话物理分离 |
| 入口 | 闲鱼/转转：tabBar 第 3 个 Tab "消息"；Steam：右上角铃铛 |
| 分类 | 闲鱼分 3 Tab；Steam 统一列表不分类 |
| 保留 | 交易通知永久保留（纠纷回查需要） |
| 特殊设计 | 闲鱼消息会话模型在人与人基础上挂载商品，两人之间可存在多个会话 |

#### 游戏公司（原神/崩铁/游戏邮件系统）

| 维度 | 做法 |
|---|---|
| 通知形式 | 游戏内邮件系统（独立于聊天） |
| 入口 | 主界面右上角邮件图标（带未读角标） |
| 分类 | 统一列表或分 2 Tab（系统/好友） |
| 保留 | App 内通知永久保留，游戏内邮件 30 天过期自动删 |
| 已读 | 点击单条标已读 + "一键领取并已读" |
| 微信推送 | 几乎不用微信订阅消息 |

#### 小型交易平台/小众二手平台

| 维度 | 做法 |
|---|---|
| 入口 | "我的"页面加一行入口，或首页铃铛 |
| 分类 | 统一列表居多（通知类型不够多，分 Tab 显得空） |
| 保留 | 永久保留（数据量小，清理任务增加复杂度不值得） |
| 微信推送 | 初期不做，后期按需加 |

### 2.2 通知中心 UX 最佳实践（Smashing Magazine / Courier 2025 指南）

1. **交易通知与营销通知严格分开** — 混用会侵蚀用户信任
2. **通知格式匹配紧急程度** — 高紧急用 push，低紧急用 badge，不能所有通知都用同一种方式
3. **通知中心是持久化历史记录** — 用户经常意外关掉通知，需要能回查
4. **前置关键信息** — 用户扫通知只花几秒，标题必须说清「谁、什么、为什么」
5. **避免通知疲劳** — 高频通知批量合并，设置频率上限

### 2.3 六项拍板决定

基于业界调研 + 项目实际情况（项目未上线、用户量从零开始、虚拟物品交易场景、Node.js + MySQL 技术栈），逐项确定：

#### 决定 1：通知保留策略 → A）永久保留

| 选项 | 对比 |
|---|---|
| A）永久保留 ✅ | 交易通知是交易凭证，纠纷回查需要；当前增速（47 天 661 条）全量上线日均 1 万条，3 年才 1000 万行，MySQL 单表无压力；省掉定时清理 job 的维护成本 |
| B）90 天清理 | 多一个 job + cron + 配置 + 边界处理，是纯技术债务来源 |
| C）180 天清理 | 同上 |

**依据**：闲鱼/转转/Steam 交易通知均永久保留；小型平台数据量小不值得做清理。

#### 决定 2：已读逻辑 → B+C）点击单条已读 + 全部已读按钮

| 选项 | 对比 |
|---|---|
| A）打开列表自动已读 | 用户可能只扫了一眼没看内容，未读角标就消失，容易漏掉重要交易通知 |
| B+C）点击单条 + 全部已读 ✅ | 美团/淘宝/京东/闲鱼的通用做法；刚好对应已设计的两个 API：`POST /:id/read`（单条）+ `POST /mark-read`（批量/全部） |

**依据**：业界电商/交易平台几乎全部采用此组合。

#### 决定 3：小程序通知入口 → C）首页右上角铃铛图标（带未读角标）

| 选项 | 对比 |
|---|---|
| A）tabBar 新增 Tab | tabBar 位置贵重，应留给核心业务（首页/市场/背包/我的），交易型产品不需要消息占一个 Tab |
| B）"我的"页面入口 | 太深，用户不容易发现新通知 |
| C）首页右上角铃铛 ✅ | Steam/游戏的通用做法；用户零学习成本；铃铛+红点角标驱动点击；不占 tabBar |

**依据**：Steam 市场、游戏（原神等）、小型交易平台均使用铃铛图标。

#### 决定 4：sendToChat() → A）彻底不用

| 选项 | 对比 |
|---|---|
| A）彻底不用 ✅ | 项目未上线零兼容负担；管理员发公告用 `sender_type = 'admin'` 的普通文本消息即可；`sendToChat()` 方法代码保留不删但无生产调用 |
| B）保留给管理员用 | 增加认知负担（两套通知通道），管理员公告有更好的方式 |

**依据**：所有成熟客服系统（Zendesk/Intercom/美洽）都严格区分对话消息和系统通知。

#### 决定 5：通知分类 → C）统一列表 + 类型标签

| 选项 | 对比 |
|---|---|
| A）统一列表不分类 | 缺少视觉区分 |
| B）分 Tab | 当前只有 6 种通知类型，分 3 Tab 每 Tab 只 2 种，用户体验空洞 |
| C）统一列表 + 类型标签 ✅ | 实现最简单；类型标签（[交易] [中奖] [系统]）给视觉区分；后端 API 已有 `type` 查询参数，后续真需要分 Tab 是纯前端改动 |

**依据**：Steam 统一列表；游戏邮件统一列表；小型平台统一列表居多。通知类型不够多时分 Tab 暴露内容单薄。

#### 决定 6：微信订阅消息 → A）暂不做，表结构预留字段

| 选项 | 对比 |
|---|---|
| A）暂不做，预留字段 ✅ | 微信订阅消息全链路复杂（申请模板→审核→前端每次 `wx.requestSubscribeMessage()`→后端调微信 API），初期 ROI 低；`user_notifications` 表预留 `wx_push_status` 字段，后续接入零 DDL 变更 |
| B）现在就做 | 项目未上线，先做好核心交易体验 |

**依据**：小型交易平台和游戏公司初期均不做微信订阅消息；闲鱼/淘宝有资源才维护这套流程。

### 2.4 决定总表

| # | 决策项 | 选择 | 核心理由 |
|---|---|---|---|
| 1 | 通知保留策略 | **永久保留** | 交易凭证 + 数据量小 + 省维护成本 |
| 2 | 已读逻辑 | **点击单条 + 全部已读按钮** | 业界标配，防漏掉重要通知 |
| 3 | 小程序入口 | **首页右上角铃铛** | 交易型产品标配，不占 tabBar |
| 4 | sendToChat | **彻底不用** | 零兼容负担，干净分离 |
| 5 | 通知分类 | **统一列表 + 类型标签** | 类型少不适合分 Tab |
| 6 | 微信订阅消息 | **暂不做，预留字段** | 初期 ROI 低，预留扩展性 |

---

## 三、方案 B 设计 — 通知通道独立

### 3.1 核心思路

将 `NotificationService.send()` 的写入目标从 `chat_messages`（客服聊天表）改为新建的 `user_notifications`（用户通知表）。客服聊天回归纯粹的人工对话场景，通知系统独立演进。

### 3.2 改动清单总览

| 改动项 | 类型 | 文件 | 说明 |
|---|---|---|---|
| 新建 `user_notifications` 表 | 迁移 | `migrations/xxxxx-create-user-notifications.js` | 独立通知存储 |
| 新建 `UserNotification` 模型 | 新增 | `models/UserNotification.js` | Sequelize 模型 |
| 注册到 `models/index.js` | 修改 | `models/index.js` | 模型注册 |
| 改造 `NotificationService.send()` | 修改 | `services/NotificationService.js` | 写入目标切换 |
| 新增通知 API 路由 | 新增 | `routes/v4/system/notifications.js` | 用户端通知接口 |
| 注册路由 | 修改 | `app.js` | 路由挂载 |
| WebSocket 通知频道分离 | 修改 | `services/NotificationService.js` | 推送到通知频道 |
| `sendToChat()` 保留 | 不动 | `services/NotificationService.js` | 仅用于真正的客服系统消息 |

---

## 四、数据库设计

### 4.1 新建 `user_notifications` 表

```sql
CREATE TABLE user_notifications (
  notification_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id            INT NOT NULL,                          -- 接收用户
  type               VARCHAR(50) NOT NULL,                  -- 通知类型（listing_created / purchase_completed / lottery_win 等）
  title              VARCHAR(200) NOT NULL,                 -- 通知标题（如 "📦 挂牌成功"）
  content            TEXT NOT NULL,                         -- 通知正文
  metadata           JSON DEFAULT NULL,                     -- 附加业务数据（market_listing_id, offer_asset_code 等）
  is_read            TINYINT(1) NOT NULL DEFAULT 0,         -- 已读标记
  read_at            DATETIME DEFAULT NULL,                 -- 已读时间
  wx_push_status     ENUM('skipped','pending','sent','failed') NOT NULL DEFAULT 'skipped',  -- 微信订阅消息推送状态（拍板决定6：预留字段，暂不启用）
  created_at         DATETIME NOT NULL,
  updated_at         DATETIME NOT NULL,

  INDEX idx_user_created (user_id, created_at DESC),        -- 用户通知列表分页查询
  INDEX idx_user_unread (user_id, is_read),                 -- 未读数量统计
  INDEX idx_type (type)                                     -- 按类型筛选
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**设计要点：**
- `user_id` 不设外键约束（与现有项目风格一致，通过应用层保证）
- `metadata` JSON 字段存储业务上下文，不同通知类型的扩展数据放这里
- `is_read` + `read_at` 支持已读未读功能（拍板决定 2：点击单条标已读 + 全部已读按钮）
- `wx_push_status` 预留微信订阅消息推送状态（拍板决定 6：暂不启用，默认 `'skipped'`）
- 三个索引覆盖主要查询场景
- 无清理策略，永久保留（拍板决定 1）

### 4.2 与 `chat_messages` 表的对比

| 维度 | chat_messages（原方案） | user_notifications（方案B） |
|---|---|---|
| 用途 | 人工客服对话 | 系统通知推送 |
| sender | user / admin / null | 无（系统发出） |
| 关联 | 必须关联 customer_service_session | 直接关联 user_id |
| 已读 | 无（靠 status 字段） | is_read + read_at |
| 扩展 | 受限于聊天消息结构 | metadata JSON 自由扩展 |

---

## 五、NotificationService 改造

### 5.1 `send()` 方法变更

**当前逻辑（改造前）：**

```
send(user_id, options)
  └─ sendToChat(user_id, options)     ← 写入 chat_messages
       ├─ getOrCreateCustomerServiceSession()
       ├─ ChatMessage.create()
       └─ ChatWebSocketService.pushMessageToUser()
```

**改造后逻辑：**

```
send(user_id, options)
  └─ sendToNotification(user_id, options)  ← 写入 user_notifications
       ├─ UserNotification.create()
       └─ WebSocket 推送通知事件（新频道 'notification'）
```

### 5.2 关键变更点

1. **`send()` 方法**：调用 `sendToNotification()` 替代 `sendToChat()`
2. **新增 `sendToNotification()` 方法**：
   - 写入 `UserNotification` 模型
   - 通过 WebSocket 推送 `{ event: 'new_notification', data: {...} }` 到用户
   - 不再创建/关联客服会话
3. **`sendToChat()` 代码保留不删，但生产环境无调用方**（拍板决定 4：彻底不用）
4. **`sendToAdmins()` 保持不变**：管理员通知走原有逻辑

### 5.3 所有 notifyXxx() 方法无需改动

`notifyListingCreated`、`notifyPurchaseCompleted` 等 30+ 个业务通知方法全部调用 `send()`，`send()` 内部路由变更后，这些方法自动生效，无需逐个修改。

---

## 六、新增通知 API

### 6.1 路由前缀

`/api/v4/system/notifications`

挂载到 `app.js`，与现有 `/api/v4/system/chat` 并列。

### 6.2 接口列表

#### (1) GET /api/v4/system/notifications — 获取通知列表

**请求参数（Query）：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| page | number | 否 | 1 | 页码 |
| page_size | number | 否 | 20 | 每页数量（最大 50） |
| type | string | 否 | - | 按通知类型筛选 |
| is_read | boolean | 否 | - | 按已读状态筛选 |

**响应（data 部分）：**

```json
{
  "notifications": [
    {
      "notification_id": 1,
      "type": "listing_created",
      "title": "📦 挂牌成功",
      "content": "您的 10 个 DIAMOND 已成功上架...",
      "metadata": { "market_listing_id": 123, "offer_asset_code": "DIAMOND" },
      "is_read": false,
      "created_at": "2026-02-25 10:30:00"
    }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 20,
    "total_count": 45,
    "total_pages": 3
  }
}
```

#### (2) GET /api/v4/system/notifications/unread-count — 获取未读数量

**响应：**

```json
{
  "unread_count": 5
}
```

轻量接口，用于小程序 tabBar 红点和角标显示。

#### (3) POST /api/v4/system/notifications/mark-read — 批量标记已读

**请求体：**

```json
{
  "notification_ids": [1, 2, 3]
}
```

传空数组或不传 `notification_ids` 时，标记该用户全部未读为已读（"一键全部已读"按钮，拍板决定 2）。

#### (4) POST /api/v4/system/notifications/:id/read — 单条标记已读

用户点击某条通知时调用（拍板决定 2：点击单条才标已读，不自动标）。

### 6.3 认证

全部需要 `authenticateToken`，通过 `req.user.user_id` 做数据隔离。

---

## 七、WebSocket 通知频道

### 7.1 当前状态

`ChatWebSocketService.pushMessageToUser(user_id, messageData)` 将系统通知当作聊天消息推送，前端客服聊天组件收到后渲染为灰色气泡。

### 7.2 改造方案

在 `sendToNotification()` 中，WebSocket 推送使用独立的事件类型：

```
事件名：'new_notification'
数据：{
  notification_id,
  type,
  title,
  content,
  metadata,
  created_at
}
```

前端小程序根据事件名分发：
- `'new_message'` → 客服聊天页面处理
- `'new_notification'` → 更新通知红点 / 通知列表

### 7.3 离线用户

通知已持久化到 `user_notifications` 表。用户上线后通过 `GET /notifications` 拉取，通过 `GET /notifications/unread-count` 获取未读数量。

---

## 八、前端适配（微信小程序）

### 8.1 通知入口：首页右上角铃铛图标（拍板决定 3）

- 首页导航栏右上角放置铃铛图标，带未读数角标
- 角标数据来源：WebSocket `new_notification` 事件驱动实时更新 + 进入小程序时 `GET /notifications/unread-count` 兜底拉取
- 点击铃铛进入通知列表页

### 8.2 通知列表页

- 统一列表，按时间倒序，支持下拉加载更多（拍板决定 5：不分 Tab）
- 每条通知前带类型标签，如 `[交易]` `[中奖]` `[系统]`，用不同颜色区分
- 列表顶部放"全部已读"按钮（调用 `POST /mark-read`，拍板决定 2）
- 点击单条通知 → 调用 `POST /:id/read` 标记已读 → 跳转到对应业务页面（如点击"挂牌成功"跳到交易市场我的挂牌）
- 未读通知视觉上加粗/高亮，已读通知正常展示

### 8.3 客服聊天页不变

客服聊天页面代码不需要改动。后端不再往 `chat_messages` 写系统通知后，聊天页面自然只展示人工对话。

---

## 九、实施步骤

### Step 1：数据库迁移

新建迁移文件 `migrations/xxxxx-create-user-notifications.js`，创建 `user_notifications` 表。

### Step 2：新建模型

创建 `models/UserNotification.js`，在 `models/index.js` 中注册。

### Step 3：改造 NotificationService

- 新增 `sendToNotification()` 方法
- `send()` 方法内部调用从 `sendToChat()` 切换到 `sendToNotification()`
- `sendToChat()` 保留，不删除

### Step 4：新增通知路由

创建 `routes/v4/system/notifications.js`，实现 4 个接口。在 `app.js` 中注册。

### Step 5：WebSocket 事件分离

`sendToNotification()` 中推送事件名改为 `'new_notification'`。

### Step 6：测试验证

- 执行挂牌/撤回/购买操作，确认通知写入 `user_notifications` 而非 `chat_messages`
- 打开客服聊天页，确认不再出现系统通知灰色消息
- 调用通知 API，确认列表/未读数/标记已读功能正常

---

## 十、不变的部分

| 模块 | 说明 |
|---|---|
| 客服聊天表 `chat_messages` | 结构不变，仅存储人工对话 |
| 客服聊天 API `/api/v4/system/chat/*` | 不变 |
| `sendToChat()` 方法 | 代码保留不删，但生产环境无调用方（拍板决定 4：彻底不用） |
| `sendToAdmins()` 方法 | 不变，管理员通知走原有逻辑 |
| 所有 `notifyXxx()` 业务方法签名 | 不变，调用方无感知 |
| 6 个生产触发点 | 代码不需要改动，`send()` 内部路由变更后自动生效 |
| `chat_messages` 表的 `message_source` 枚举 | 保留 `'system'` 值，不做 DDL 变更 |

---

## 十一、回滚方案

如需回滚，只需将 `send()` 方法内部调用从 `sendToNotification()` 改回 `sendToChat()`。`user_notifications` 表和通知 API 可以保留不影响其他功能。

---

## 附录 A：后端项目技术框架（权威基线）

| 维度 | 实际状态 |
|---|---|
| 运行时 | Node.js 20+ / Express 4.18 |
| ORM | Sequelize 6.35（MySQL 方言，mysql2 驱动） |
| 数据库 | Sealos MySQL（101 张表，`restaurant_points_dev`） |
| API 版本 | 全局 `/api/v4/*` |
| 认证 | JWT Bearer Token（`authenticateToken`） |
| 事务 | `TransactionManager.execute()` |
| 服务容器 | `ServiceManager`（`req.app.locals.services.getService('key')`） |
| 响应格式 | `ApiResponse`：`{ success, code, message, data, timestamp, version, request_id }` |
| 时区 | 全链路北京时间 `Asia/Shanghai` |
| 已执行迁移 | 412 个 |

## 附录 B：NotificationService 现有全部通知方法清单（30 个）

这些方法改造后**全部自动走新通道**，无需逐个修改：

| 方法名 | 业务场景 |
|---|---|
| `send(user_id, options)` | 统一入口 |
| `sendToChat(user_id, options)` | 客服聊天通道（保留，不再作为默认） |
| `sendToAdmins(options)` | 管理员广播（不变） |
| `notifyExchangePending` | 兑换待审核 |
| `notifyNewExchangeAudit` | 新兑换审核（管理员） |
| `notifyExchangeApproved` | 兑换审核通过 |
| `notifyExchangeRejected` | 兑换审核拒绝 |
| `notifyTimeoutAlert` | 超时告警 |
| `notifyPremiumUnlockSuccess` | 高级空间解锁成功 |
| `notifyPremiumExpiringSoon` | 高级空间即将过期 |
| `notifyPremiumExpired` | 高级空间已过期 |
| `sendAuditApprovedNotification` | 审核通过通知 |
| `sendAuditRejectedNotification` | 审核拒绝通知 |
| `notifyLotteryWin` | 抽奖中奖 |
| `notifyPointsChange` | 积分变动 |
| `notifyAnnouncement` | 系统公告 |
| `notifySecurityEvent` | 安全事件 |
| `notifyActivityStatusChange` | 活动状态变更 |
| `notifyActivityStarted` | 活动开始 |
| `notifyActivityPaused` | 活动暂停 |
| `notifyActivityEnded` | 活动结束 |
| `notifyListingCreated` | 挂牌成功 |
| `notifyListingSold` | 售出成功 |
| `notifyPurchaseCompleted` | 购买成功 |
| `notifyListingWithdrawn` | 挂牌已撤回 |
| `notifyListingExpired` | 挂牌过期 |
| `notifyBidOutbid` | 竞价被超越 |
| `notifyBidWon` | 竞价成功 |
| `notifyBidLost` | 竞价失败 |

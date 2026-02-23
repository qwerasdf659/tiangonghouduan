# 微信小程序前端 — 后端API对接文档

> 创建时间：2026-02-23
> 状态：后端已全部就绪，等待小程序前端对接
> 数据库：`restaurant_points_dev`（Sealos Devbox 唯一环境）
> API版本：V4（`/api/v4/`）
> 命名规范：全链路 snake_case

---

## 一、后端已完成状态总结

### 1.1 三表模型迁移（物品系统）

物品系统已从旧的 `item_instances` 单表迁移到三表模型：

| 表名 | 职责 | 主键 |
|------|------|------|
| `items` | 物品当前状态快照（缓存表） | `item_id` |
| `item_ledger` | 物品生命周期账本（双录真相源） | `item_ledger_id` |
| `item_holds` | 物品锁定记录（替代旧 JSON locks） | `item_hold_id` |

**小程序需要适配的字段变更**：

| 旧字段名 | 新字段名 | 说明 |
|----------|----------|------|
| `item_instance_id` | `item_id` | 物品主键 |
| `instance_events` | `item_ledger` | 事件记录 → 账本记录 |
| `locks` (JSON) | `item_holds` (关联表) | 锁定机制 |

### 1.2 资产双录升级

所有 `BalanceService.changeBalance` 调用（18个调用点）已传入 `counterpart_account_id`，实现完整双录记账：

| 业务场景 | 对手方 |
|----------|--------|
| 抽奖消耗积分 | SYSTEM_BURN |
| 抽奖奖励积分/材料 | SYSTEM_MINT |
| 消费奖励积分 | SYSTEM_MINT |
| 材料转换扣减/入账 | SYSTEM_BURN / SYSTEM_MINT |
| 交易结算 | 买方/卖方账户 |
| 管理员调账 | SYSTEM_RESERVE |
| 客服补偿 | SYSTEM_RESERVE |

### 1.3 Web 管理后台（已完成）

- W1-W10 全部完成（会话队列、GM工具、8Tab用户面板、工单系统等）
- ContentAPI 9个方法全部实现
- composables 全部导出

---

## 二、小程序需要对接的 API 清单

### 2.1 背包系统 API

```
GET    /api/v4/backpack/items                    # 获取用户背包物品列表
GET    /api/v4/backpack/items/:item_id           # 获取物品详情
POST   /api/v4/backpack/items/:item_id/redeem    # 物品核销
GET    /api/v4/backpack/items/:item_id/redeem/refresh-qr  # 刷新核销二维码
POST   /api/v4/backpack/items/:item_id/use       # 使用物品
GET    /api/v4/backpack/items/:item_id/timeline   # 物品时间线
```

**注意**：路由参数统一为 `:item_id`（不再是 `:item_instance_id`）

### 2.2 客服聊天 API

```
POST   /api/v4/system/chat/sessions              # 创建会话
POST   /api/v4/system/chat/sessions/:id/message   # 发送消息
GET    /api/v4/system/chat/sessions/:id/messages   # 获取历史消息
POST   /api/v4/system/chat/sessions/:id/rate       # 满意度评分
GET    /api/v4/system/chat/issues                  # 用户查看工单列表
```

### 2.3 WebSocket 事件

| 事件名 | 方向 | 数据 | 小程序处理 |
|--------|------|------|-----------|
| `new_message` | Server→Client | `{ session_id, message }` | 追加消息 |
| `session_update` | Server→Client | `{ session_id, status }` | 更新状态 |
| `satisfaction_request` | Server→Client | `{ session_id }` | 显示评分卡片 |
| `session_closed` | Server→Client | `{ session_id }` | 关闭界面 |

### 2.4 字段名权威清单

**原则：后端返回 snake_case，小程序直接使用，禁止 camelCase 映射**

| 业务域 | 字段名 | 类型 | 说明 |
|--------|--------|------|------|
| 物品 | `item_id` | bigint | 物品主键 |
| 物品 | `item_name` | string | 物品名称 |
| 物品 | `item_type` | enum | voucher/product/collectible |
| 物品 | `status` | enum | available/locked/used/expired/destroyed |
| 物品 | `tracking_code` | string | 追踪码（如 TRK-V-20260222-a1b2c3） |
| 物品 | `rarity_code` | enum | common/uncommon/rare/epic/legendary |
| 物品 | `owner_user_id` | bigint | 当前持有者 |
| 会话 | `customer_service_session_id` | bigint | 会话主键 |
| 会话 | `status` | enum | waiting/assigned/active/closed |
| 会话 | `satisfaction_score` | int/null | 满意度评分 |
| 消息 | `chat_message_id` | bigint | 消息主键 |
| 消息 | `sender_type` | enum | user/admin/system |
| 消息 | `message_type` | enum | text/image/system |
| 消息 | `content` | string | 消息内容 |
| 消息 | `temp_message_id` | string | 客户端临时ID |
| 工单 | `issue_id` | bigint | 工单主键 |
| 工单 | `issue_type` | enum | asset/trade/lottery/item/account/... |
| 工单 | `status` | enum | open/processing/resolved/closed |

---

## 三、后端待完成项（不影响小程序对接）

以下是后端仍在推进但不阻塞小程序开发的工作：

| 项目 | 说明 | 影响 |
|------|------|------|
| 历史数据 source_ref_id 回填 | 2909个历史抽奖物品缺少 source_ref_id | 不影响新物品，仅影响历史数据追溯 |
| 对账定时任务 | 对账脚本未配置 cron 自动执行 | 不影响业务功能 |
| DIAMOND BIGINT 溢出标记 | 已标记 is_invalid=1 | 已处理 |
| 资产全局守恒验证 | 双录升级后需重新验证 SUM(delta_amount)=0 | 待新交易数据验证 |

---

## 四、认证方式

- JWT Token 认证
- 开发阶段验证码固定为 `123456`
- 测试账号：`13612227930`（user_id=31，同时具备用户和管理员权限）
- Token 通过 `Authorization: Bearer <token>` 传递

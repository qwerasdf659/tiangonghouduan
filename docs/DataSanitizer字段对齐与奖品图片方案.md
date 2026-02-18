# DataSanitizer 字段对齐 & 奖品图片展示方案

> **文档日期**: 2026-02-18  
> **数据库实查时间**: 2026-02-18，连接 `restaurant_points_dev` 库真实验证  
> **涉及文件**: `services/DataSanitizer.js`（1454行）  
> **状态**: 已拍板（2026-02-18）

---

## 一、背景

前端审计发现两个待后端确认的问题：

| 编号 | 问题 | 来源 |
|------|------|------|
| B1 | DataSanitizer 6 个方法读取源字段名与数据库主键不匹配 | 前端对接审计 |
| B2 | `icon` 字段移除后，奖品图片如何展示 | 前端对接审计 |

---

## 二、B1：DataSanitizer 源字段读取对齐

### 2.1 设计前提（已确认）

- DataSanitizer **输出层统一使用通用 `id` 字段名**，这是商业安全设计，防止用户抓包推断数据库表结构
- 需要修正的是：方法内部从 Sequelize 查询结果**读取数据时引用的源字段名**，必须与数据库真实主键一致

### 2.2 逐方法审查结果（数据库实查）

数据库真实主键通过 `SHOW COLUMNS FROM xxx WHERE Field LIKE '%id%'` 确认：

| # | 方法 | 当前源读取 | 数据库真实主键 | 问题 | 生产调用 |
|---|------|-----------|--------------|------|---------|
| 1 | `sanitizeUser()` L273 | `user.id` | `users.user_id` (INT PRI) | 数据库无 `id` 字段，读取值为 undefined | 无 |
| 2 | `sanitizeChatSessions()` L490 | `sessionData.customer_service_session_id` | `customer_service_sessions.customer_service_session_id` (BIGINT PRI) | **已正确** | 无 |
| 3 | `sanitizeMarketProducts()` L653 | `product.id` | `market_listings.market_listing_id` (BIGINT PRI) | 数据库无 `id` 字段，读取值为 undefined | 无 |
| 4 | `sanitizePointsRecords()` L604 | `record.id` | `asset_transactions.asset_transaction_id` (BIGINT PRI) | 数据库无 `id` 字段，读取值为 undefined | 无 |
| 5 | `sanitizeTransactionRecords()` L860 | `record.id` | `asset_transactions.asset_transaction_id` (BIGINT PRI) | 同上 | 无 |
| 6 | `sanitizeInventory()` L189 | `item.inventory_id` | `item_instances.item_instance_id` (BIGINT PRI) | 数据库无 `inventory_id` 字段 | **有** — `routes/v4/backpack/index.js:171` |

已正确对齐的方法（源读取无需改动）：

| 方法 | 源读取 | 输出 | 备注 |
|------|--------|------|------|
| `sanitizePrizes()` | `prize.lottery_prize_id` | `lottery_prize_id` → **需改为 `id`**（决策 3） | 输出字段名需改 |
| `sanitizeAnnouncements()` | `announcement.announcement_id` | `id` | 无需改动 |
| `sanitizeExchangeMarketItems()` | `item.exchange_item_id` | `id` | 无需改动 |
| `sanitizeExchangeMarketOrders()` | `order.exchange_record_id` | `id` | 无需改动 |
| `sanitizeFeedbacks()` | `feedback.feedback_id` | `id` | 无需改动 |

### 2.3 修改方案（已拍板）

所有脱敏方法统一输出 `id` 字段名。共 6 处改动：

| # | 方法 | 改动内容 | 类型 |
|---|------|---------|------|
| 1 | `sanitizeUser()` | `id: user.id` → `id: user.user_id` | 源字段修正 |
| 2 | `sanitizeMarketProducts()` | `id: product.id` → `id: product.market_listing_id` | 源字段修正 |
| 3 | `sanitizePointsRecords()` | `id: record.id` → `id: record.asset_transaction_id` | 源字段修正 |
| 4 | `sanitizeTransactionRecords()` | `id: record.id` → `id: record.asset_transaction_id` | 源字段修正 |
| 5 | `sanitizeInventory()` | `inventory_id: item.inventory_id` → `id: item.item_instance_id` | 源字段修正 + 输出字段名统一（决策 1 ✅ 选 A） |
| 6 | `sanitizePrizes()` | `lottery_prize_id: prize.lottery_prize_id` → `id: prize.lottery_prize_id` | 输出字段名统一（决策 3 ✅ 选 B） |

`sanitizeChatSessions()` 已正确（源读取 `customer_service_session_id`，输出 `id`），无需改动。

---

## 三、B2：奖品图片展示方案

### 3.1 数据库实际数据（2026-02-18 实查）

**lottery_prizes 表**（36条数据）：

| 指标 | 值 |
|------|---|
| 总记录数 | 36 |
| `image_resource_id` 不为 NULL | **2 条**（均为测试种子数据） |
| `image_resource_id` 为 NULL | **34 条**（全部正式业务数据） |

有图片的2条记录：

| lottery_prize_id | prize_name | image_resource_id | file_path |
|-----------------|------------|-------------------|-----------|
| 142 | [测试]紫水晶*1 | 74 | test-seeds/lottery/prize-iphone.jpg |
| 143 | [测试]蓝水晶碎片*5 | 75 | test-seeds/lottery/prize-coupon.jpg |

**image_resources 表**（8条数据，全部为测试种子）：

| image_resource_id | file_path | 关联业务 |
|-------------------|-----------|---------|
| 68-73 | test-seeds/exchange/*.jpg | exchange_items 种子数据 |
| 74-75 | test-seeds/lottery/*.jpg | lottery_prizes 种子数据 |

**exchange_items 表**：
- 大量记录 `primary_image_id = NULL`
- 仅6条种子数据有图片（exchange_item_id: 998-1003）

### 3.2 后端现有图片架构

项目图片存储架构（2026-01-08 拍板）：

```
数据库: 仅存对象 key (如 prizes/xxx.jpg)
    ↓
API 层: ImageUrlHelper.getImageUrl(objectKey)
    ↓
输出: Sealos 公网端点直连 URL (不使用 CDN)
    例: https://objectstorageapi.bja.sealos.run/br0za7uc-tiangong/prizes/xxx.jpg
```

各表图片字段现状：

| 模型 | 图片字段 | 关联方式 | URL 生成 |
|------|---------|---------|---------|
| `LotteryPrize` | `image_resource_id` (INT FK) | `belongsTo(ImageResources, { as: 'image' })` | 通过 `toSafeJSON()` |
| `ExchangeItem` | `primary_image_id` (INT FK) | `belongsTo(ImageResources, { as: 'primaryImage' })` | 通过 `toSafeJSON()` |
| `ItemTemplate` | `image_url` / `thumbnail_url` (VARCHAR) | 直接存 URL 字符串 | 直接返回 |
| `ItemInstance` | 无 | — | — |

### 3.3 `sanitizePrizes` 当前输出 vs 需要增强

**当前输出**（L114-137）：

```javascript
{
  lottery_prize_id: prize.lottery_prize_id,
  prize_name: prize.prize_name,
  // ... 其他字段
  image_resource_id: prize.image_resource_id,  // ← 只返回 ID 号，无 URL
}
```

**对比 `sanitizeExchangeMarketItems` 已有实现**（L1276-1354）：
- include `primaryImage` 关联
- 调用 `toSafeJSON()` 生成安全 URL
- 输出完整 `primary_image` 对象：`{ id, url, mime, thumbnail_url }`

奖品脱敏方法缺少这一步：查询时没有 include 图片关联，也没有生成 URL。

### 3.4 方案

**策略：图片优先 + emoji 兜底（两层）**

```
前端展示逻辑:
  if (prize.image && prize.image.url)  → 显示 Sealos 图片
  else                                  → 显示 emoji (PRIZE_ICON_MAP[prize_type])
```

**后端改动**（2处）：

1. **奖品查询 Service**：查询 `lottery_prizes` 时 include 图片关联

```javascript
include: [{ model: ImageResources, as: 'image', required: false }]
```

2. **`sanitizePrizes` 方法增强**：参照 `sanitizeExchangeMarketItems` 现有实现，将 `image_resource_id` 转为完整图片对象

```javascript
// 输出变更：
// 之前: image_resource_id: prize.image_resource_id
// 之后: image_resource_id: prize.image_resource_id,
//       image: prize.image ? { id: ..., url: ..., mime: ..., thumbnail_url: ... } : null
```

**前端改动**：

- 抽奖转盘/奖品列表页面增加条件判断：有 `image.url` 显示图片，否则用 emoji
- 保留现有 `PRIZE_ICON_MAP` 作为兜底

### ✅ 决策 2（已拍板：选 A）

> 34 条正式奖品暂不补图片，全部走 emoji 兜底。后端先上图片输出能力，运营按需补充。

### ✅ 决策 3（已拍板：选 B）

> `sanitizePrizes` 输出字段名改为 `id`，与所有其他脱敏方法统一。前端抽奖相关页面需适配 `lottery_prize_id` → `id`。

---

## 四、拍板结果汇总

| 决策 | 问题 | 结果 |
|------|------|------|
| **决策 1** | `sanitizeInventory` 输出字段名 | ✅ **选 A** — 统一为 `id` |
| **决策 2** | 34 条正式奖品无图片 | ✅ **选 A** — 先 emoji 兜底，后续运营按需补图 |
| **决策 3** | `sanitizePrizes` 输出字段名 | ✅ **选 B** — 统一为 `id` |

---

## 五、后端数据库项目工作清单

以下全部在 **后端项目（本仓库）** 中完成，不依赖前端。

### 5.1 B1 — DataSanitizer 源字段对齐 + 输出统一 `id`

| # | 文件 | 改动 |
|---|------|------|
| 1 | `services/DataSanitizer.js` | `sanitizeUser()` L273：`id: user.id` → `id: user.user_id` |
| 2 | `services/DataSanitizer.js` | `sanitizeMarketProducts()` L653：`id: product.id` → `id: product.market_listing_id` |
| 3 | `services/DataSanitizer.js` | `sanitizePointsRecords()` L604：`id: record.id` → `id: record.asset_transaction_id` |
| 4 | `services/DataSanitizer.js` | `sanitizeTransactionRecords()` L860：`id: record.id` → `id: record.asset_transaction_id` |
| 5 | `services/DataSanitizer.js` | `sanitizeInventory()` L189：`inventory_id: item.inventory_id` → `id: item.item_instance_id` |
| 6 | `services/DataSanitizer.js` | `sanitizePrizes()` L115：`lottery_prize_id: prize.lottery_prize_id` → `id: prize.lottery_prize_id` |
| 7 | `tests/security/business-data-sanitizer.test.js` | mock 数据和断言中的字段名同步更新 |

### 5.2 B2 — 奖品查询增加图片关联输出

| # | 文件 | 改动 |
|---|------|------|
| 8 | 奖品查询 Service（调用 `LotteryPrize.findAll` 的位置） | 增加 `include: [{ model: ImageResources, as: 'image', required: false }]` |
| 9 | `services/DataSanitizer.js` `sanitizePrizes()` | 参照 `sanitizeExchangeMarketItems` 已有实现，增加 `image` 对象输出（含 Sealos URL） |

### 5.3 后端输出 API 字段变更总结

供前端对接参考——后端改完后，各 API 响应字段的变化：

| API 场景 | 字段变更 | 影响说明 |
|----------|---------|---------|
| 用户信息 | 无变化（输出仍为 `id`，值从 undefined 修正为实际 user_id） | 前端引用 `id` 不变 |
| 聊天会话 | 无变化 | 已正确 |
| 交易市场商品 | 无变化（输出仍为 `id`，值从 undefined 修正为实际 market_listing_id） | 前端引用 `id` 不变 |
| 积分记录 | 无变化（输出仍为 `id`，值从 undefined 修正为实际 asset_transaction_id） | 前端引用 `id` 不变 |
| 交易记录 | 无变化（同上） | 前端引用 `id` 不变 |
| 背包物品 | `inventory_id` → `id` | **前端需适配** |
| 奖品列表 | `lottery_prize_id` → `id`；新增 `image` 对象（可为 null） | **前端需适配** |

---

## 六、微信小程序前端项目工作清单

以下全部在 **前端项目** 中完成，需等后端实施完毕后对接。

### 6.1 B1 — 字段名适配

| # | 页面/文件 | 改动 |
|---|----------|------|
| 1 | 背包页面（backpack 相关 `.ts` + `.wxml`） | 所有引用 `inventory_id` 的地方改为 `id` |
| 2 | 抽奖转盘/奖品列表（lottery 相关 `.ts` + `.wxml`） | 所有引用 `lottery_prize_id` 的地方改为 `id` |

其余页面（user/chat/exchange/feedback/market/transaction）引用的输出字段名本身就是 `id`，无需改动。

### 6.2 B2 — 奖品图片展示

| # | 页面/文件 | 改动 |
|---|----------|------|
| 3 | 抽奖转盘组件 | 增加条件判断：`prize.image && prize.image.url` 存在时显示 `<image>` 组件，否则显示 emoji |
| 4 | 奖品列表/中奖结果展示 | 同上逻辑 |
| 5 | `PRIZE_ICON_MAP` 保留 | 作为 emoji 兜底映射，不删除 |

前端展示伪代码：

```html
<!-- wxml -->
<block wx:if="{{prize.image && prize.image.url}}">
  <image src="{{prize.image.thumbnail_url || prize.image.url}}" />
</block>
<block wx:else>
  <text>{{PRIZE_ICON_MAP[prize.prize_type] || '🎁'}}</text>
</block>
```

---

## 七、实施依赖关系

```
后端 5.1 (B1字段对齐)  ──┐
                          ├──→  前端 6.1 (字段名适配)
后端 5.2 (B2图片输出)  ──┘
                          └──→  前端 6.2 (图片展示)

后端先行，前端等后端部署后联调。
```

| 阶段 | 负责方 | 内容 | 前置条件 |
|------|--------|------|---------|
| 阶段 1 | **后端** | 完成 5.1 + 5.2 全部改动、单元测试通过 | 无 |
| 阶段 2 | **前端** | 完成 6.1 字段名适配 + 6.2 图片展示 | 后端阶段 1 部署完成 |
| 阶段 3 | **联调** | 前后端联调验证 | 前端阶段 2 完成 |

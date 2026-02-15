# 🔴 后端需求：交易记录API补充 description / title 字段输出

> **日期**: 2026-02-16
> **优先级**: 高
> **发起方**: 微信小程序前端
> **状态**: 待后端处理
> **涉及文件**: `routes/v4/assets/transactions.js` 第 61-76 行

---

## 一、需求背景

前端积分明细页（`pages/points-detail`）和积分活动记录页（`pages/records/trade-upload-records`）需要展示每条交易记录的 **标题** 和 **描述**。

根据后端数据库验证：

- `asset_transactions.meta` 字段（JSON格式）中存储了 `title` 和 `description`
- `meta.title` 覆盖率 **79.2%**（7,351 / 9,281 条 POINTS 流水）
- `meta.description` 覆盖率 **91.2%**（8,463 / 9,281 条 POINTS 流水）

**但当前路由层的 map 输出中未包含这两个字段。**

---

## 二、当前路由层输出（缺少 description / title）

文件：`routes/v4/assets/transactions.js` 第 61-76 行

```javascript
// 当前版本（缺少 description / title）
transactions: result.transactions.map(t => ({
  transaction_id: t.transaction_id,
  asset_code: t.asset_code,
  delta_amount: Number(t.delta_amount),
  balance_before: Number(t.balance_before),
  balance_after: Number(t.balance_after),
  business_type: t.business_type,
  created_at: t.created_at
}))
```

---

## 三、期望路由层输出（新增 description / title）

```javascript
// 修改后版本（新增2个字段）
transactions: result.transactions.map(t => ({
  transaction_id: t.transaction_id,
  asset_code: t.asset_code,
  delta_amount: Number(t.delta_amount),
  balance_before: Number(t.balance_before),
  balance_after: Number(t.balance_after),
  business_type: t.business_type,
  description: t.meta?.description || t.meta?.title || null,  // ⭐ 新增：交易描述
  title: t.meta?.title || null,                                // ⭐ 新增：交易标题
  created_at: t.created_at
}))
```

---

## 四、字段说明

| 新增字段 | 类型 | 数据来源 | 回退策略 | 说明 |
|---------|------|---------|---------|------|
| `description` | string \| null | `meta.description` | 无 description 时回退到 `meta.title`，都无则 null | 交易描述文本，前端直接展示 |
| `title` | string \| null | `meta.title` | 无 title 则 null | 交易标题文本，前端直接展示 |

---

## 五、前端使用方式

前端已完成适配代码，直接使用后端返回的字段，无映射：

```
标题显示优先级：title → description → '积分记录'（前端硬编码回退文案）
描述显示：直接使用 description 字段
```

---

## 六、影响范围

- **后端修改量**：1个文件（`routes/v4/assets/transactions.js`），map 函数中新增2行
- **数据库层**：无需修改（`meta` 字段数据已存在）
- **其他API**：不影响
- **向后兼容**：新增字段，不影响现有调用方

---

## 七、验证方法

修改完成后，请用以下SQL确认数据可用性：

```sql
-- 验证 meta.title 和 meta.description 覆盖率
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN JSON_EXTRACT(meta, '$.title') IS NOT NULL THEN 1 ELSE 0 END) as has_title,
  SUM(CASE WHEN JSON_EXTRACT(meta, '$.description') IS NOT NULL THEN 1 ELSE 0 END) as has_description
FROM asset_transactions
WHERE asset_code = 'POINTS';
```

API测试：

```
GET /api/v4/assets/transactions?asset_code=POINTS&page=1&page_size=5
Authorization: Bearer <valid_jwt_token>

# 期望响应中每条记录包含 description 和 title 字段
```

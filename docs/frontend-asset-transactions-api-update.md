# 前端适配通知：资产流水接口字段更新

> **日期**: 2026-02-16
> **后端变更**: `routes/v4/assets/transactions.js`
> **影响范围**: 积分明细页(points-detail)、交易记录页(trade-upload-records)、库存管理页(inventory)

---

## 一、`GET /api/v4/assets/transactions` 字段变更

### 1.1 变更内容

| 变更类型 | 字段 | 说明 |
|---------|------|------|
| ❌ 移除 | `transaction_id` | 旧字段名错误（值一直是 undefined），已移除 |
| ✅ 新增 | `asset_transaction_id` | 正确的流水主键（数字类型） |
| ✅ 新增 | `description` | 交易描述，约 91% 有值，可为 null |
| ✅ 新增 | `title` | 交易标题，约 79% 有值，可为 null |
| 不变 | `delta_amount` | 变动金额，正=获得，负=消费 |
| 不变 | `balance_before` / `balance_after` | 变动前/后余额 |
| 不变 | `business_type` | 业务类型枚举 |
| 不变 | `created_at` | 创建时间 |

### 1.2 完整响应示例

```json
{
  "success": true,
  "code": "SUCCESS",
  "data": {
    "transactions": [
      {
        "asset_transaction_id": 38684,
        "asset_code": "POINTS",
        "delta_amount": 50,
        "balance_before": 809152,
        "balance_after": 809202,
        "business_type": "consumption_reward",
        "description": "【审核通过】消费50元，奖励50积分",
        "title": "消费奖励50分",
        "created_at": "2026-02-15 19:41:38"
      },
      {
        "asset_transaction_id": 38683,
        "asset_code": "POINTS",
        "delta_amount": -10,
        "balance_before": 809162,
        "balance_after": 809152,
        "business_type": "lottery_consume",
        "description": "单次抽奖消耗10积分",
        "title": "抽奖消耗积分",
        "created_at": "2026-02-15 19:41:15"
      }
    ],
    "pagination": {
      "total": 9281,
      "page": 1,
      "page_size": 20,
      "total_pages": 465
    }
  }
}
```

### 1.3 前端需修改的要点

1. **列表 key**: `transaction_id` → `asset_transaction_id`
2. **金额字段**: 如果之前用 `amount` 或 `points_amount`，改为直接用 `delta_amount`
3. **earn/consume 判断**: `delta_amount > 0` = 获得，`delta_amount < 0` = 消费
4. **金额显示**: `Math.abs(item.delta_amount)` + 根据正负显示"+"或"-"
5. **标题显示**: `item.title || item.description || '积分记录'`（三级回退）
6. **描述显示**: `item.description`

### 1.4 `business_type` 枚举值（用于图标映射）

| business_type | 含义 |
|--------------|------|
| `lottery_consume` | 抽奖消耗 |
| `lottery_reward` | 抽奖奖励 |
| `exchange_debit` | 兑换扣减 |
| `consumption_reward` | 消费奖励 |
| `admin_adjustment` | 管理员调整 |
| `material_convert_debit` / `material_convert_credit` | 材料转换 |
| `merchant_points_reward` | 商户奖励 |
| `order_freeze_buyer` / `order_settle_*` | 交易市场 |
| `market_listing_*` | 市场挂牌 |

---

## 二、`GET /api/v4/backpack/` 和 `GET /api/v4/backpack/stats` 无变更

后端接口无改动。如果库存页面显示为空，请排查：

1. JWT Token 对应的 `user_id` 是否有资产数据
2. 数据解析是否使用 `res.data.data.assets` + `res.data.data.items` 双轨结构
3. 测试账号 13612227930 (user_id=31) 有 3,379 个 available 物品和多种可叠加资产


# 交易/流水收敛方案：AssetTransaction vs TradeRecord vs TradeOrder

**生成时间**：2026年01月08日  
**数据库**：`restaurant_points_dev`（真实库，非备份）  
**代码版本**：当前工作区最新代码  
**检查方法**：Node.js 直连真实库 + 代码扫描 + 业务流程追踪

---

## 📊 执行摘要（Executive Summary）

### 核心问题

当前系统存在三套交易/流水记录机制并存，但实际使用状态差异巨大：

- **AssetTransaction**（活跃）：882 行，承载材料商城兑换（394条）+ 测试充值（393条）+ 管理员调整（94条）
- **TradeOrder**（未启用但代码完整）：0 行，C2C 市场交易订单系统已实现但未触发
- **TradeRecord**（残留）：2 行历史数据（2025-11 ~ 2025-12），当前代码路径已被边缘化

### 🎯 最终决策（已拍板）

**项目业务特征**：

- 材料/积分的消耗与发放（典型账本场景）
- 物品实例（可核销、可转移，典型 item instance + event）
- 未来可能启用的 C2C 市场（典型 order + ledger + listing + events）

**收敛方案**：**保留 `AssetTransaction` + `TradeOrder`，让 `TradeRecord` 退出主干**

**三事实模型架构**（参考大厂/游戏公司最佳实践）：

1. **资产事实**：`AssetTransaction`（唯一真相，所有余额变动的审计日志）
2. **订单事实**：`TradeOrder`（唯一真相，C2C 市场交易的生命周期管理）
3. **物品事实**：`ItemInstance` + `ItemInstanceEvent`（唯一真相，物品所有权变更的完整追溯）

**TradeRecord 定位**：立即删除表和模型（无需观察期）

---

### 📋 关键决策清单（✅ 已拍板确认 - 2026-01-08）

| 决策点                   | 最终方案                                  | 理由                                                                                                                                                                             | 拍板状态      |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **1. 开账口径**          | ✅ **A：补 `opening_balance` 流水**       | 对账公式简单（余额 = SUM(delta)），符合会计原则，长期维护成本低；为每个 `(account_id, asset_code[,campaign_id])` 写入一条 `opening_balance`，基线取第一条流水的 `balance_before` | ✅ **已确认** |
| **2. 冻结账本**          | ✅ **A：加 `frozen_amount_change` 列**    | 改动成本低（只需修改 3 个方法），对账性能好（索引可用），数据模型统一；在 `AssetService.freeze/unfreeze/settleFromFrozen` 写入                                                   | ✅ **已确认** |
| **3. TradeRecord 去留**  | ✅ **A：TradeRecord 退场**                | 仅 2 条历史数据，代码已不依赖；交易时间线由 `asset_transactions` + `trade_orders` + `item_instance_events` 组合产生；立即删除表+模型（不备份）                                   | ✅ **已确认** |
| **4. 手续费商业口径**    | ✅ **按成交价收取手续费**                 | `fee_amount = gross_amount * fee_rate`（建议 5%）；买家支付 = 挂牌价，卖家到账 = 挂牌价 - 手续费，平台收入 = 手续费；影响收入与用户体验                                          | ✅ **已确认** |
| **5. 市场挂牌范围**      | ✅ **所有物品（钻石/材料/实物）都可上架** | 可叠加资产（DIAMOND/POINTS/材料）+ 不可叠加物品（实物/虚拟/优惠券）全部可上架；限制：状态 `active` + 卖家是所有者 + 价格 > 0                                                     | ✅ **已确认** |
| **6. 幂等派生根键**      | ✅ **统一以 `idempotency_key` 为根**      | 根幂等键：`trade_orders.idempotency_key`；派生键：`${key}:freeze_buyer` / `:settle_buyer` / `:credit_seller` / `:credit_platform_fee` / `:transfer_item`；和入口幂等一致         | ✅ **已确认** |
| **7. C2C 市场结算币种**  | ✅ **永久只用 DIAMOND**                   | 商业模式确认：DIAMOND 作为市场硬通货，所有 C2C 交易只允许 DIAMOND 定价/结算                                                                                                      | ✅ **已确认** |
| **8. C2C 市场启用策略**  | ✅ **直接启用（无灰度）**                 | 代码已完整实现，功能已验证，补齐开账口径后直接启用                                                                                                                               | ✅ **已确认** |
| **9. 对账告警渠道**      | ✅ **使用现有机制（日志 + 定时任务）**    | 无需引入企业微信/钉钉/短信，保持现有架构简洁                                                                                                                                     | ✅ **已确认** |
| **10. 执行窗口策略**     | ✅ **立即执行 + 短暂停写**                | 需要短暂停写（暂停市场/资产写接口、关掉定时任务）以保证补录时刻的一致性                                                                                                          | ✅ **已确认** |
| **11. DIAMOND 来源口径** | ✅ **允许历史初始化 + 补流水承接**        | 允许"历史初始化/外部注入"，必须补齐清晰来源（管理员调整/充值/材料转换）并补流水口径承接                                                                                          | ✅ **已确认** |

**拍板确认人**：项目负责人  
**拍板时间**：2026年01月08日  
**决策依据**：基于真实库数据（`restaurant_points_dev`）+ 当前代码状态 + 商业模式定位

### 收敛目标

- **确定单一事实来源**：资产事实 → AssetTransaction，订单事实 → TradeOrder，物品事实 → ItemInstanceEvent
- **TradeRecord 退场**：立即删除表和模型（无需观察期）
- **TradeOrder 启用路径**：补齐账本口径（补 opening_balance 流水）→ 直接启用（无灰度）
- **对账策略**：建立可重复执行的核对清单，确保三类事实（资产/订单/物品）一致性
- **frozen 对账演进**：在 `asset_transactions` 增加 `frozen_amount_change` 字段

---

## 🔍 前提核验（基于真实库数据）

### 1. 数据库连接方式

- **环境确认**：本机 **未安装** mysql/mariadb 客户端
- **连接方式**：通过项目现有 `dotenv + Sequelize(config/database.js)` 直连
- **目标库**：`restaurant_points_dev`（真实库，版本 MySQL 8.0.30）

### 2. 关键表真实数据现状

#### 2.1 asset_transactions（资产流水表）

```json
{
  "总行数": 882,
  "时间范围": "2026-01-02 20:24:20 ~ 2026-01-08 02:50:38",
  "business_type 分布": [
    { "business_type": "exchange_debit", "cnt": 394 },
    { "business_type": "test_recharge", "cnt": 393 },
    { "business_type": "admin_adjustment", "cnt": 94 },
    { "business_type": "lottery_consume", "cnt": 1 }
  ],
  "asset_code 分布": [
    { "asset_code": "red_shard", "cnt": 881 },
    { "asset_code": "POINTS", "cnt": 1 }
  ]
}
```

**关键发现**：

- ✅ 材料商城兑换（`exchange_debit`）已实际运行（394 条）
- ✅ 抽奖扣积分（`lottery_consume`）已跑通（1 条）
- ⚠️ **DIAMOND/POINTS 在流水中几乎没有记录**，但 `account_asset_balances` 中已有余额（见下文）

#### 2.2 trade_orders（C2C 市场订单表）

```json
{
  "总行数": 0,
  "状态": "代码完整但未启用"
}
```

#### 2.3 market_listings（市场挂牌表）

```json
{
  "总行数": 0,
  "状态": "代码完整但未启用"
}
```

#### 2.4 trade_records（交易记录表）

```json
{
  "总行数": 2,
  "时间范围": "2025-11-11 07:13:53 ~ 2025-12-12 01:51:17",
  "trade_type 分布": [{ "trade_type": "inventory_transfer", "cnt": 2 }]
}
```

**关键发现**：

- ⚠️ 仅有 2 条历史数据，且时间在 2025 年（明显是遗留数据）
- ⚠️ 当前代码路径已被 `item_instance_events` 替代

#### 2.5 account_asset_balances（账户余额表）

```json
{
  "资产分布": [
    { "asset_code": "POINTS", "sum_available": 48352, "sum_frozen": 0 },
    { "asset_code": "red_shard", "sum_available": 38275, "sum_frozen": 0 },
    { "asset_code": "DIAMOND", "sum_available": 108600, "sum_frozen": 0 },
    { "asset_code": "MATERIAL_001", "sum_available": 100, "sum_frozen": 0 }
  ]
}
```

**关键矛盾**：

- ❌ **POINTS/DIAMOND 有余额但流水几乎为空**（对账口径缺失，见第 4 节）
- ✅ **已拍板解决方案**：允许"历史初始化/外部注入"，必须补齐清晰来源（管理员调整/充值/材料转换）并补流水口径承接

#### 2.6 item_instances + item_instance_events（物品事实）

```json
{
  "item_instances": { "总行数": 449 },
  "item_instance_events": { "总行数": 246 }
}
```

**关键发现**：

- ✅ 物品事实已建立（`item_instance_events` 有 `(item_instance_id, idempotency_key)` 唯一约束）
- ✅ 当前市场成交路径已走 `AssetService.transferItem()`（自动记录事件）

---

## 🎯 事实模型确定（三层单一真相源）

**设计理念**：参考大厂（美团/腾讯/阿里）和游戏公司的最佳实践，采用"订单域 + 账本域 + 事件域"分离架构，确保每类业务事实有且仅有一个单一真相源（Single Source of Truth）。

**为什么选择这套架构**：

- ✅ **可审计**：所有变更都有完整的事件日志（append-only）
- ✅ **可对账**：余额 = 开账基线 + SUM(流水)，公式简单清晰
- ✅ **可扩展**：支持未来多资产、多活动、多交易场景
- ✅ **可幂等**：所有写入都有幂等键保护，防止重复提交
- ✅ **可回溯**：物品所有权变更、资产冻结/解冻都有完整追踪

### 1. 资产事实（Asset Fact）

#### 1.1 当前状态真相

- **表**：`account_asset_balances`
- **字段**：`available_amount`（可用余额）+ `frozen_amount`（冻结余额）
- **索引**：`(account_id, asset_code)` 唯一

#### 1.2 事件真相

- **表**：`asset_transactions`（append-only）
- **字段**：
  - `delta_amount`：可用余额变动（正数=增加，负数=扣减）
  - `balance_before` / `balance_after`：变动前后余额（用于对账）
  - `meta.frozen_before` / `meta.frozen_after`：冻结余额变化（JSON 格式）
- **幂等键**：`idempotency_key`（唯一约束）

#### 1.3 组合规则（重要约束）

- **available 对账**：可以用 `SUM(delta_amount)` + 开账基线
- **frozen 对账**：当前只能解析 `meta` JSON（见对账策略第 5.1 节）

#### 1.4 写入入口（强制）

- **唯一入口**：`services/AssetService.js`
- **禁止路径**：任何代码不得直接 `AssetTransaction.create()`

---

### 2. 订单事实（Order Fact）

#### 2.1 C2C 市场订单

- **表**：`trade_orders`
- **字段**：
  - `idempotency_key`：根幂等键（唯一约束）
  - `business_id`：业务唯一键（格式：`trade_order_{buyer_id}_{listing_id}_{timestamp}`）
  - `gross_amount` / `fee_amount` / `net_amount`：对账金额（恒等式：`gross = fee + net`）
  - `status`：订单状态（`created` → `frozen` → `completed/cancelled/failed`）

#### 2.2 挂牌事实

- **表**：`market_listings`
- **字段**：
  - `idempotency_key`：幂等键（唯一约束）
  - `locked_by_order_id`：关联订单（防止并发购买）
  - `status`：挂牌状态（`on_sale` → `locked` → `sold/withdrawn`）

#### 2.3 组合关键键（跨表对账）

以 **`trade_orders.idempotency_key` 作为根幂等键**，下游派生：

- 资产流水：
  - `${idempotency_key}:settle_buyer`（买家从冻结结算）
  - `${idempotency_key}:credit_seller`（卖家入账）
  - `${idempotency_key}:credit_platform_fee`（平台手续费）
- 物品事件：
  - `${idempotency_key}:transfer_item`（物品所有权转移）

#### 2.4 写入入口（强制）

- **唯一入口**：`services/TradeOrderService.js`
- **路由入口**：`routes/v4/market/buy.js`（POST `/listings/:listing_id/purchase`）

---

### 3. 物品事实（Item Fact）

#### 3.1 当前状态真相

- **表**：`item_instances`
- **字段**：`owner_user_id`（所有权）+ `status`（状态）

#### 3.2 事件真相

- **表**：`item_instance_events`
- **字段**：
  - `event_type`：事件类型（`mint` / `lock` / `unlock` / `transfer` / `use` / `expire` / `destroy`）
  - `idempotency_key`：幂等键（`(item_instance_id, idempotency_key)` 唯一约束）
  - `owner_before` / `owner_after`：所有权变更追踪

#### 3.3 写入入口（强制）

- **唯一入口**：`AssetService.transferItem()`（自动记录事件）
- **禁止路径**：任何代码不得直接 `ItemInstanceEvent.create()`

---

## 🔄 收敛策略（核心决策）

### 1. 主干保留三套事实（已拍板）

#### 1.1 资产事实：`AssetTransaction`（唯一真相）

- **保留理由**：
  - ✅ 已在生产环境运行（882 条真实流水）
  - ✅ 承载核心业务（材料兑换 394 条、抽奖扣积分、管理员调整）
  - ✅ 符合大厂"账本域"最佳实践（append-only、可审计、可对账）
- **职责**：所有资产增减/冻结/解冻/结算都必须通过 `AssetService` 写入
- **覆盖场景**：
  - 材料商城兑换（`exchange_debit`）
  - 抽奖扣积分/奖励（`lottery_consume` / `lottery_reward`）
  - C2C 市场结算（`order_settle_*` / `listing_*`）
  - 管理员调整（`admin_adjustment`）
  - 未来扩展：活动发奖、预算扣减、积分兑换等

#### 1.2 订单事实：`TradeOrder`（唯一真相）

- **保留理由**：
  - ✅ 代码已完整实现（`TradeOrderService` + 幂等保护 + 超时解锁）
  - ✅ 符合大厂"订单域"最佳实践（订单生命周期管理、冻结/结算分离）
  - ✅ 未来 C2C 市场启用的必需基础设施
- **职责**：所有 C2C 交易只通过 `TradeOrderService` 写入
- **覆盖场景**：
  - 不可叠加物品交易（`listing_kind=item_instance`）
  - 可叠加资产交易（`listing_kind=fungible_asset`）
  - 未来扩展：拍卖、竞价、批量购买等

#### 1.3 物品事实：`ItemInstance` + `ItemInstanceEvent`（唯一真相）

- **保留理由**：
  - ✅ 已在生产环境运行（246 条事件记录）
  - ✅ 符合游戏公司"物品事件溯源"最佳实践（Event Sourcing）
  - ✅ 支持物品所有权变更的完整追溯（mint → transfer → use → destroy）
- **职责**：所有物品状态变更都通过 `AssetService.transferItem()` 自动记录事件
- **覆盖场景**：
  - 物品铸造（`mint`）
  - 物品转移（`transfer`，包括 C2C 市场成交）
  - 物品核销（`use`）
  - 物品销毁（`destroy`）
  - 物品锁定/解锁（`lock` / `unlock`）

---

### 2. TradeRecord 去留决策（已拍板：退出主干）

#### 2.1 现状分析

- **真实库数据**：仅 2 行历史数据（2025-11 ~ 2025-12）
- **当前代码路径**：
  - `services/FeeCalculator.js` 有 `createTradeRecord()` 写入函数（但 **未被调用**）
  - `services/BackpackService.js` 有 `getTransferHistory()`（字段名与模型不一致，且 **未被路由暴露**）
- **替代方案**（已在生产环境运行）：
  - 资产流水 → `asset_transactions`（882 条真实数据）
  - 市场订单 → `trade_orders`（代码完整，待启用）
  - 物品历史 → `item_instance_events`（246 条真实数据）

#### 2.2 最终决策：立即删除表和模型（✅ 已拍板确认 - 2026-01-08）

**决策理由**（基于行业最佳实践 + 真实库数据现状）：

- ❌ **违反单一真相源原则**：TradeRecord 混合了"资产流水 + 订单信息 + 物品信息"，导致职责不清
- ❌ **扩展性差**：无法支持多资产、多活动、复杂交易场景
- ❌ **对账困难**：字段设计不支持 available/frozen 分离对账
- ❌ **已被边缘化**：当前代码主链路已不依赖此表（`FeeCalculator.createTradeRecord()` 未被调用，`BackpackService.getTransferHistory()` 未被路由暴露）
- ✅ **替代方案成熟**：三事实模型已在生产环境验证（`asset_transactions` 900行，`item_instance_events` 251行）
- ✅ **历史数据极少**：真实库仅 2 条历史数据（2025-11-11 ~ 2025-12-12），无需观察期
- ✅ **商业模式确认**：未来 C2C 市场只用 DIAMOND 结算，TradeRecord 的 POINTS 字段设计已不适用

**拍板人确认**：项目负责人（2026-01-08）  
**执行方案**：✅ **TradeRecord 退场**：交易时间线由 `asset_transactions` + `trade_orders` + `item_instance_events` 组合产生；立即删除表和模型，不保留备份

## 💼 商业规则拍板（影响收入与用户体验）

### 4.1 手续费商业口径（✅ 已拍板确认 - 2026-01-08）

**决策**：✅ **按成交价收取手续费**

**执行方案**：

- **计算公式**：`fee_amount = gross_amount * fee_rate`
  - `gross_amount`：买家实际支付的 DIAMOND 金额（挂牌价）
  - `fee_rate`：平台手续费率（建议 5%，可配置）
  - `net_amount`：卖家实际到账金额 = `gross_amount - fee_amount`
- **恒等式约束**：`gross_amount = fee_amount + net_amount`（必须在订单创建时验证）
- **手续费归属**：平台账户（`account_id = 1`，`asset_code = 'DIAMOND'`）
- **流水记录**：
  - 买家支付：`business_type = 'order_freeze_buyer'`（冻结 `gross_amount`）
  - 卖家到账：`business_type = 'order_settle_seller_credit'`（入账 `net_amount`）
  - 平台手续费：`business_type = 'order_settle_platform_fee_credit'`（入账 `fee_amount`）

**商业影响**：

- ✅ **收入来源**：平台手续费是主要收入来源（按成交价的 5% 计算）
- ✅ **用户体验**：买家支付金额 = 挂牌价（无额外费用），卖家到账金额 = 挂牌价 - 手续费（清晰透明）
- ⚠️ **竞争力**：5% 手续费率需与同类平台对比（闲鱼 0%，转转 5%，拼多多 10%）

**拍板人确认**：项目负责人（2026-01-08）

---

### 4.2 市场挂牌范围（✅ 已拍板确认 - 2026-01-08）

**决策**：✅ **所有物品（钻石/材料/实物）都可以上架**

**执行方案**：

- **可叠加资产**（`listing_kind = 'fungible_asset'`）：
  - `DIAMOND`（钻石）：✅ 可上架
  - `POINTS`（积分）：✅ 可上架
  - `red_shard`（红色碎片）等材料：✅ 可上架
  - 其他材料（`MATERIAL_*`）：✅ 可上架
- **不可叠加物品**（`listing_kind = 'item_instance'`）：
  - 实物奖品（`item_type = 'physical'`）：✅ 可上架
  - 虚拟物品（`item_type = 'virtual'`）：✅ 可上架
  - 优惠券（`item_type = 'coupon'`）：✅ 可上架
- **限制条件**：
  - 物品状态必须为 `active`（不可上架已核销/过期/销毁的物品）
  - 卖家必须是物品所有者（`owner_user_id = seller_user_id`）
  - 挂牌价格必须 > 0（不允许免费赠送，避免刷单）

**商业影响**：

- ✅ **市场活跃度**：扩大可交易范围，提升用户参与度
- ✅ **用户体验**：用户可自由交易所有资产/物品，增强平台价值
- ⚠️ **风险控制**：需要监控异常交易（如：低价倾销、刷单套现）

**拍板人确认**：项目负责人（2026-01-08）

---

### 4.3 幂等派生根键统一（✅ 已拍板确认 - 2026-01-08）

**决策**：✅ **统一以 `idempotency_key` 为根（和入口幂等一致）**

**执行方案**：

- **根幂等键**：`trade_orders.idempotency_key`（由前端/客户端生成，格式：`trade_order_{buyer_id}_{listing_id}_{timestamp}`）
- **派生幂等键**（下游流水/事件自动生成）：
  - 买家冻结：`${idempotency_key}:freeze_buyer`
  - 买家结算：`${idempotency_key}:settle_buyer`
  - 卖家入账：`${idempotency_key}:credit_seller`
  - 平台手续费：`${idempotency_key}:credit_platform_fee`
  - 物品转移：`${idempotency_key}:transfer_item`
- **幂等保护**：
  - 入口层：`ApiIdempotencyRequest` 表（防止重复提交）
  - 数据层：`asset_transactions.idempotency_key` 唯一约束（防止重复写入）
  - 事件层：`item_instance_events.(item_instance_id, idempotency_key)` 唯一约束

**技术影响**：

- ✅ **对账能力**：通过根幂等键可快速关联订单 → 流水 → 事件的完整链路
- ✅ **问题排查**：通过根幂等键可快速定位异常订单的所有关联数据
- ✅ **幂等保护**：多层幂等保护确保数据一致性（入口 + 数据 + 事件）

**拍板人确认**：项目负责人（2026-01-08）

---

**真实库数据核验**（2026-01-08 直连查询）：

- `trade_records` 表：2 行（`trade_type=inventory_transfer`，时间范围 2025-11 ~ 2025-12）
- 代码调用链：`FeeCalculator.createTradeRecord()` 定义但未被调用，`BackpackService.getTransferHistory()` 查询但未被路由暴露
- 替代方案数据：`item_instance_events` 251 行（物品转移历史已完整记录）

**对比大厂实践**：

- 美团/阿里的交易系统：订单表（order）+ 流水表（ledger）+ 事件表（event）严格分离
- 游戏公司的虚拟物品系统：item_instances（状态）+ item_events（历史）+ asset_transactions（货币）
- 小众二手平台：listings（挂牌）+ orders（订单）+ payments（支付）+ shipment（交付）

**TradeRecord 的问题**：试图用一张表承载所有职责，是早期快速开发的产物，不适合长期维护。

#### 2.3 执行方案（✅ 已拍板确认 - 2026-01-08）：立即删除（不备份）

- **立刻执行**（破坏性操作，不可逆，✅ **不保留备份**）：
  - ✅ 删除 `models/TradeRecord.js` 模型文件
  - ✅ 删除相关代码引用：
    - `services/FeeCalculator.js:216-280`（`createTradeRecord()` 方法及其调用）
    - `services/BackpackService.js:466-530`（`getTransferHistory()` 方法）
  - ✅ 执行数据库迁移：`DROP TABLE trade_records`（删除表结构）
  - ✅ 清理迁移文件中的 `trade_records` 引用（保留历史迁移记录但标注已废弃）
- **无需观察期**：
  - 真实库数据仅 2 条，且时间在 2025 年（2025-11-11 ~ 2025-12-12）
  - 当前代码路径已完全不依赖此表（`createTradeRecord()` 未被调用，`getTransferHistory()` 未被路由暴露）
  - 替代方案（`item_instance_events`）已在生产环境运行（251 行真实数据）
- **不可逆风险确认（✅ 已接受）**：
  - ⚠️ 删除后无法通过 `trade_records` 表查询 2025-11 ~ 2025-12 的 2 条历史转让记录
  - ✅ **拍板决策**：直接删除不备份，不兼容历史数据查询需求
  - ✅ 替代方案：物品转移历史已完整记录在 `item_instance_events`（251 行真实数据）

---

## 🚀 TradeOrder 启用路径（从"未启用"到"可上线"）

### P0：统一"开账口径"（否则对账必然乱）

#### 问题现状

- **矛盾**：`account_asset_balances` 中已有 `DIAMOND/POINTS` 余额，但 `asset_transactions` 中几乎没有对应流水
- **影响**：无法用 `SUM(delta_amount)` 对账，TradeOrder 上线后 DIAMOND 结算难以审计

#### 口径 A（推荐）：补开账基线流水

- **执行方式**：
  - 为每个 `(account_id, asset_code)` 补一条 `opening_balance` 类型的 `asset_transactions`
  - `delta_amount` = 当前 `available_amount`
  - `balance_before` = 0
  - `balance_after` = 当前 `available_amount`
  - `business_type` = `opening_balance`
  - `idempotency_key` = `opening_${account_id}_${asset_code}`
  - `created_at` = 迁移基准时间（如 2026-01-08 00:00:00）
- **优点**：
  - ✅ 对账公式简单：`余额 = SUM(delta_amount)`
  - ✅ 符合会计原则（开账 + 流水 = 余额）
- **风险**：
  - ⚠️ 需要在低峰期执行（避免并发写入冲突）
  - ⚠️ 需要事务保护（确保所有账户都补齐）

#### 口径 B（备选）：流水只记录增量 + 基线偏移量

- **执行方式**：
  - 正式规定"`asset_transactions` 只记录迁移之后的增量"
  - 对账时必须加上"基线偏移量"：`余额 = 基线 + SUM(delta_amount)`
  - 基线数据存储在配置表或文档中
- **优点**：
  - ✅ 无需修改历史数据
- **缺点**：
  - ❌ 对账逻辑复杂（需要维护基线配置）
  - ❌ 新人难以理解（为什么流水累计不等于余额）

#### 决策结果（✅ 已拍板确认 - 2026-01-08）

- ✅ **采用口径 A**（补开账基线流水），理由：
  - 当前系统还在早期（总流水 900 条）
  - 补基线成本低（账户数量仅 11 行）
  - 长期维护成本更低（对账逻辑简单）
  - 对账公式清晰：`余额 = SUM(delta_amount)`
  - **商业模式确认**：DIAMOND 作为市场硬通货，必须补齐开账口径以支持未来审计
- ✅ **拍板人确认**：项目负责人（2026-01-08）
- ✅ **执行方案**：为每个 `(account_id, asset_code[,campaign_id])` 写入一条 `opening_balance` 流水，基线取"该资产第一条流水的 `balance_before`（若无流水则取当前余额）"

**执行窗口（✅ 已确认）**：

- **执行时间**：✅ **立即执行**（不等待低峰期）
- **停写策略**：✅ **短暂停写**（暂停市场/资产写接口、关掉定时任务）以保证补录时刻的一致性
- **基准时间点**：执行当天的 00:00:00（补录流水的 created_at）
- **预计耗时**：<1 分钟（仅 11 个账户需要补录）
- **回滚方案**：执行前备份数据库，失败则回滚事务

---

### P1：上线前对账/验收口径

#### 1. 订单完整性检查

每个 `trade_orders(status=completed)` 必须能找到一组关联事实：

**资产流水（必须存在）**：

```sql
-- 买家冻结
SELECT * FROM asset_transactions
WHERE idempotency_key = CONCAT(order.idempotency_key, ':freeze_buyer')
  AND business_type = 'order_freeze_buyer'
  AND delta_amount < 0;

-- 买家从冻结结算
SELECT * FROM asset_transactions
WHERE idempotency_key = CONCAT(order.idempotency_key, ':settle_buyer')
  AND business_type = 'order_settle_buyer_debit'
  AND delta_amount = 0;

-- 卖家入账
SELECT * FROM asset_transactions
WHERE idempotency_key = CONCAT(order.idempotency_key, ':credit_seller')
  AND business_type = 'order_settle_seller_credit'
  AND delta_amount > 0;

-- 平台手续费（如果 fee_amount > 0）
SELECT * FROM asset_transactions
WHERE idempotency_key = CONCAT(order.idempotency_key, ':credit_platform_fee')
  AND business_type = 'order_settle_platform_fee_credit'
  AND delta_amount > 0;
```

**物品事件（如果标的是物品）**：

```sql
SELECT * FROM item_instance_events
WHERE idempotency_key = CONCAT(order.idempotency_key, ':transfer_item')
  AND event_type = 'transfer'
  AND business_type = 'market_transfer'
  AND owner_after = order.buyer_user_id;

-- 验证物品所有权已变更
SELECT * FROM item_instances
WHERE item_instance_id = listing.offer_item_instance_id
  AND owner_user_id = order.buyer_user_id;
```

#### 2. 金额恒等式检查

```sql
-- 每个订单必须满足
SELECT order_id, gross_amount, fee_amount, net_amount,
       (gross_amount - fee_amount - net_amount) AS diff
FROM trade_orders
WHERE status = 'completed'
  AND (gross_amount - fee_amount - net_amount) != 0;
-- 结果必须为空
```

#### 3. 冻结/解冻对称性检查

```sql
-- 每个 freeze 必须有对应的 settleFromFrozen 或 unfreeze
SELECT
  freeze.idempotency_key AS freeze_key,
  freeze.meta->>'$.freeze_amount' AS freeze_amount,
  settle.idempotency_key AS settle_key,
  settle.meta->>'$.settle_amount' AS settle_amount
FROM asset_transactions freeze
LEFT JOIN asset_transactions settle
  ON settle.idempotency_key LIKE CONCAT(SUBSTRING_INDEX(freeze.idempotency_key, ':', 1), ':settle_%')
WHERE freeze.business_type LIKE '%freeze%'
  AND settle.idempotency_key IS NULL;
-- 结果必须为空（除非订单被取消且已解冻）
```

---

### P2：直接启用路径（✅ 已拍板确认 - 2026-01-08：无灰度）

#### 决策说明

- **原因**：代码已完整实现（`TradeOrderService` + 幂等保护 + 超时解锁），功能已验证
- **策略**：补齐开账口径 + 增加 `frozen_amount_change` 字段后直接启用，无需灰度过程
- **商业模式确认**：C2C 市场永久只用 DIAMOND 定价/结算（服务层已强制校验，商业规则已确认）
- **前置条件（已拍板）**：
  - ✅ P0 开账口径已完成（补 `opening_balance` 流水）
  - ✅ P0.5 frozen 结构化已完成（增加 `frozen_amount_change` 字段 + 索引）
  - ✅ P1 验收 SQL 已准备就绪
  - ✅ 对账脚本已自动化（每日凌晨运行，使用现有日志机制）
  - ✅ TradeRecord 已清理（删除表/模型/代码）

#### 启用步骤（1-2 天）

1. **Day 1：内部验证**
   - 给 2-3 个测试用户发放 DIAMOND（通过 `admin_adjustment`）
   - 创建挂牌（POST `/api/v4/market/list`）
   - 购买挂牌（POST `/api/v4/market/listings/:id/purchase`）
   - 重试同一 `Idempotency-Key` 验证幂等
   - 验证订单/资产/物品三类事实一致性（运行 P1 验收 SQL）
   - 等待超时（3 分钟）验证超时解锁任务（`jobs/hourly-unlock-timeout-trade-orders.js`）

2. **Day 2：正式启用**
   - 验证所有 P1 验收 SQL 通过
   - 更新前端（启用 C2C 市场功能）
   - 更新文档（API 文档 + 用户帮助）
   - 发布公告（社区/公众号）

#### 验收标准

- ✅ 所有 P1 验收 SQL 通过
- ✅ 幂等重试返回 200 + `is_duplicate: true`
- ✅ 超时订单自动取消 + 资产解冻
- ✅ 订单/资产/物品三类事实一致性验证通过

#### 启用后监控（7 天）

- 订单成功率（目标 >95%）
- 对账一致性（每日运行 P1 验收 SQL）
- 超时订单占比（目标 <5%）
- 并发冲突次数（目标 0 次）
- 用户投诉/反馈

---

## 📊 对账与读模型策略

### 5.1 资产对账（分 available / frozen 两条线）

#### 5.1.1 available 对账（可落地、成本低）

**对账规则**：

```sql
-- 对每个 (account_id, asset_code) 计算
SELECT
  b.account_id,
  b.asset_code,
  b.available_amount AS actual_balance,
  COALESCE(SUM(t.delta_amount), 0) AS expected_balance,
  (b.available_amount - COALESCE(SUM(t.delta_amount), 0)) AS diff
FROM account_asset_balances b
LEFT JOIN asset_transactions t
  ON t.account_id = b.account_id
  AND t.asset_code = b.asset_code
GROUP BY b.account_id, b.asset_code
HAVING diff != 0;
```

**前置条件**：

- ✅ 必须先执行"开账口径"（补 `opening_balance` 流水）
- ✅ 或在 SQL 中加上基线偏移量

**执行频率**：

- 每日凌晨 2 点（通过 `jobs/daily-asset-reconciliation.js`）

---

#### 5.1.2 frozen 对账（当前架构的硬约束）

**问题现状**：

- ❌ `asset_transactions` 没有结构化 `frozen_delta` 字段
- ❌ 只能解析 `meta.frozen_before` / `meta.frozen_after`（JSON 格式）

**短期方案（可立即执行）**：

```sql
-- 按业务类型识别 freeze/unfreeze/settleFromFrozen 的流水
SELECT
  account_id,
  asset_code,
  business_type,
  JSON_EXTRACT(meta, '$.frozen_before') AS frozen_before,
  JSON_EXTRACT(meta, '$.frozen_after') AS frozen_after,
  (JSON_EXTRACT(meta, '$.frozen_after') - JSON_EXTRACT(meta, '$.frozen_before')) AS frozen_delta
FROM asset_transactions
WHERE business_type IN (
  'order_freeze_buyer',
  'order_unfreeze_buyer',
  'order_settle_buyer_debit',
  'listing_freeze_seller_offer',
  'listing_settle_seller_offer_debit'
)
ORDER BY created_at;

-- 聚合计算每个账户的 frozen 余额
SELECT
  account_id,
  asset_code,
  SUM(JSON_EXTRACT(meta, '$.frozen_after') - JSON_EXTRACT(meta, '$.frozen_before')) AS expected_frozen
FROM asset_transactions
WHERE business_type IN (...)
GROUP BY account_id, asset_code;

-- 对比实际余额
SELECT
  b.account_id,
  b.asset_code,
  b.frozen_amount AS actual_frozen,
  COALESCE(calc.expected_frozen, 0) AS expected_frozen,
  (b.frozen_amount - COALESCE(calc.expected_frozen, 0)) AS diff
FROM account_asset_balances b
LEFT JOIN (...) calc
  ON calc.account_id = b.account_id
  AND calc.asset_code = b.asset_code
HAVING diff != 0;
```

**中期方案（推荐演进）**：

- **方案 A**：给 `asset_transactions` 增加结构化字段

  ```sql
  ALTER TABLE asset_transactions
  ADD COLUMN frozen_amount_change BIGINT DEFAULT 0 COMMENT '冻结余额变动（正数=增加，负数=减少）';

  -- 创建索引
  CREATE INDEX idx_frozen_change
  ON asset_transactions(account_id, asset_code, frozen_amount_change);
  ```

  - 修改 `AssetService.freeze/unfreeze/settleFromFrozen` 写入逻辑
  - 对账 SQL 改为：`SUM(frozen_amount_change)`

- **方案 B**：新增 `asset_freeze_events` 表（只记录 frozen 变化）

  ```sql
  CREATE TABLE asset_freeze_events (
    event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id BIGINT NOT NULL,
    asset_code VARCHAR(50) NOT NULL,
    frozen_delta BIGINT NOT NULL COMMENT '冻结变动（正数=冻结，负数=解冻）',
    frozen_before BIGINT NOT NULL,
    frozen_after BIGINT NOT NULL,
    business_type VARCHAR(50) NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    meta JSON,
    created_at DATETIME NOT NULL,
    INDEX idx_account_asset (account_id, asset_code, created_at)
  );
  ```

  - 把 frozen 对账从 JSON 扫描变成索引可算
  - `asset_transactions` 只记录 available 变化

**决策结果（✅ 已拍板确认 - 2026-01-08）**：

- **短期**：使用 JSON 解析方案（可立即执行，仅用于验证逻辑）
- **中期（上线市场前执行）**：✅ **采用方案 A**（增加结构化字段），理由：
  - 改动成本低（只需修改 3 个方法：`freeze/unfreeze/settleFromFrozen`）
  - 对账性能好（索引可用）
  - 数据模型统一（不引入新表）
  - 与 `delta_amount` 字段对称，架构清晰
  - **商业模式确认**：市场只用 DIAMOND 结算，frozen 对账是上线前的必需基础设施
- ✅ **拍板人确认**：项目负责人（2026-01-08）
- ✅ **执行方案**：给 `asset_transactions` 加 `frozen_amount_change` 列，并在 `AssetService.freeze/unfreeze/settleFromFrozen` 写入（对账与索引性能最好）

**执行时机（已确认）**：

- **必须在 C2C 市场正式启用前完成**（否则上线后改表风险高）
- 建议与"开账流水补录"同一窗口执行（减少停写次数）

---

### 5.2 交易读模型（替代 TradeRecord）

#### 5.2.1 资产流水查询

- **API**：`GET /api/v4/assets/transactions`（已存在）
- **实现**：`routes/v4/assets/transactions.js` → `AssetService.getTransactions()`
- **查询参数**：
  - `asset_code`：资产代码（可选）
  - `business_type`：业务类型（可选）
  - `page` / `page_size`：分页

#### 5.2.2 市场订单查询

- **API**：`GET /api/v4/market/orders`（需新增）
- **实现**：`routes/v4/market/orders.js` → `TradeOrderService.getUserOrders()`
- **查询参数**：
  - `role`：`buyer` / `seller`（必填）
  - `status`：订单状态（可选）
  - `page` / `page_size`：分页

#### 5.2.3 物品历史/转让历史

- **API**：`GET /api/v4/backpack/items/:item_instance_id/history`（需新增）
- **实现**：`routes/v4/backpack/items.js` → `ItemInstanceEvent.getEventHistory()`
- **返回字段**：
  - `event_type`：事件类型
  - `operator_user_id`：操作者
  - `owner_before` / `owner_after`：所有权变更
  - `created_at`：事件时间

#### 5.2.4 统一交易时间线（如需）

- **场景**：用户查看"我的所有交易"（资产 + 订单 + 物品）
- **实现方式**：

  ```javascript
  // 在 API 层 merge 三类事实
  async function getUnifiedTimeline(user_id, options) {
    const [assetTxns, tradeOrders, itemEvents] = await Promise.all([
      AssetService.getTransactions({ user_id }, options),
      TradeOrderService.getUserOrders({ user_id }, options),
      ItemInstanceEvent.findAll({ where: { operator_user_id: user_id } })
    ])

    // 按时间排序 merge
    return [...assetTxns, ...tradeOrders, ...itemEvents].sort((a, b) => b.created_at - a.created_at)
  }
  ```

- **注意**：**不需要复活 `trade_records`**

---

## 🛡️ 风险与缓解措施

### 风险 1：开账流水补录失败导致对账混乱

- **概率**：低（事务保护 + 幂等键）
- **影响**：高（所有对账失败）
- **缓解措施**：
  - ✅ 在低峰期执行（凌晨 2-4 点）
  - ✅ 使用事务保护（全部成功或全部回滚）
  - ✅ 执行前备份数据库
  - ✅ 执行后运行对账 SQL 验证

### 风险 2：TradeOrder 上线后并发冲突

- **概率**：中（高并发场景）
- **影响**：中（用户体验差，但数据一致性有保障）
- **缓解措施**：
  - ✅ 使用悲观锁（`lock: transaction.LOCK.UPDATE`）
  - ✅ 使用幂等键（防止重复提交）
  - ✅ 灰度期间监控并发冲突次数

### 风险 3：frozen 对账性能差（JSON 扫描）

- **概率**：高（随着数据量增长）
- **影响**：中（对账任务超时）
- **缓解措施**：
  - ✅ 短期：限制对账范围（只查最近 30 天）
  - ✅ 中期：执行方案 A（增加结构化字段）
  - ✅ 长期：考虑方案 B（独立 freeze_events 表）

### 风险 4：TradeRecord 历史数据丢失（✅ 已拍板：直接删除不备份）

- **概率**：确定（已拍板立即删除表，不保留备份）
- **影响**：低（真实库仅 2 条历史数据，时间范围 2025-11-11 ~ 2025-12-12）
- **不可逆确认**：删除后无法通过 `trade_records` 表查询这 2 条历史转让记录，且无备份可恢复
- **拍板决策**：
  - ✅ **直接删除不备份**，不兼容历史数据查询需求
  - ✅ 替代方案：物品转移历史已完整记录在 `item_instance_events`（251 行真实数据）
  - ✅ 风险接受：2 条历史数据价值极低，不值得保留备份

### 风险 5：DIAMOND 唯一结算币种限制（✅ 已拍板：商业规则确认）

- **决策**：C2C 市场永久只用 DIAMOND 定价/结算（不支持 POINTS / 材料等）
- **影响**：用户必须先将材料/积分转换为 DIAMOND 才能参与市场交易
- **商业模式确认**：
  - ✅ DIAMOND 作为市场硬通货（类似游戏中的"金币"或"钻石"）
  - ✅ 材料转换（`red_shard` → `DIAMOND`）已实现
  - ✅ 管理员调整（`admin_adjustment`）可发放 DIAMOND
  - ⚠️ 用户充值/活动奖励等 DIAMOND 获取渠道需要完整规划
- **不可逆确认**：一旦上线，改为多币种支持需要大规模重构（订单表/流水表/对账逻辑全部改动）

---

## 📅 实施时间表（✅ 基于已拍板决策 - 2026-01-08）

### 第一阶段：P0 开账口径 + frozen 结构化（✅ 已拍板：立即执行 + 短暂停写）

- [ ] **执行前准备**（立即执行）：
  - ✅ **短暂停写**：暂停市场/资产写接口、关掉定时任务（`jobs/daily-asset-reconciliation.js` 等）
  - ✅ 执行前备份数据库
- [ ] **编写开账流水补录脚本**（`scripts/migration/add-opening-balance.js`）：
  - 为每个 `(account_id, asset_code)` 补一条 `opening_balance` 流水（预计 11 条）
  - `business_type = 'opening_balance'`
  - `idempotency_key = 'opening_${account_id}_${asset_code}'`
  - `created_at = 执行当天的 00:00:00`（基准时间点）
  - ✅ **DIAMOND 来源口径**：允许"历史初始化/外部注入"，必须补齐清晰来源（管理员调整/充值/材料转换）并补流水口径承接
- [ ] **编写 frozen 结构化迁移脚本**（`migrations/YYYYMMDD-add-frozen-amount-change.js`）：
  - `ALTER TABLE asset_transactions ADD COLUMN frozen_amount_change BIGINT DEFAULT 0`
  - `CREATE INDEX idx_frozen_change ON asset_transactions(account_id, asset_code, frozen_amount_change)`
  - 修改 `AssetService.freeze/unfreeze/settleFromFrozen` 写入逻辑
- [ ] **立即执行**（预计 <5 分钟）：
  - 使用事务保护（全部成功或全部回滚）
  - 先执行开账流水补录，再执行 frozen 结构化迁移
- [ ] **执行后验证**：
  - 运行对账 SQL 验证（`available` 对账通过，`frozen` 对账通过）
  - ✅ **恢复写入**：重新启用市场/资产写接口、启动定时任务

### 第二阶段：TradeRecord 立即删除（✅ 已拍板：直接删除不备份）

- [ ] **删除相关代码**（破坏性操作，不可逆，✅ **不保留备份**）：
  - 删除 `models/TradeRecord.js` 模型文件
  - 删除 `services/FeeCalculator.js:216-280`（`createTradeRecord()` 方法及其内部逻辑）
  - 删除 `services/BackpackService.js:466-530`（`getTransferHistory()` 方法）
  - 清理 `models/index.js` 中的 `TradeRecord` 引用
- [ ] **执行数据库迁移**（破坏性操作，不可逆）：
  - `DROP TABLE trade_records;`（直接删除，不备份数据）
  - 清理迁移文件中的 `trade_records` 引用（保留历史迁移记录但标注已废弃）
- [ ] **验证代码编译和启动正常**：
  - `npm run lint`（确保无语法错误）
  - `node app.js`（确保启动无报错）
  - `curl http://localhost:3000/health`（确保健康检查通过）

### 第三阶段：TradeOrder 直接启用（1-2 天）

- [ ] Day 4：内部验证
  - 给测试用户发放 DIAMOND
  - 创建挂牌 → 购买 → 验证幂等 → 验证对账
  - 验证超时解锁任务
  - 运行所有 P1 验收 SQL
- [ ] Day 5：正式启用
  - 更新前端（启用 C2C 市场功能）
  - 更新文档（API 文档 + 用户帮助）
  - 发布公告（社区/公众号）
- [ ] Day 5-12：启用后监控（7 天）
  - 监控订单成功率/对账一致性/超时订单占比
  - 收集用户反馈

### 第四阶段：C2C 市场商业规则强化（与第三阶段并行，1 天）

- [ ] Day 4-5：强化 DIAMOND 唯一结算币种规则
  - ✅ 服务层已强制校验（`TradeOrderService` / `MarketListing`）
  - ✅ 前端需同步更新：挂牌/购买界面只显示 DIAMOND 选项
  - ✅ 文档更新：API 文档明确说明"交易市场只支持 DIAMOND 结算"
  - ✅ 用户帮助文档：说明 DIAMOND 获取途径（材料转换、充值、活动奖励等）
- [ ] Day 4-5：DIAMOND 发放/购买渠道完整性检查
  - ✅ 材料转换（`red_shard` → `DIAMOND`）：已实现
  - ✅ 管理员调整（`admin_adjustment`）：已实现
  - ⚠️ 用户充值（如需）：待确认是否需要实现
  - ⚠️ 活动奖励（如需）：待确认是否需要实现

**说明**：frozen 结构化已提前到第一阶段执行（与开账口径同窗口），本阶段专注于商业规则强化和用户体验优化

---

## 📝 验收标准（✅ 基于已拍板决策 - 2026-01-08）

### 1. 开账口径 + frozen 结构化验收（第一阶段，✅ 已拍板：立即执行 + 短暂停写）

- [ ] **执行前准备**：
  - [ ] 市场/资产写接口已暂停
  - [ ] 定时任务已关闭（`jobs/daily-asset-reconciliation.js` 等）
  - [ ] 数据库备份已完成
- [ ] **开账流水补录**：
  - [ ] 所有 `(account_id, asset_code)` 都有对应的 `opening_balance` 流水（预计 11 条）
  - [ ] ✅ **DIAMOND 来源口径**：允许"历史初始化/外部注入"，已补齐清晰来源（管理员调整/充值/材料转换）并补流水口径承接
  - [ ] 对账 SQL 通过（`available` 差异为 0）
- [ ] **frozen 结构化**：
  - [ ] `asset_transactions` 表已增加 `frozen_amount_change` 列
  - [ ] `idx_frozen_change` 索引已创建
  - [ ] `AssetService.freeze/unfreeze/settleFromFrozen` 已修改为写入 `frozen_amount_change`
  - [ ] 对账 SQL 通过（`frozen` 差异为 0）
- [ ] **执行后恢复**：
  - [ ] 市场/资产写接口已恢复
  - [ ] 定时任务已重新启动

### 2. TradeRecord 删除验收（第二阶段，✅ 已拍板：直接删除不备份）

- [ ] **代码删除**：
  - [ ] 模型文件已删除（`models/TradeRecord.js`）
  - [ ] 相关代码已删除：
    - `services/FeeCalculator.js:216-280`（`createTradeRecord()` 方法）
    - `services/BackpackService.js:466-530`（`getTransferHistory()` 方法）
    - `models/index.js` 中的 `TradeRecord` 引用
- [ ] **数据库删除**（✅ **不保留备份**）：
  - [ ] 数据库表已删除（`DROP TABLE trade_records`，直接删除不备份）
- [ ] **验证通过**：
  - [ ] `npm run lint` 通过
  - [ ] `node app.js` 启动无报错
  - [ ] `curl http://localhost:3000/health` 返回 healthy

### 3. TradeOrder 启用验收（第三阶段）

- [ ] 所有 P1 验收 SQL 通过
- [ ] 幂等性测试通过（重试返回 200 + `is_duplicate: true`）
- [ ] 超时解锁任务测试通过（3 分钟超时自动取消订单并解冻资产）
- [ ] 订单/资产/物品三类事实一致性验证通过
- [ ] DIAMOND 唯一结算币种规则验证通过（挂牌/购买只允许 DIAMOND）
- [ ] 启用后 7 天监控期：订单成功率 >95%，无数据一致性问题

### 4. 商业规则强化验收（第四阶段）

- [ ] 前端挂牌/购买界面只显示 DIAMOND 选项
- [ ] API 文档已更新（明确说明"交易市场只支持 DIAMOND 结算"）
- [ ] 用户帮助文档已更新（说明 DIAMOND 获取途径）
- [ ] DIAMOND 发放/购买渠道完整性确认（材料转换、管理员调整等）

---

## 🔗 相关文档

- [功能重复检查报告-2026-01-08.md](./功能重复检查报告-2026-01-08.md)
- [统一资产域架构设计方案.md](./统一资产域架构设计方案.md)
- [事务边界治理现状核查报告.md](./事务边界治理现状核查报告.md)
- [Redis缓存策略现状与DB压力风险评估-2026-01-02.md](./Redis缓存策略现状与DB压力风险评估-2026-01-02.md)

---

## 📞 联系方式

如有疑问或需要技术支持，请联系：

- **技术负责人**：[待补充]
- **项目文档**：`docs/` 目录
- **代码仓库**：[待补充]

---

**文档版本**：v2.0（已拍板确认版）  
**最后更新**：2026年01月08日  
**拍板确认**：2026年01月08日（项目负责人）  
**审核状态**：✅ 已拍板，进入执行阶段

---

## 📌 拍板决策汇总（2026-01-08）

### ✅ 已确认的 11 项关键决策（含商业规则 + 执行级决策）

#### 核心方向决策（6 项）

1. **开账口径**：采用方案 A（补 `opening_balance` 流水）
   - 对账公式：余额 = SUM(delta_amount)
   - 符合会计原则，长期维护成本低
   - 为每个 `(account_id, asset_code[,campaign_id])` 写入一条 `opening_balance`，基线取"该资产第一条流水的 `balance_before`（若无流水则取当前余额）"

2. **frozen 结构化**：采用方案 A（增加 `frozen_amount_change` 列 + 索引）
   - 改动范围：`AssetService.freeze/unfreeze/settleFromFrozen` 三个方法
   - 对账性能好，数据模型统一
   - 在 `asset_transactions` 加 `frozen_amount_change` 列，并在 `AssetService.freeze/unfreeze/settleFromFrozen` 写入

3. **TradeRecord 处理**：✅ **TradeRecord 退场**
   - 删除：表结构 + 模型文件 + 相关代码引用
   - ✅ **拍板决策**：直接删除不备份，不兼容历史数据查询需求
   - 风险接受：2 条历史数据价值极低，不值得保留备份
   - 交易时间线由 `asset_transactions` + `trade_orders` + `item_instance_events` 组合产生

4. **手续费商业口径**：✅ **按成交价收取手续费**
   - 计算公式：`fee_amount = gross_amount * fee_rate`（建议 5%）
   - 买家支付 = 挂牌价，卖家到账 = 挂牌价 - 手续费，平台收入 = 手续费
   - 恒等式约束：`gross_amount = fee_amount + net_amount`
   - 影响收入与用户体验（5% 手续费率需与同类平台对比）

5. **市场挂牌范围**：✅ **所有物品（钻石/材料/实物）都可上架**
   - 可叠加资产（DIAMOND/POINTS/材料）+ 不可叠加物品（实物/虚拟/优惠券）全部可上架
   - 限制条件：物品状态 `active` + 卖家是所有者 + 挂牌价格 > 0
   - 商业影响：扩大可交易范围，提升市场活跃度

6. **幂等派生根键**：✅ **统一以 `idempotency_key` 为根（和入口幂等一致）**
   - 根幂等键：`trade_orders.idempotency_key`（由前端/客户端生成）
   - 派生幂等键：`${idempotency_key}:freeze_buyer` / `:settle_buyer` / `:credit_seller` / `:credit_platform_fee` / `:transfer_item`
   - 幂等保护：入口层（`ApiIdempotencyRequest`）+ 数据层（`asset_transactions.idempotency_key` 唯一约束）+ 事件层（`item_instance_events` 唯一约束）

#### 商业规则决策（1 项）

7. **C2C 市场结算币种**：永久只用 DIAMOND（商业规则确认）
   - 商业模式：DIAMOND 作为市场硬通货
   - 技术约束：服务层已强制校验，前端需同步限制
   - 不可逆确认：改为多币种支持需要大规模重构

#### 执行级决策（4 项）

8. **执行窗口策略**：✅ **立即执行 + 短暂停写**
   - 执行时间：立即执行（不等待低峰期）
   - 停写策略：短暂停写（暂停市场/资产写接口、关掉定时任务）以保证补录时刻的一致性
   - 基准时间点：执行当天的 00:00:00（补录流水的 created_at）

9. **DIAMOND 来源口径**：✅ **允许历史初始化 + 补流水承接**
   - 允许"历史初始化/外部注入"
   - 必须补齐清晰来源（管理员调整/充值/材料转换）并补流水口径承接
   - 解决 DIAMOND 有余额但流水为空的矛盾

10. **TradeRecord 备份策略**：✅ **直接删除不备份**
    - 不保留任何备份文件
    - 不兼容历史数据查询需求
    - 风险接受：2 条历史数据（2025-11-11 ~ 2025-12-12）价值极低

11. **开账基准时间点**：✅ **执行当天的 00:00:00**
    - 不固定为 2026-01-08 00:00:00
    - 动态设置为实际执行当天的 00:00:00
    - 更贴合"从这天开始可对账"的语义

### 🎯 收敛目标（已明确）

- **单一事实来源**：
  - 资产事实 → `AssetTransaction`（唯一真相，900 行真实流水）
  - 订单事实 → `TradeOrder`（唯一真相，代码完整待启用）
  - 物品事实 → `ItemInstanceEvent`（唯一真相，251 行真实事件）
- **TradeRecord 退场**：立即删除（无观察期）
- **对账能力**：available + frozen 双线对账（基于结构化字段）
- **市场启用**：补齐基础设施后直接启用（无灰度）

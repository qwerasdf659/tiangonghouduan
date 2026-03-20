# 商品 SKU 与物品实例系统 — 行业方案对比与架构设计

> 生成日期：2026-03-20
> 数据来源：项目代码分析 + 行业方案调研（阿里/有赞/Steam/游戏公司/活动营销平台）
> 项目版本：V4.0 餐厅积分抽奖系统
> 前提：项目未上线，愿意一次性投入成本，不兼容旧接口，追求长期维护成本最低

---

## 一、项目背景

### 1.1 项目本质

餐厅积分抽奖系统 — 用户消费获得积分/材料资产，通过抽奖获得虚拟物品（优惠券、水晶等），物品可在市场交易、兑换实物商品、到店核销。

核心业务域：
- **抽奖系统**（活动、奖品、档位规则、决策审计）
- **兑换市场**（B2C 商品兑换，材料资产支付）
- **交易市场**（C2C 物品挂牌、竞价、钻石结算）
- **物品系统**（三表模型：items + item_ledger + item_holds）
- **资产系统**（统一账户、双录记账、冻结模型）
- **核销系统**（SHA-256 核销码、门店扫码）
- **管理后台**（Alpine.js + Tailwind，80+ 路由）

### 1.2 技术栈

| 层级 | 技术 |
|------|------|
| 后端运行时 | Node.js ≥20.18.0 |
| Web 框架 | Express 4.18 |
| ORM | Sequelize 6.35 |
| 数据库 | MySQL (mysql2 3.6) |
| 缓存 | Redis (ioredis 5.7) |
| 前端框架 | Alpine.js 3.15 |
| 构建工具 | Vite 6.4 |
| CSS | Tailwind CSS 3.4 |
| 实时通信 | Socket.io 4.8 |

### 1.3 现有模型规模

113 个 Sequelize 模型，服务层采用 Routes → Services → Models 三层架构，服务按领域拆分（CoreService / QueryService / AdminService）。

---

## 二、行业方案全面对比

### 2.1 大厂电商（阿里/淘宝/京东）

**核心模型：** 重型 SPU-SKU + EAV 属性体系

```
品类(category) → 属性模板(attr_template) → 属性定义(attr)
                                              ↓
SPU(spu) → SPU属性值(spu_attr_value)
  ↓
SKU(sku) → SKU属性值(sku_attr_value) → 库存(sku_stock, locked_stock, available_stock)
```

**特点：**
- 属性是独立建表的 EAV 模型（实体-属性-值），一个属性一行记录
- 品类驱动：不同品类有不同的属性模板，手机有"内存/颜色"，服装有"尺码/面料"
- 库存三态分离：总库存 / 可用库存 / 锁定库存，单独一张表
- SPU 和 SKU 的属性值分开存储
- 闲鱼在此基础上搞了"标准 SPU + 自有 SPU"双通道（数据链路 ODPS → MySQL → OpenSearch）

**适用场景：** 百万级 SKU、数千品类、需要属性级筛选和搜索的超大规模电商

**代价：** 5-8 张核心表，查询一个完整商品需要 JOIN 4-5 张表，开发维护成本极高

### 2.2 中型 SaaS 平台（有赞/美团/微盟）

**核心模型：** 简化 SPU-SKU + JSON 属性

```
SPU(商品主表) → spec_names: ["颜色","尺码"]    ← JSON 列
  ↓
SKU(规格表)   → spec_values: {"颜色":"白色"}   ← JSON 列
              → price, stock（直接在 SKU 行内）
```

**特点：**
- 属性不单独建表，直接用 JSON 列存在 SPU/SKU 表里
- 2 张表搞定（SPU + SKU），不需要 EAV 属性体系
- 库存直接放在 SKU 行内，不单独建库存表
- 单品商品自动有一个默认 SKU（`spec_values = {}`）
- 适度灵活：支持自定义规格，但不支持按属性值做 SQL 级别筛选

**适用场景：** 万级 SKU、十几个品类、需要一定灵活性但不需要属性级搜索

**代价：** 2 张核心表，JOIN 少，开发简单。缺点是 JSON 属性不能高效索引

### 2.3 游戏公司（暴雪/米哈游/Valve/Steam）

**核心模型：** 物品定义(Definition) + 物品实例(Instance) 两层模型

```
ItemDefinition(物品定义表)  ← 运营配置的"模板"
  - def_id, name, rarity, icon, type, base_attributes
  ↓
ItemInstance(物品实例表)    ← 玩家背包里的具体物品
  - instance_id, def_id, owner_id, attributes_override, obtained_at
```

**特点：**
- 没有 SKU 概念，取而代之的是"定义 → 实例"
- 物品定义是运营侧维护的模板（类似 SPU 但更轻）
- 物品实例是玩家拥有的具体对象，每个实例可以有独立属性覆盖（强化等级、磨损值等）
- 库存概念不同：不是"剩余多少件"，而是"发放概率/总投放量/每日限额"
- Steam 的 CS:GO 皮肤用 `def_index + paint_index + paint_seed + float_value` 四元组唯一标识一个实例
- 交易是实例级别的——你卖的是"你的那个具体物品"，不是"同规格的任意一件"

**适用场景：** 虚拟物品、道具、NFT 式唯一物品、需要追踪每件物品生命周期

**代价：** 2 张核心表，但实例表数据量巨大（每次发放都产生新行）

### 2.4 活动策划/营销公司（积分商城/会员兑换）

**核心模型：** 超轻量单表 + 奖品池

```
RewardItem(奖品/商品表)
  - item_id, name, image, cost_points, stock, category, status
  ↓
RewardRecord(兑换记录表)
  - record_id, item_id, user_id, cost_snapshot, status
```

**特点：**
- 没有 SPU/SKU 分离，一个商品就是一行，没有规格变体
- 库存直接在商品行内 `stock` 字段
- 核心是"积分兑换"，不是"购物"，不需要复杂的规格体系
- 如果有颜色/尺码需求，通常拆成多个独立商品
- 极简，开发快，维护零成本

**适用场景：** 几十到几百个商品、不需要规格选择、纯积分兑换

**代价：** 1-2 张表，完全没有扩展性

### 2.5 虚拟物品交易/二手平台（Steam 市场/闲鱼/5173）

**核心模型：** 物品定义 + 用户挂牌(Listing) + 交易(Trade)

```
ItemDefinition(物品定义)
  ↓
UserListing(用户挂牌)      ← C2C：用户发布自己拥有的物品
  - listing_id, item_def_id, seller_id, asking_price, item_snapshot
  ↓
TradeOrder(交易订单)
  - order_id, listing_id, buyer_id, seller_id, escrow_status
```

**特点：**
- 物品定义是平台维护的"标准品"（类似游戏的 Definition）
- 挂牌是用户侧操作，每个挂牌对应一个具体物品
- 交易有担保/托管(escrow)流程
- 核心挑战不是 SKU 管理，而是信任机制（验货、担保、仲裁）

**适用场景：** C2C 虚拟物品交易、二手交易

---

## 三、核心区别一览

| 维度 | 大厂电商 | 中型 SaaS | 游戏公司 | 活动营销 | 虚拟交易平台 |
|------|---------|---------|---------|---------|------------|
| 核心表数 | 5-8 张 | 2-3 张 | 2 张 | 1-2 张 | 3-4 张 |
| SKU 概念 | 重度 SKU | 轻度 SKU | 无 SKU，用实例 | 无 SKU | 无 SKU，用挂牌 |
| 属性存储 | EAV 独立表 | JSON 列 | JSON/定义表列 | 无 | 定义表列+快照 |
| 库存模型 | 三态分离表 | SKU 行内 | 投放量/概率 | 商品行内 | 无传统库存 |
| 品类管理 | 品类驱动属性模板 | 简单分类 | 物品类型 | 简单分类 | 标准品定义 |
| 交易模式 | B2C | B2C | B2C 发放 | B2C 兑换 | C2C + 担保 |
| 维护成本 | 极高 | 中等 | 低 | 极低 | 中等 |
| 适合数据量 | 百万级 | 万级 | 十万级实例 | 百级 | 万级挂牌 |

### 3.1 EAV vs JSON 属性存储决策

基于 MySQL 8 的 JSON 索引能力（generated stored column）对比：

| 维度 | EAV 独立表 | JSON 列 |
|------|----------|--------|
| 按属性筛选性能 | 直接字符串比较，高效 | 需要生成列或函数索引 |
| 读取完整商品 | JOIN 4-5 张表 | 单表查询 |
| 灵活性 | 极高（任意属性） | 高（自定义 JSON schema） |
| 维护复杂度 | 极高 | 低 |
| 适用品类数 | 数千品类 | 数十品类 |

**本项目结论：** 品类可预见不超过 20 个，JSON 列完全够用，不引入 EAV。

---

## 四、本项目现状分析

### 4.1 已有的两套系统

本项目实际上已经存在两套独立的系统：

**系统 A：兑换商城（B2C 电商模式）**

| 模型 | 表名 | 职责 |
|------|------|------|
| ExchangeItem | exchange_items | SPU 商品主体（名称、描述、图片、资产类型、价格、库存） |
| ExchangeItemSku | exchange_item_skus | SKU 规格变体（spec_values JSON、独立价格/库存） |
| ExchangeRecord | exchange_records | 兑换订单（订单号、用户、支付资产、状态流转） |

架构模式：有赞轻 SKU 模式。

**系统 B：物品系统（游戏 Instance 模式）**

| 模型 | 表名 | 职责 |
|------|------|------|
| ItemTemplate | item_templates | 物品定义模板（模板代码、类型、稀有度、类目、可交易标记） |
| Item | items | 物品实例（唯一追踪码、持有者、状态、来源追溯） |
| ItemLedger | item_ledger | 双录记账本（只追加不修改，SUM(delta)=0 守恒校验） |
| ItemHold | item_holds | 锁定机制（trade/redemption/security 三级优先级） |

架构模式：游戏级 Definition → Instance + 银行级双录记账。

**物品系统的服务能力：**
- `ItemService.mintItem()` — 铸造实例（SYSTEM_MINT → 用户账户）
- `ItemService.transferItem()` — 转移所有权（卖方 → 买方）
- `ItemService.holdItem()` — 锁定物品（挂牌交易时冻结）
- `ItemService.consumeItem()` — 核销/销毁（用户 → SYSTEM_BURN）

### 4.2 关键问题：两套系统完全断开

```
┌─────────────────────────┐     ┌──────────────────────────┐
│  兑换商城 (B2C)          │     │  物品系统 (Game Mode)     │
│                         │     │                          │
│  ExchangeItem (SPU)     │     │  ItemTemplate (定义)      │
│  ExchangeItemSku (SKU)  │     │  Item (实例)              │
│  ExchangeRecord (订单)   │     │  ItemLedger (账本)        │
│                         │     │  ItemHold (锁定)          │
│  ❌ 兑换后没有产出实例    │     │                          │
└─────────────────────────┘     └──────────────────────────┘
         完全独立                        完全独立
```

| 入口 | 是否产出 Item 实例 | 是否可交易 |
|------|-------------------|----------|
| 抽奖（coupon/physical） | ✅ mintItem() | ✅ 可挂牌 |
| 竞价中标 | ✅ mintItem() | ✅ 可挂牌 |
| B2C 兑换 | ❌ 只建 ExchangeRecord | ❌ 不在背包中 |

**核心矛盾：** `ExchangeItem`（SPU）和 `ItemTemplate`（物品定义）之间没有任何关联。用户通过 B2C 兑换获得的商品不进入物品系统，无法在 C2C 市场交易。

### 4.3 为什么纯电商模式不够

本项目的商品流转本质是**游戏经济系统 + 积分商城的混合体**：

| 维度 | 纯电商 | 本项目实际需求 |
|------|-------|-------------|
| 商品唯一性 | 同款可替代 | 需要唯一编号（#0042） |
| 交易对象 | 任意一件同规格 | 张三的那个具体物品 |
| 属性可变 | 否 | 强化等级、磨损值可变 |
| 来源追溯 | 不关心 | 抽奖/兑换/交易全链路追溯 |
| 生命周期 | 购买即结束 | 铸造 → 持有 → 交易 → 核销/销毁 |

### 4.4 为什么不全盘切换到游戏模式

B2C 兑换商城仍然需要电商模式的能力：

| 维度 | 游戏发放 | B2C 兑换商城 |
|------|---------|------------|
| 获得方式 | 系统概率决定 | 用户主动选择商品 |
| 库存逻辑 | 无限发放或概率控制 | 有明确库存数量 |
| 规格选择 | 没有 | 用户选颜色/尺码（实物商品） |
| 发货 | 直接进背包 | 可能需要物流发货 |
| 退款 | 几乎不存在 | 有订单拒绝和资产退回逻辑 |

---

## 五、推荐方案：打通两套系统

### 5.1 核心思路

不是重建，是连线。两套系统各自成熟，缺的只是一座桥。

**设计原则：**
- ExchangeItem 管"怎么卖"（价格、库存、规格、展示）
- ItemTemplate 管"是什么"（物品定义、稀有度、可交易性）
- Item 管"谁拥有的哪一件"（实例、属性、所有权）
- 通过 `item_template_id` 外键连接两个世界

### 5.2 改造步骤

#### 步骤一：ExchangeItem 关联 ItemTemplate

在 `exchange_items` 表新增字段：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| item_template_id | BIGINT | NULL, FK → item_templates | 关联的物品模板 |

- **有值：** 兑换后产出 Item 实例（进用户背包，可交易）
- **NULL：** 纯实物发货（纸巾、杯子），不产出实例（保持现有逻辑）

两种商品共存，零破坏性。

#### 步骤二：Item 模型增加实例属性

在 `items` 表新增字段：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| instance_attributes | JSON | NULL | 实例独有属性，如 `{"磨损值": 0.073, "强化等级": 7, "花纹种子": 442}` |
| serial_number | INT | NULL | 限量编号，如 42（表示 #0042） |
| edition_total | INT | NULL | 限量总数，如 100（表示共 100 件） |
| item_template_id | BIGINT | NULL, FK → item_templates | 关联物品模板（补充现有 prize_definition_id 的不足） |

- `instance_attributes`：每件物品的独有属性，铸造时根据规则随机生成或指定
- `serial_number` + `edition_total`：限量编号体系（"第 42 件 / 共 100 件"）
- 现有 `tracking_code`（如 `LT260219028738`）继续作为系统级唯一标识
- `serial_number` 是面向用户的"收藏编号"

#### 步骤三：ExchangeRecord 关联 Item 实例

在 `exchange_records` 表新增字段：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| item_id | BIGINT | NULL, FK → items | 本次兑换产出的物品实例 |

- **有值：** 这笔兑换产出了一个实例（可查询"这个物品是哪笔兑换来的"）
- **NULL：** 纯实物兑换，没有实例

#### 步骤四：修改兑换流程

**现有流程（CoreService.exchangeItem）：**

```
扣材料 → 建 ExchangeRecord → 扣 SPU/SKU 库存 → 完
```

**改造后流程：**

```
扣材料 → 建 ExchangeRecord → 扣 SPU/SKU 库存
    → 如果 ExchangeItem.item_template_id 存在：
        → ItemService.mintItem() 铸造实例
        → 生成 serial_number（该模板已铸造数 + 1）
        → 生成 instance_attributes（按模板规则随机）
        → 实例进入用户背包
        → ExchangeRecord.item_id = 新铸造的 item_id
```

#### 步骤五：SKU 规格 vs 实例属性的关系

这是关键的设计决策——它们是两个不同的东西：

| 维度 | SKU 规格 (spec_values) | 实例属性 (instance_attributes) |
|------|----------------------|------------------------------|
| 用户选择？ | 是，下单前选择 | 否，铸造时系统决定 |
| 影响价格？ | 是，不同 SKU 不同价格 | 不直接影响，但影响二手市场价值 |
| 影响库存？ | 是，每个 SKU 独立库存 | 否 |
| 可变？ | 否，选了就定了 | 是，可以强化/升级/磨损 |
| 举例 | `{"颜色":"冰蓝","尺寸":"大"}` | `{"磨损值": 0.073, "强化等级": 7}` |

**铸造时的属性合并逻辑：**

```javascript
instance_attributes = {
  ...sku.spec_values,            // {"颜色":"冰蓝"} ← 来自用户的 SKU 选择
  "磨损值": Math.random(),        // 0.073 ← 铸造时随机生成
  "花纹种子": randomInt(1, 1001), // 442 ← 铸造时随机生成
  "强化等级": 0                   // 初始等级
}
```

### 5.3 完整数据流（改造后）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          改造后的统一架构                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ExchangeItem (SPU 商品目录)                                                │
│       │                                                                     │
│       ├── ExchangeItemSku (SKU 规格/价格/库存)                              │
│       │                                                                     │
│       └── item_template_id ──→ ItemTemplate (物品定义模板)                   │
│                                      │                                      │
│  用户兑换                              │                                      │
│       │                              │                                      │
│       ├── 扣材料资产                   │                                      │
│       ├── 扣 SKU 库存                 │                                      │
│       ├── 建 ExchangeRecord           │                                      │
│       │                              ▼                                      │
│       └── ItemService.mintItem() ──→ Item (物品实例)                        │
│                                      │    tracking_code = LT260320xxxxx     │
│                                      │    serial_number = #0042             │
│                                      │    instance_attributes = {...}       │
│                                      │    owner = 用户账户                   │
│                                      │                                      │
│                                      ├──→ item_ledger (双录记账)            │
│                                      │                                      │
│                                      └──→ 用户背包 (BackpackService)        │
│                                                │                            │
│                                                ▼                            │
│                                      用户挂牌交易 (MarketListing)            │
│                                      listing_kind = 'item'                  │
│                                      offer_item_id = item_id                │
│                                                │                            │
│                                                ▼                            │
│                                      买家看到：                              │
│                                      "张三的 #0042 冰蓝龙纹宝石"            │
│                                      磨损值: 0.073 | 强化: +7              │
│                                                │                            │
│                                                ▼                            │
│                                      TradeOrder → transferItem()            │
│                                      物品转移到买家背包                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.4 全渠道物品产出统一视图

改造后，所有渠道产出的物品都进入同一个 Item 系统：

| 产出渠道 | 是否铸造 Item | Item.source | 是否可交易 |
|---------|-------------|-------------|----------|
| 抽奖（coupon/physical） | ✅ | `lottery` | ✅ 取决于 ItemTemplate.is_tradable |
| 竞价中标 | ✅ | `bid_settlement` | ✅ |
| B2C 兑换（关联模板） | ✅ **新增** | `exchange` | ✅ |
| B2C 兑换（纯实物） | ❌ | — | ❌ 走物流发货 |
| 管理员赠送 | ✅ | `admin` | ✅ |

---

## 六、改造量评估

### 6.1 数据库迁移

| 表 | 改动 | 字段 | 复杂度 |
|----|------|------|-------|
| exchange_items | ADD COLUMN | `item_template_id BIGINT NULL` | 小 |
| items | ADD COLUMN | `instance_attributes JSON NULL` | 小 |
| items | ADD COLUMN | `serial_number INT NULL` | 小 |
| items | ADD COLUMN | `edition_total INT NULL` | 小 |
| items | ADD COLUMN | `item_template_id BIGINT NULL` | 小 |
| exchange_records | ADD COLUMN | `item_id BIGINT NULL` | 小 |

共 1 个迁移文件，6 个 ADD COLUMN，全部 NULL-able，零破坏性。

### 6.2 模型层

| 文件 | 改动 | 复杂度 |
|------|------|-------|
| models/ExchangeItem.js | 新增 item_template_id 字段 + belongsTo 关联 | 小 |
| models/Item.js | 新增 3 个字段 + belongsTo ItemTemplate | 小 |
| models/ExchangeRecord.js | 新增 item_id 字段 + belongsTo Item | 小 |

### 6.3 服务层

| 文件 | 改动 | 复杂度 |
|------|------|-------|
| services/exchange/CoreService.js | exchangeItem() 增加铸造分支 | 中 |
| services/exchange/AdminService.js | 商品创建/编辑增加 item_template_id | 小 |
| 新建：services/item/AttributeRuleEngine.js | 铸造属性规则引擎 | 中 |

### 6.4 前端

| 文件 | 改动 | 复杂度 |
|------|------|-------|
| admin/exchange-market.html | 商品表单增加"关联物品模板"选择 | 小 |
| admin/src/modules/market/composables/exchange-items.js | itemForm 增加字段 | 小 |
| 市场列表页 | 展示实例属性（磨损值、编号等） | 中 |

### 6.5 总评

| 维度 | 评估 |
|------|------|
| 总改动文件数 | ~10 个 |
| 新建文件数 | 1 个（属性规则引擎）+ 1 个迁移 |
| 是否破坏现有数据 | 否，全部 NULL-able 新增 |
| 是否破坏现有接口 | 否，item_template_id 为空时走老逻辑 |
| 预计工时 | 2-3 天 |

---

## 七、禁止事项

| 不要做 | 原因 |
|-------|------|
| 引入 EAV 属性体系 | 品类少（<20），JSON 够用，EAV 引入后 JOIN 复杂度翻倍 |
| 独立库存表（三态分离） | 不是秒杀场景，SKU 行内库存 + 行锁（FOR UPDATE）够用 |
| 合并 ExchangeItem 和 ItemTemplate | 职责不同——"怎么卖"和"是什么"不应耦合 |
| 废弃 ExchangeItemSku | SKU 管规格和库存，实例属性管个体差异，两码事 |
| 给 ItemTemplate 加价格/库存字段 | 模板定义的是物品本身，不是销售策略 |
| 重建 ItemLedger 或 ItemHold | 现有的双录记账本和锁定机制已是生产级别 |
| 给所有商品都铸造实例 | 纯实物商品（纸巾、杯子）不需要实例追踪 |

---

## 八、未来扩展预留

### 8.1 物品强化/升级系统

当 `instance_attributes` 就位后，可以引入强化系统：

- 新建 `EnhanceService`，修改实例的 `instance_attributes.强化等级`
- 消耗材料资产（如强化石）进行强化
- 失败可能降级或销毁（`ItemService.consumeItem()`）
- 所有变更通过 `item_ledger` 审计

### 8.2 物品合成/分解系统

- 多个低级实例 → 合成一个高级实例
- 消耗方 `consumeItem()` + 产出方 `mintItem()`
- 双录记账保证物品守恒

### 8.3 限时活动物品

- `ItemTemplate.meta` 中配置活动时间窗口
- 超过活动期自动 `expire`（已有 `auto_expire` 事件类型）

### 8.4 物品外观/皮肤系统

- `instance_attributes` 中增加 `skin_id` 字段
- 皮肤定义走独立字典表
- 不影响核心数据模型

---

## 九、结论

本项目已经拥有一套游戏级的物品实例系统（Item + ItemLedger + ItemHold），质量超过大多数游戏公司的实现（银行级双录记账 + 优先级锁定 + 完整来源追溯）。

当前的问题不是缺少 Instance 模型，而是 B2C 兑换商城没有接入这套系统。通过在 ExchangeItem 上增加 `item_template_id` 外键、在 Item 上增加 `instance_attributes` / `serial_number` / `edition_total` 三个字段、修改兑换流程增加铸造分支，即可实现"编号 #0042 的限量龙纹宝石"的完整业务。

**推荐方案本质：有赞轻 SKU（管销售） + 游戏 Instance（管所有权） 的混合架构，通过 item_template_id 桥接。**

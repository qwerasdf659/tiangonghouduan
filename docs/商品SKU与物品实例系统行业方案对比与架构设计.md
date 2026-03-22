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

#### 步骤一：ExchangeItem 关联 ItemTemplate + 铸造开关

在 `exchange_items` 表新增字段：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| item_template_id | BIGINT | NULL, FK → item_templates | 关联的物品模板（指定"用哪个模板铸造"） |
| mint_instance | BOOLEAN | NOT NULL DEFAULT true | 铸造开关（控制"要不要铸造"） |

- **mint_instance = true（默认）：** 兑换后自动铸造 Item 实例，进入用户背包，可交易
- **mint_instance = false：** 纯实物发货（纸巾、杯子），不产出实例（保持现有逻辑）

两个字段各管各的，两种商品共存，零破坏性。

#### 步骤二：Item 模型增加实例属性

在 `items` 表新增字段：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| instance_attributes | JSON | NULL | 实例独有属性，如 `{"磨损值": 0.073, "强化等级": 7, "花纹种子": 442}` |
| serial_number | INT | NULL | 限量编号，如 42（表示 #0042） |
| edition_total | INT | NULL | 限量总数快照，如 100（铸造时从模板复制） |
| item_template_id | BIGINT | NULL, FK → item_templates | 关联物品模板（补充现有 prize_definition_id 的不足） |

在 `item_templates` 表新增字段：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| max_edition | INT | NULL | 限量总数上限（运营设置，独立于库存，超过后拒绝铸造） |

- `instance_attributes`：第一期只存 SKU 的 spec_values 副本，未来可扩展随机属性
- `serial_number` + `edition_total`：限量编号体系（"第 42 件 / 共 100 件"），按 ItemTemplate 独立计数
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
    → 如果 ExchangeItem.mint_instance = true：
        → ItemService.mintItem() 铸造实例
        → 生成 serial_number（该模板已铸造数 + 1）
        → AttributeRuleEngine 生成 instance_attributes（品质分+纹理编号+SKU副本）
        → 创建 ItemHold（trade_cooldown, 7天）
        → 实例进入用户背包（可见但冷却期内不可交易）
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
│            + AttributeRuleEngine     │    tracking_code = LT260320xxxxx     │
│                                      │    serial_number = #0042/0100        │
│                                      │    instance_attributes:              │
│                                      │      颜色=冰蓝, quality=87.42 精良   │
│                                      │      pattern_id=337                  │
│                                      │    owner = 用户账户                   │
│                                      │                                      │
│                                      ├──→ item_ledger (双录记账)            │
│                                      │                                      │
│                                      ├──→ item_holds (trade_cooldown, 7天) │
│                                      │                                      │
│                                      └──→ 用户背包 (BackpackService)        │
│                                                │  （可见、可用、不可交易）     │
│                                                │  （7天后冷却期结束）          │
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

| 产出渠道 | 是否铸造 Item | Item.source | 是否可交易 | 冷却期 |
|---------|-------------|-------------|----------|--------|
| 抽奖（coupon/physical） | ✅ | `lottery` | ✅ 取决于 is_tradable | 7 天 |
| 竞价中标 | ✅ | `bid_settlement` | ✅ | 7 天 |
| B2C 兑换（mint_instance=true） | ✅ **新增** | `exchange` | ✅ | 7 天 |
| B2C 兑换（mint_instance=false） | ❌ | — | ❌ 走物流发货 | — |
| 管理员赠送 | ✅ | `admin` | ✅ | 可配置 |

---

## 六、改造量评估（初版）

> 注：本节为决策前的初步评估。决策拍板后的完整改造清单见第十章。

| 维度 | 评估 |
|------|------|
| 总改动文件数 | ~10 个 |
| 新建文件数 | 迁移 + 属性规则引擎 + 10 个新模型 |
| 数据库变更 | 10 张新表 + 数据迁移（详见第十章/十一章） |
| 是否破坏现有数据 | 否，数据迁移后旧表废弃 |
| 是否破坏现有接口 | 否，mint_instance=false 时走老逻辑 |
| 预计工时 | 14-18 天（含 EAV 商品中心 + 多渠道 + 随机属性，详见第十一章） |

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

## 九、关键业务决策（行业调研 + 拍板结论）

> 以下四个决策点基于对 Steam、网易藏宝阁、鲸探/iBox、得物、原神/星穹铁道、梦幻西游、NBA Top Shot 等平台的实际做法调研，结合本项目技术栈和业务特征得出。

### 9.1 决策 1：哪些商品铸造实例

#### 行业做法

| 公司/平台 | 做法 | 理由 |
|-----------|------|------|
| **Steam** | 所有进入用户背包的物品都是实例 | 统一的 asset_id 体系，没有例外 |
| **原神/星穹铁道** | 所有获得的物品都是实例 | 武器、圣遗物/遗器每件都独立存在 |
| **网易藏宝阁** | 所有可交易物品都是实例 | 装备/召唤兽都有唯一标识，否则无法交易 |
| **鲸探/iBox（数字藏品）** | 100% 铸造，每件都有链上序列号 | 唯一性是核心卖点 |
| **得物** | 每件商品都有鉴定编号 | 一物一码，但目的是防伪不是交易 |
| **有赞/积分商城** | 从不铸造实例 | 纯电商，不需要 |

**规律：** 凡是有 C2C 交易需求的平台，全部是所有物品都铸造实例，没有"部分铸造部分不铸造"的做法。原因：如果一个物品未来可能被交易，它必须有唯一标识。无法预测用户拿到哪件东西后想卖。

#### ✅ 拍板结论：运营手动开关，默认开启

在 `exchange_items` 表新增 `mint_instance BOOLEAN NOT NULL DEFAULT true`：

- **默认开启（true）：** 兑换后自动铸造 Item 实例，进入用户背包，可交易
- **运营手动关闭（false）：** 纯实物商品（纸巾、杯子）不铸造实例，走传统发货流程

`mint_instance` 和 `item_template_id` 各管各的：`mint_instance` 控制"要不要铸造"，`item_template_id` 指定"用哪个模板铸造"。

items 表膨胀不是问题：BIGINT 主键 + 合理索引，百万行对 MySQL 无压力。

### 9.2 决策 2：实例随机属性

#### 行业做法

| 公司/平台 | 做法 | 上线节奏 |
|-----------|------|---------|
| **CS:GO/Steam** | 铸造时确定 float 值 + paint seed，永不变 | 2013 年上线时就有，是核心玩法 |
| **原神** | 圣遗物有主词条（部分固定/部分随机）+ 4 条随机副词条，强化时随机升级 | 1.0 版本就有完整系统 |
| **星穹铁道** | 遗器系统，头/手主词条固定，其余随机；副词条 3-4 条随机 | 首发就有 |
| **梦幻西游** | 装备有随机附加属性（体力、灵力等），打造时随机 | 2003 年上线时就有 |
| **鲸探/NFT** | 无随机属性，唯一编号就是全部卖点 | — |
| **得物** | 无随机属性 | — |

**规律：** 两个流派泾渭分明：
- **游戏类（有养成体系）：** 从第一天就有随机属性，驱动"反复刷取"的行为循环
- **收藏/交易类（无养成体系）：** 不做随机属性，唯一编号 + 限量 = 全部价值来源

#### ✅ 拍板结论：第一期就做，2 个属性维度（CS:GO 简化版）

> 决策变更：原方案为"第一期不做"，经讨论后改为"第一期同步上线"。
> 原因：随机属性是让同一款商品的不同件之间产生价格差异的核心手段，直接驱动 C2C 交易市场活跃度。唯一编号 + 限量只能制造"有没有"的稀缺，随机属性制造"好不好"的稀缺——后者才是高频交易的引擎。

##### 属性 1：品质分（Quality Score）

**作用：** 决定物品成色，直接影响二手市场定价。类比 CS:GO 的 float 值。

- 数值范围：**0.00 ~ 100.00**（两位小数，10000 个可能值）
- 铸造时加权随机生成，生成后**永不改变**（未来如做强化系统可另议）
- 映射到 5 个人类可读等级：

| 品质分范围 | 等级标签 | 出现概率 | 视觉标识建议 |
|-----------|---------|---------|------------|
| 95.00 ~ 100.00 | 完美无瑕 | 2% | 金色光效 |
| 80.00 ~ 94.99 | 精良 | 13% | 紫色光效 |
| 50.00 ~ 79.99 | 良好 | 35% | 蓝色光效 |
| 20.00 ~ 49.99 | 普通 | 35% | 白色/无光效 |
| 0.00 ~ 19.99 | 微瑕 | 15% | 灰色 |

**为什么用数值而不是直接用等级？**
等级只有 5 档，同一档内没有区分。数值有 10000 档——品质分 99.73 的"完美无瑕"和 95.01 的"完美无瑕"都是完美，但 99.73 在市场上值更多钱。CS:GO 中 float 0.001 和 float 0.069 都是"崭新出厂"，但价格差 10 倍。

**概率分布（加权随机，非均匀分布）：**

```
微瑕区间    [0, 20)     ████████████████  15%
普通区间    [20, 50)    ███████████████████████████████████  35%
良好区间    [50, 80)    ███████████████████████████████████  35%
精良区间    [80, 95)    █████████████  13%
完美区间    [95, 100]   ██  2%
```

先用加权随机选中区间，再在区间内均匀随机取精确值。100 件龙纹宝石里平均只有 2 件"完美无瑕"、13 件"精良"。

##### 属性 2：纹理编号（Pattern ID）

**作用：** 决定宝石的花纹/外观，纯视觉差异。类比 CS:GO 的 paint seed。

- 数值范围：**1 ~ 1000**（整数，均匀分布）
- 铸造时随机生成，永不改变
- 本身不分好坏，但社区会自发发现"好看的编号"

**业务价值：**
CS:GO 里 pattern seed 661 的蓝宝石花纹（Karambit Case Hardened Blue Gem）比普通花纹贵几百倍，因为社区公认"这个编号的花纹最好看"。你的宝石同理——纹理编号 #777 可能被社区视为"幸运编号"，#001 被视为"初始编号"，平台不需要做任何事，用户自己会创造溢价。

##### 铸造时生成的完整 instance_attributes

```json
{
  "颜色": "冰蓝",
  "尺寸": "大",
  "quality_score": 87.42,
  "quality_grade": "精良",
  "pattern_id": 337
}
```

前两个来自 SKU 的 `spec_values`（用户选择的规格），后三个是铸造时系统随机生成的。

##### 属性规则配置（ItemTemplate.meta）

不同商品的属性规则可以不同，配置放在 `item_templates.meta.attribute_rules` 中：

```json
{
  "trade_cooldown_days": 7,
  "attribute_rules": {
    "quality_score": {
      "enabled": true,
      "distribution": [
        { "min": 0, "max": 19.99, "weight": 15, "grade": "微瑕" },
        { "min": 20, "max": 49.99, "weight": 35, "grade": "普通" },
        { "min": 50, "max": 79.99, "weight": 35, "grade": "良好" },
        { "min": 80, "max": 94.99, "weight": 13, "grade": "精良" },
        { "min": 95, "max": 100, "weight": 2, "grade": "完美无瑕" }
      ]
    },
    "pattern_id": {
      "enabled": true,
      "min": 1,
      "max": 1000
    }
  }
}
```

**配置化的好处：**
- 运营可按商品调整概率——某个活动商品想让完美率高一点，改 weight 即可
- 某些商品可关闭随机属性（`enabled: false`），退回纯编号模式
- 不需要改代码、不需要发版，改配置即可
- 未来想加第三个属性维度，往 `attribute_rules` 里加一个 key 即可

##### 对 C2C 交易市场的影响

有了随机属性后，市场的筛选和排序有了实质意义：

- 按品质等级筛选："只看完美无瑕"
- 按品质分排序："品质分从高到低"
- 按纹理编号搜索："找 pattern_id = 661"

买家看到的挂牌信息：

```
🔷 龙纹宝石 #0042/0100
   品质: 87.42分 · 精良
   纹理: #337
   卖家: 张三
   价格: 50 💎
   冷却期: 已结束
```

### 9.3 决策 3：限量编号规则

#### 行业做法

| 公司/平台 | 做法 | 展示方式 |
|-----------|------|---------|
| **鲸探（蚂蚁链）** | 按系列编号 | "#0042 / 10000" |
| **iBox** | 按系列编号 | "#0001 / 3000" |
| **幻核（腾讯，已关）** | 按系列编号 | 同上 |
| **NBA Top Shot** | 按系列编号 | "Moment #42/10000" |
| **CS:GO** | 无用户可见编号 | 靠 float 值区分 |
| **实体收藏品（限量球鞋/手办）** | 按商品编号 | "XX/500 Limited Edition" |
| **拍卖行（苏富比/佳士得）** | 按拍品编号 | Lot #42（拍卖场次内编号） |

**规律：** 100% 按系列/按商品编号，没有全局编号的。全局编号对用户没有任何意义——"#0037"说明不了什么；但"龙纹宝石 #0042/100"表达"限量 100 件中的第 42 件"，才有收藏价值。

#### ✅ 拍板结论：按 ItemTemplate 编号

- 每个 ItemTemplate 独立计数，铸造时自动分配
- 展示格式：`#0042 / 0100`（补零到 edition_total 位数）
- `serial_number` 存在 `items` 表（实例级别）
- `edition_total`（限量总数）存在 `item_templates` 表新增的 `max_edition` 字段
- `max_edition` 由运营手动设置，独立于 `exchange_items.stock`（库存可补货，限量总数不变）
- 铸造时计算：`SELECT COUNT(*) FROM items WHERE item_template_id = ? AND serial_number IS NOT NULL` + 1
- 超过 `max_edition` 时拒绝铸造（限量售罄）

### 9.4 决策 4：交易冷却期

#### 行业做法

| 公司/平台 | 冷却期 | 机制 |
|-----------|-------|------|
| **Steam** | **7 天**，硬性，无例外 | 所有新获得的物品（购买/交易/开箱）都有 7 天交易锁 |
| **网易藏宝阁** | **4 天**（96 小时）公示期 | 道具/召唤兽挂牌后 4 天才能被购买 |
| **梦幻西游** | **180 天**时间锁（跨服装备） | 跨服购买的装备 180 天内不能再交易 |
| **鲸探** | **180 天**持有期 | 购买后 180 天才能转赠（不允许交易） |
| **CS2** | **7 天** | 开箱获得的物品 7 天后才能上架 |
| **5173 等游戏交易平台** | **24-72 小时** | 交易完成后安全审核期 |

**规律：** 所有有二级市场的平台，100% 有冷却期，无一例外。冷却期防三件事：防刷单套利（低价兑换 → 立刻高价挂牌）、防盗号洗货、防机器人批量倒卖。

#### ✅ 拍板结论：7 天冷却期，复用 ItemHold

- 铸造时自动创建 `ItemHold`：
  - `hold_type = 'trade_cooldown'`（新增枚举值）
  - `expires_at = NOW() + 7 days`
  - `priority = 0`（最低优先级，可被 security 覆盖）
  - `reason = '新物品交易冷却期'`
- 冷却期内：用户在背包里能看到物品、能使用，但不能挂牌交易
- 7 天后 hold 自动过期（已有 `idx_holds_active_expiry` 索引支持），变为可交易
- 不同商品可配置不同冷却天数（放在 `ItemTemplate.meta.trade_cooldown_days` 中，默认 7）
- 不需要新建任何表或机制，完全复用现有 ItemHold 基础设施

### 9.5 决策 5：管理后台商品列表视图

#### 行业做法

| 公司/平台 | 做法 | 说明 |
|-----------|------|------|
| **Shopify** | 双视图切换（网格/列表） | 默认列表，可切卡片网格 |
| **有赞** | 双视图切换 | 商品管理支持缩略图模式和列表模式 |
| **淘宝/天猫千牛** | 卡片网格为主 | 商品图片突出展示 |
| **拼多多商家后台** | 列表为主 | 偏数据管理 |
| **Steam 创意工坊/库存** | 卡片网格 | 物品以图片卡片展示 |

**规律：** 图片是商品核心卖点的平台（珠宝、服装、皮肤）倾向网格视图；数据密集型操作（批量改价、库存管理）倾向表格视图。成熟平台通常两者都支持。

#### ✅ 拍板结论：双视图切换，默认网格

- 标题栏右侧放两个切换按钮：`田`（网格）和 `≡`（列表）
- **网格视图（默认）：** 3-4 列卡片，每张展示商品图片、名称、价格、库存、状态角标、品质等级分布（如有），悬浮显示快捷操作（编辑/上下架/SKU 管理）
- **列表视图：** 保持现有 data-table，用于批量操作（批量改价/改分类/排序）和数据对比
- 数据源复用同一个 `dataSource`，只是渲染方式不同
- 用户选择的视图偏好存 `localStorage`，下次打开自动恢复
- 纯前端改造，不动后端

### 9.6 五项决策汇总

| 决策 | 结论 | 行业依据 | 一句话理由 |
|------|------|---------|----------|
| 铸造范围 | 手动开关，默认开启 | Steam/游戏公司全部铸造 | 有 C2C 市场就必须有实例，纸巾类手动关闭 |
| 随机属性 | **第一期同步上线**，品质分 + 纹理编号 | CS:GO float+seed 模式 | 制造"好不好"的稀缺，驱动交易市场活跃 |
| 编号规则 | 按 ItemTemplate 编号 | 鲸探/iBox/NBA Top Shot 全部按系列 | "限量 100 件中的第 42 件"才有收藏意义 |
| 交易冷却 | 7 天，复用 ItemHold | Steam 7 天、网易 4 天、鲸探 180 天 | 有二级市场 100% 有冷却期 |
| 后台商品列表 | 双视图切换，默认网格 | Shopify/有赞均支持双视图 | 宝石类商品图片是核心，网格直观；批量操作切表格 |

---

## 十、改造清单（已跳过，合并到第十一章）

> **已跳过：** 本章为在现有 `exchange_items` 上加字段的小改造方案。经确认直接执行第十一章（EAV 大改造），本章能力全部包含在第十一章中。以下内容保留作为历史参考。

基于第九章的四项决策结论，更新后的完整改造清单：

### 10.1 数据库迁移

| 表 | 改动 | 字段 | 说明 |
|----|------|------|------|
| exchange_items | ADD COLUMN | `item_template_id BIGINT NULL FK` | 关联物品模板 |
| exchange_items | ADD COLUMN | `mint_instance BOOLEAN NOT NULL DEFAULT true` | 铸造开关（决策 1） |
| items | ADD COLUMN | `instance_attributes JSON NULL` | 实例属性（决策 2，品质分+纹理编号+SKU 副本） |
| items | ADD COLUMN | `serial_number INT NULL` | 限量编号（决策 3） |
| items | ADD COLUMN | `edition_total INT NULL` | 限量总数快照 |
| items | ADD COLUMN | `item_template_id BIGINT NULL FK` | 关联物品模板 |
| item_templates | ADD COLUMN | `max_edition INT NULL` | 限量总数上限（决策 3） |
| exchange_records | ADD COLUMN | `item_id BIGINT NULL FK` | 关联产出的物品实例 |
| item_holds | ALTER ENUM | `hold_type` 新增 `'trade_cooldown'` | 交易冷却锁类型（决策 4） |

共 1 个迁移文件，9 项 DDL 变更。

### 10.2 模型层

| 文件 | 改动 |
|------|------|
| models/ExchangeItem.js | 新增 `item_template_id` + `mint_instance` 字段，belongsTo ItemTemplate |
| models/Item.js | 新增 `instance_attributes` + `serial_number` + `edition_total` + `item_template_id` 字段 |
| models/ItemTemplate.js | 新增 `max_edition` 字段 |
| models/ExchangeRecord.js | 新增 `item_id` 字段，belongsTo Item |
| models/ItemHold.js | `hold_type` ENUM 新增 `'trade_cooldown'`，HOLD_PRIORITY 新增 `trade_cooldown: 0` |

### 10.3 服务层

| 文件 | 改动 |
|------|------|
| services/exchange/CoreService.js | `exchangeItem()` 增加铸造分支：检查 `mint_instance` → 调用 `mintItem()` → 分配编号 → 生成随机属性 → 创建冷却 hold |
| services/exchange/AdminService.js | 商品创建/编辑增加 `item_template_id` + `mint_instance` 字段 |
| services/item/ItemService.js | `mintItem()` 增加 `serial_number` 分配逻辑 + `trade_cooldown` hold 创建 |
| **新建** services/item/AttributeRuleEngine.js | 属性规则引擎：读取 `ItemTemplate.meta.attribute_rules`，按配置的概率分布生成 `quality_score`（加权随机）+ `quality_grade`（等级映射）+ `pattern_id`（均匀随机），合并 SKU `spec_values` 副本，输出完整 `instance_attributes` JSON |

### 10.4 前端

| 文件 | 改动 |
|------|------|
| admin/exchange-market.html | 商品表单增加"铸造物品实例"开关 + "关联物品模板"下拉 + "限量总数"输入 |
| admin/exchange-market.html | 商品列表增加双视图切换（网格/列表），默认网格，`localStorage` 记忆偏好（决策 5） |
| admin/src/modules/market/composables/exchange-items.js | itemForm 增加 `mint_instance` + `item_template_id` 字段 |
| admin/src/modules/market/pages/exchange-market.js | 新增 `viewMode` 状态 + 网格视图渲染逻辑，复用现有 dataSource |
| admin 物品模板管理页 | 属性规则配置表单：品质分概率分布编辑 + 纹理编号范围设置 + 启用/禁用开关 |
| C2C 市场列表页 | 展示编号（#0042/0100）、品质分 + 等级标签、纹理编号、冷却倒计时 |
| C2C 市场筛选栏 | 按品质等级筛选 + 按品质分排序 + 按纹理编号搜索 |

---

## 十一、升级方案：统一商品中心 + EAV 属性体系 + 多渠道销售

> 本章基于业务规模预期升级（几千品类、几十万 SKU、兑换 + 人民币购买并存），将原有的有赞轻 SKU（JSON 属性）替换为阿里级 EAV 属性体系，并引入统一商品中心支撑多销售渠道。
>
> 决策依据：品类扩展到几千个后，JSON `spec_values` 无法支撑按属性组合筛选（如"颜色=冰蓝 且 尺寸=大"），需要 EAV 独立表 + SQL 索引。

### 11.1 核心问题

同一个商品，两种买法：
- 用户 A 花 10 个红水晶碎片**兑换**
- 用户 B 花 99 元人民币**购买**
- 两人拿到同一款商品，进同一个背包，在同一个 C2C 市场交易

如果兑换和购买各维护一套商品数据，改名称要改两处、改图片要改两处、改库存要两边同步——维护灾难。

### 11.2 四层架构设计

```
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 1: 统一商品中心（EAV，8 张表）                                 │
│                                                                     │
│  categories → category_attributes → attributes → attribute_options │
│       ↓                                                             │
│  products → product_attribute_values                                │
│       ↓                                                             │
│  product_skus → sku_attribute_values                                │
│       ↓                                                             │
│  库存统一在 product_skus.stock                                       │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 2: 销售渠道（2 张表，未来可扩展）                               │
│                                                                     │
│  exchange_channel_prices（材料兑换定价）                              │
│  shop_channel_prices（人民币购物定价）                                │
│  未来可扩：积分渠道、会员专属渠道、团购渠道……每加一个渠道加一张表      │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 3: 订单层（各渠道独立）                                       │
│                                                                     │
│  exchange_records（兑换订单，现有，改 FK 指向 product_skus）          │
│  shop_orders（购物订单，新建）                                       │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 4: 物品系统（完全不变）                                       │
│                                                                     │
│  item_templates → items → item_ledger → item_holds                 │
│  品质分 + 纹理编号 + 限量编号 + 7天冷却 + C2C 交易                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.3 统一商品中心表结构（Layer 1 — EAV 属性体系）

#### 表 1：品类树（categories）

管"有哪些品类"，支持多级层次结构。

| 字段 | 类型 | 说明 |
|------|------|------|
| category_id | INT PK | 品类ID |
| parent_category_id | INT NULL FK → self | 父品类（NULL=顶级） |
| category_name | VARCHAR(100) | "宝石" / "数码" / "服装" |
| category_code | VARCHAR(50) UNIQUE | "gems" / "digital" / "clothing" |
| level | TINYINT | 1=一级 2=二级 3=三级 |
| sort_order | INT | 排序 |
| is_enabled | BOOLEAN | 是否启用 |
| icon_media_id | BIGINT NULL FK → media_files | 品类图标 |

举例：
```
数码(1级) → 手机(2级) → 安卓手机(3级)
宝石(1级) → 天然宝石(2级)
服装(1级) → 上装(2级) → T恤(3级)
```

> 注：此表替代现有 `category_defs` 表，扩展了层级结构。

#### 表 2：属性定义（attributes）

管"系统里有哪些属性可以用"。

| 字段 | 类型 | 说明 |
|------|------|------|
| attribute_id | INT PK | 属性ID |
| attribute_name | VARCHAR(100) | "颜色" / "内存" / "尺码" |
| attribute_code | VARCHAR(50) UNIQUE | "color" / "memory" / "size" |
| input_type | ENUM('select','text','number') | 下拉选择 / 文本输入 / 数字输入 |
| is_required | BOOLEAN | 是否必填 |
| is_sale_attr | BOOLEAN | **是否销售属性**（决定是否影响 SKU 生成） |
| is_searchable | BOOLEAN | 是否可搜索筛选 |
| sort_order | INT | 排序 |
| is_enabled | BOOLEAN | 是否启用 |

**`is_sale_attr` 是关键字段：**
- `true`（销售属性）= 颜色、尺码 → 不同组合生成不同 SKU，各自有独立价格和库存
- `false`（普通属性）= 材质、产地 → 只是展示信息，不影响 SKU 拆分

#### 表 3：属性预设值（attribute_options）

管"每个属性有哪些可选值"。

| 字段 | 类型 | 说明 |
|------|------|------|
| option_id | INT PK | 选项ID |
| attribute_id | INT FK → attributes | 所属属性 |
| option_value | VARCHAR(200) | "冰蓝" / "火红" / "256GB" / "XL" |
| sort_order | INT | 排序 |
| is_enabled | BOOLEAN | 是否启用 |

#### 表 4：品类绑定属性（category_attributes）

管"每个品类有哪些属性"——EAV 的核心，实现不同品类不同属性模板。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| category_id | INT FK → categories | 品类 |
| attribute_id | INT FK → attributes | 属性 |
| sort_order | INT | 该品类内的属性排序 |

举例：
```
宝石品类 → 绑定：颜色、尺寸、切工、净度
手机品类 → 绑定：颜色、内存、存储、屏幕尺寸
服装品类 → 绑定：颜色、尺码、面料、版型
```

运营新加一个品类"食品"，只需往此表插几行，绑定"口味、重量、保质期"属性即可，不需要改代码。

#### 表 5：统一 SPU（products）

**替代现有 `exchange_items`**，成为所有渠道共享的商品主体。

| 字段 | 类型 | 说明 |
|------|------|------|
| product_id | BIGINT PK | 商品ID |
| product_name | VARCHAR(200) | "龙纹宝石" |
| category_id | INT FK → categories | 所属品类 |
| description | TEXT | 商品描述（富文本） |
| primary_media_id | BIGINT FK → media_files | 主图 |
| item_template_id | BIGINT NULL FK → item_templates | 关联物品模板（决策 1） |
| mint_instance | BOOLEAN DEFAULT true | 铸造开关（决策 1） |
| rarity_code | VARCHAR(50) FK → rarity_defs | 稀有度 |
| status | ENUM('active','inactive') | 状态 |
| sort_order | INT | 排序 |
| space | VARCHAR(20) | lucky/premium/both |
| is_pinned | BOOLEAN | 是否置顶 |
| is_new | BOOLEAN | 是否新品 |
| is_hot | BOOLEAN | 是否热门 |
| is_limited | BOOLEAN | 是否限量 |
| tags | JSON | 标签数组 |
| sell_point | VARCHAR(200) | 营销卖点 |
| usage_rules | JSON | 使用说明 |
| video_url | VARCHAR(500) | 视频 URL |
| stock_alert_threshold | INT DEFAULT 0 | 库存预警阈值 |
| publish_at | DATETIME NULL | 定时上架 |
| unpublish_at | DATETIME NULL | 定时下架 |
| attributes_json | JSON NULL | 商品参数表快照（非 EAV 的补充，如长篇图文参数） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### 表 6：SPU 属性值（product_attribute_values）

管"这个 SPU 的非销售属性值是什么"（材质=天然水晶，产地=巴西）。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK | 主键 |
| product_id | BIGINT FK → products | 商品 |
| attribute_id | INT FK → attributes | 属性 |
| attribute_value | VARCHAR(500) | "天然水晶" / "巴西" |

#### 表 7：统一 SKU（product_skus）

**替代现有 `exchange_item_skus`**。

| 字段 | 类型 | 说明 |
|------|------|------|
| sku_id | BIGINT PK | SKU ID |
| product_id | BIGINT FK → products | 所属商品 |
| sku_code | VARCHAR(100) UNIQUE | 唯一编码（如 "dragon_gem_blue_L"） |
| stock | INT | **统一库存**（所有渠道共享，卖出即减） |
| sold_count | INT DEFAULT 0 | 已售数量 |
| cost_price | DECIMAL(10,2) | 成本价（人民币） |
| status | ENUM('active','inactive') | 状态 |
| image_id | BIGINT NULL FK → media_files | SKU 专属图片 |
| sort_order | INT | 排序 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### 表 8：SKU 销售属性值（sku_attribute_values）

**替代原来的 JSON `spec_values`**，实现 SQL 级别的属性筛选。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK | 主键 |
| sku_id | BIGINT FK → product_skus | 所属 SKU |
| attribute_id | INT FK → attributes | 属性（如"颜色"） |
| option_id | INT FK → attribute_options | 属性值（如"冰蓝"） |

举例：SKU "冰蓝·大号" 有两行记录：
```
sku_id=100 | attribute_id=1(颜色) | option_id=3(冰蓝)
sku_id=100 | attribute_id=2(尺寸) | option_id=7(大)
```

查询"所有颜色=冰蓝的 SKU"：`WHERE attribute_id=1 AND option_id=3`，走索引，百万行也快。

### 11.4 销售渠道表（Layer 2）

#### 表 9：兑换渠道定价（exchange_channel_prices）

管"这个 SKU 在兑换商城里用什么材料换、换多少"。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK | 主键 |
| sku_id | BIGINT FK → product_skus | 关联 SKU |
| cost_asset_code | VARCHAR(50) | 支付的材料资产类型（如 "red_shard"） |
| cost_amount | BIGINT | 需要的数量（如 10） |
| original_amount | BIGINT NULL | 原价（划线价） |
| is_enabled | BOOLEAN | 是否在兑换渠道上架 |
| publish_at | DATETIME NULL | 定时上架 |
| unpublish_at | DATETIME NULL | 定时下架 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### 表 10：购物渠道定价（shop_channel_prices）

管"这个 SKU 用人民币卖多少钱"。

> **本期同步建设：** 表 + 模型 + ShopOrderService（下单、支付回调、退款、对账）+ 微信支付/支付宝 API 接入，全部在本期完成。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK | 主键 |
| sku_id | BIGINT FK → product_skus | 关联 SKU |
| price | DECIMAL(10,2) | 售价（人民币） |
| original_price | DECIMAL(10,2) NULL | 原价（划线价） |
| is_enabled | BOOLEAN | 是否在购物渠道上架 |
| publish_at | DATETIME NULL | 定时上架 |
| unpublish_at | DATETIME NULL | 定时下架 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**同一个 SKU 可以同时在两个渠道上架**——兑换商城卖 10 个红水晶碎片，购物商城卖 ¥99。库存是共享的（`product_skus.stock`），不管从哪个渠道卖出去都减 1。

### 11.5 与现有系统的关系

| 现有模型 | 处理方式 | 说明 |
|---------|---------|------|
| `exchange_items` | **被 `products` 替代** | 数据迁移到 products 表，旧表废弃 |
| `exchange_item_skus` | **被 `product_skus` + `sku_attribute_values` 替代** | 原 `spec_values` JSON 拆为 EAV 行 |
| `exchange_records` | **保留** | FK 从 `exchange_item_id` 改指向 `product_id` + `sku_id` |
| `category_defs` | **被 `categories` 替代** | 扩展了层级结构（parent_category_id） |
| `item_templates` | **不变** | `products.item_template_id` 指向它 |
| `items` / `item_ledger` / `item_holds` | **完全不变** | Layer 4 物品系统不受影响 |
| `market_listings` / `trade_orders` | **完全不变** | C2C 交易系统不受影响 |
| `account_asset_balances` | **完全不变** | 资产账本系统不受影响 |

### 11.6 EAV 属性 vs 实例随机属性的层次关系

这两种属性管的是完全不同阶段的事，互不干扰：

| 维度 | EAV 属性（品类规格） | 实例随机属性 |
|------|-------------------|------------|
| 管什么 | "这个商品有什么可选项" | "这一件具体品质怎么样" |
| 谁决定 | 运营配置 | 系统铸造时随机生成 |
| 用户操作 | 下单前选择（颜色、尺码） | 无法选择，开箱惊喜 |
| 存在哪 | Layer 1 EAV 表（`sku_attribute_values`） | Layer 4 物品实例（`items.instance_attributes` JSON） |
| 影响价格 | 是——不同 SKU 不同价格 | 不直接影响，但影响二手市场价值 |
| 影响库存 | 是——每个 SKU 独立库存 | 否 |
| 同款之间 | 一样——所有"冰蓝·大号"规格相同 | 不一样——每件品质分和纹理都不同 |
| 类比 | 货架上的标签 | 开箱后的惊喜 |

### 11.7 完整数据流（EAV + Instance 统一版）

```
运营在后台：
  1. 创建品类"宝石"，绑定属性：颜色、尺寸、切工     ← Layer 1 EAV
  2. 创建商品"龙纹宝石"，关联品类"宝石"              ← Layer 1 products
  3. 创建 SKU：冰蓝·大 / 火红·小 / 翡翠绿·中        ← Layer 1 product_skus + sku_attribute_values
  4. 配置兑换价：冰蓝·大 = 10红水晶碎片               ← Layer 2 exchange_channel_prices
  5. 配置购物价：冰蓝·大 = ¥99                       ← Layer 2 shop_channel_prices
  6. 关联物品模板，开启铸造，配置品质分概率             ← item_template_id + mint_instance + attribute_rules

用户兑换：
  1. 选择"龙纹宝石 冰蓝·大"                         ← SKU 选择（EAV 属性）
  2. 扣 10 红水晶碎片                                ← AccountAssetBalance 扣减
  3. 扣 product_skus.stock（共享库存）                ← 不管哪个渠道卖出都扣这里
  4. 建 exchange_records                             ← 兑换订单
  5. 铸造 Item 实例 #0042/0100                       ← ItemService.mintItem()
     品质分 87.42 精良，纹理 #337                     ← AttributeRuleEngine 随机生成
  6. 创建 trade_cooldown hold（7天）                  ← ItemHold
  7. 实例进入用户背包                                  ← 可见、可用、7天内不可交易

用户购买（新渠道）：
  1. 选择"龙纹宝石 冰蓝·大"                         ← 同一个 SKU
  2. 创建 shop_orders（待支付）                       ← ShopOrderService.createOrder()
  3. 调起微信支付/支付宝                              ← 支付网关（微信 JSAPI/Native + 支付宝当面付）
  4. 支付回调 → 订单状态改为已支付                     ← ShopOrderService.handlePaymentCallback()
  5. 扣 product_skus.stock（同一个库存）              ← 和兑换共享库存
  6. 铸造 Item 实例（与兑换完全一致）                  ← 复用同一套 mintItem()
  7. 退款场景 → 原路退回 + 销毁实例                   ← ShopOrderService.refund() + consumeItem()

C2C 交易（不变）：
  7天后 → 挂牌 → 买家看到"张三的 #0042 龙纹宝石 品质87.42 精良 纹理#337"
  → 买家扣钻石 → transferItem() → 物品转移到买家背包
```

### 11.8 工作量评估

> **执行策略：** 跳过第十章（小改造），直接执行第十一章（EAV 大改造）。第十章的能力（铸造实例、随机属性、限量编号、冷却期）全部包含在第十一章中，不需要分两步。购物渠道支付系统同步建设。

| 项目 | 内容 | 工时 |
|------|------|------|
| 数据库迁移 | 8 张商品中心表 + 2 张渠道表 + shop_orders 表，共 11 张新表 | 2 天 |
| 模型层 | 11 个新 Sequelize 模型 + 关联定义 | 1 天 |
| 商品中心服务层 | ProductService（CRUD）+ AttributeService（属性管理）+ SKU 笛卡尔积生成 | 3-4 天 |
| 购物渠道订单 | ShopOrderService（下单、支付回调、发货、退款、对账） | 2-3 天 |
| 支付网关接入 | 微信支付（JSAPI/Native）+ 支付宝（当面付），回调验签、退款 API | 2-3 天 |
| 兑换流程对接 | exchange CoreService 改指向 products + product_skus + 铸造实例 + 冷却 hold | 1-2 天 |
| 数据迁移脚本 | exchange_items → products，exchange_item_skus → product_skus + sku_attribute_values | 1 天 |
| 管理后台 | 品类管理页 + 属性管理页 + 统一商品编辑页 + 渠道定价配置 + 卡片网格视图 + 购物订单管理 | 4-5 天 |
| 属性规则引擎 | AttributeRuleEngine（品质分 + 纹理编号随机生成） | 0.5 天 |
| C2C 市场适配 | 展示品质分、编号、等级标签、筛选排序 | 0.5 天 |
| **总计** | | **17-22 天** |

### 11.9 未来扩展能力

EAV + 多渠道架构建好后，以下扩展都是**纯配置操作，不需要改代码**：

| 扩展场景 | 操作 |
|---------|------|
| 新增品类（如"食品"） | 后台创建品类 → 绑定属性（口味、重量、保质期）→ 完 |
| 新增属性（如"产地"） | 后台创建属性 → 绑定到相关品类 → 完 |
| 新增销售渠道（如"积分商城"） | 新建一张 `points_channel_prices` 表 → 完 |
| 新增销售渠道（如"会员专属"） | 新建一张 `vip_channel_prices` 表 → 完 |
| 某商品只在兑换渠道卖 | `exchange_channel_prices.is_enabled = true`，购物渠道不配置 |
| 某商品只用人民币卖 | `shop_channel_prices.is_enabled = true`，兑换渠道不配置 |

---

## 十二、结论

本项目的最终架构为**四层混合体系**，整合了行业五大方案中的四种：

| 层级 | 方案来源 | 职责 | 核心表 |
|------|---------|------|-------|
| Layer 1 | 阿里 EAV | 统一商品目录（品类、属性、SPU/SKU） | 8 张表 |
| Layer 2 | 多渠道定价 | 兑换定价 + 购物定价（未来可扩展） | 2 张表 |
| Layer 3 | 有赞/电商 | 订单管理（兑换订单 + 购物订单） | 2 张表 |
| Layer 4 | CS:GO/Steam | 物品实例（铸造、所有权、交易、随机属性） | 4 张表（现有） |

**原有的有赞轻 SKU（JSON `spec_values`）被 EAV 完整替代**，`exchange_items` 和 `exchange_item_skus` 迁移到统一商品中心后废弃。物品系统（Item + ItemLedger + ItemHold）和 C2C 交易系统完全不受影响。

本文档定义的全部改造包括：

- 统一商品中心（EAV 属性体系，支撑几千品类、几十万 SKU）
- 多渠道销售（材料兑换 + 人民币购买，共享库存，独立定价）
- 购物渠道支付系统（ShopOrderService + 微信支付/支付宝接入 + 退款对账）
- 物品实例铸造（唯一编号 #0042/0100 + 品质分 87.42 精良 + 纹理 #337）
- 配置化属性规则（运营可调概率分布，不需要改代码）
- 7 天交易冷却期（复用 ItemHold）
- 管理后台卡片网格视图（双视图切换）

**推荐方案本质：阿里 EAV（管商品目录）+ 多渠道定价（管怎么卖）+ 微信/支付宝支付（管收钱）+ CS:GO Instance（管所有权+随机属性）的四合一架构。**

**预计总工时：17-22 天。**

---

## 十三、真实数据库校验报告（2026-03-20 实机验证）

> **数据来源：** 直接通过 Node.js + Sequelize 连接生产数据库 `restaurant_points_dev`（dbconn.sealosbja.site:42569），非备份文件。
> **验证时间：** 2026-03-20，以下所有数据为实时查询结果。

### 13.1 数据库全局概况

| 指标 | 实际值 |
|------|-------|
| 总表数 | 113 张 |
| Sequelize 模型数 | 113 个（完全对齐） |
| API 路由版本 | `/api/v4/*`（V4 RESTful 扁平化设计） |
| 服务注册方式 | `ServiceManager` snake_case 键（如 `exchange_core`） |
| 三层架构 | Routes → Services → Models |

### 13.2 文档涉及核心表的真实状态

| 表名 | 行数 | 文档描述 vs 真实状态 |
|------|------|---------------------|
| `exchange_items` | **5** | 无 `item_template_id`、无 `mint_instance`——文档提案尚未落地 |
| `exchange_item_skus` | **5** | 全部 `spec_values = {}`——多规格 SKU 功能从未实际使用 |
| `exchange_records` | **9** | 无 `item_id`——兑换订单不关联物品实例，确认核心断裂 |
| `item_templates` | **13** | 无 `max_edition`——限量编号功能尚未落地 |
| `items` | **7,832** | 无 `item_template_id`、无 `instance_attributes`、无 `serial_number`、无 `edition_total` |
| `item_ledger` | **18,170** | 双录记账正常运行，SUM(delta)=0 守恒 |
| `item_holds` | **244** | `hold_type` ENUM 只有 `trade/redemption/security`，无 `trade_cooldown` |
| `market_listings` | **316** | `listing_kind` 支持 `item` 和 `fungible_asset` 两种 |
| `trade_orders` | **150** | 交易订单系统正常运行 |
| `category_defs` | **9** | **已有 `parent_category_def_id` 字段**，已支持层级结构 |
| `rarity_defs` | **5** | common / uncommon / rare / epic / legendary |
| `material_asset_types` | **16** | 16 种材料资产类型已定义 |
| `account_asset_balances` | **88** | 统一账本正常运行，含 `lottery_campaign_id` 分区 |
| `accounts` | — | `account_type` ENUM: `user/system`，统一账户体系 |

### 13.3 items 表物品分布（真实数据）

| item_type | source | status | 数量 |
|-----------|--------|--------|------|
| product | lottery | available | 1,874 |
| voucher | legacy | available | 1,599 |
| voucher | legacy | used | 1,526 |
| voucher | lottery | available | 1,235 |
| voucher | legacy | held | 433 |
| tradable_item | legacy | available | 203 |
| tradable_item | test | available | 194 |
| product | legacy | available | 82 |
| tradable_item | legacy | held | 56 |

**关键发现：** `items.source` 没有 `exchange` 值——确认 B2C 兑换流程从未调用 `ItemService.mintItem()`，兑换产出不进入物品系统。

### 13.4 item_templates 真实数据（全部 13 条）

| template_code | item_type | rarity | display_name | category |
|---------------|-----------|--------|-------------|----------|
| voucher_50_yuan | voucher | common | 50元优惠券 | 优惠券 |
| voucher_discount_10 | voucher | uncommon | 9折优惠券 | 优惠券 |
| voucher_discount_20 | voucher | rare | 8折优惠券 | 优惠券 |
| food_set_meal_single | voucher | common | 单人套餐券 | 餐饮美食 |
| food_set_meal_family | voucher | rare | 家庭套餐券 | 餐饮美食 |
| electronics_wireless_earbuds | product | rare | 无线蓝牙耳机 | 电子产品 |
| electronics_portable_charger | product | uncommon | 移动电源 | 电子产品 |
| electronics_smartphone | product | legendary | 智能手机 | 电子产品 |
| gift_card_100 | voucher | uncommon | 100元礼品卡 | 礼品卡 |
| gift_card_200 | voucher | rare | 200元礼品卡 | 礼品卡 |
| gift_card_500 | voucher | epic | 500元礼品卡 | 礼品卡 |
| home_kitchen_set | product | rare | 厨房用品套装 | 家居生活 |
| home_towel_set | product | common | 毛巾礼盒 | 家居生活 |

### 13.5 exchange_items 真实数据（全部 5 条）

| item_name | cost_asset_code | cost_amount | stock | sold_count | status |
|-----------|----------------|-------------|-------|------------|--------|
| 衣服 | red_shard | 10 | 43 | 7 | active |
| 宝石1 | red_shard | 100 | 299 | 1 | active |
| 222 | red_shard | 1 | 0 | 0 | inactive |
| 222 | red_shard | 1 | 1 | 0 | active |
| 111 | DIAMOND | 500 | 0 | 0 | inactive |

**关键发现：** 5 条商品中 3 条为测试数据（222/111），实际有效商品仅 2 条。5 个 SKU 全部 `spec_values = {}`，多规格 SKU 功能从未使用。

### 13.6 exchange_records 真实数据（全部 9 条）

| source | status | 数量 |
|--------|--------|------|
| exchange | pending | 7 |
| exchange | completed | 1 |
| exchange | refunded | 1 |

### 13.7 market_listings 交易市场分布

| listing_kind | status | 数量 |
|--------------|--------|------|
| item | on_sale | 21 |
| item | sold | 6 |
| item | withdrawn | 7 |
| fungible_asset | sold | 16 |
| fungible_asset | withdrawn | 266 |

### 13.8 exchange CoreService.exchangeItem() 实际流程验证

通过代码审查确认当前兑换流程：

```
扣材料资产(BalanceService.changeBalance) → 扣 SPU/SKU 库存 → 建 ExchangeRecord → 完
```

**不存在**对 `ItemService.mintItem()` 的任何调用。`ItemService.mintItem()` 目前仅被抽奖系统和竞价结算系统调用。

### 13.9 items 表与 item_templates 表的关联方式

真实代码中 `items` 通过 `prize_definition_id` 关联 `lottery_prizes`，**不是直接关联** `item_templates`。`ItemTemplate` 模型注释明确写道：

> "items 表使用 prize_definition_id 关联 lottery_prizes，不再直接关联 item_templates。物品模板 → 物品的关系通过 lottery_prizes 间接建立"

这意味着文档中提出的 `items.item_template_id` 是一个**新建的直接关联**，不是修复现有关联。

---

## 十四、文档内部矛盾与决策评估

### 14.1 EAV 方案的内部矛盾（第七章 vs 第十一章）— ✅ 已解决

> **矛盾已解决：** 用户于 2026-03-20 拍板选择第十一章 EAV 大改造方案。第七章 "禁止引入 EAV" 条目作废。

**第七章 "禁止事项" 原文：**

> ~~"引入 EAV 属性体系——品类少（<20），JSON 够用，EAV 引入后 JOIN 复杂度翻倍"~~（已作废）

**第十一章（已采纳）：**

> "将原有的有赞轻 SKU（JSON 属性）替换为阿里级 EAV 属性体系"

**真实数据（作为基线参考）：**
- 当前品类 **9 个**，其中 4 个已禁用（is_enabled=0）
- 实际启用品类仅 **5 个**（家居生活、生活日用、美食饮品、收藏品、其他）
- 当前 SKU 全部 `spec_values = {}`，多规格 SKU 从未使用
- `category_defs` 已支持 `parent_category_def_id` 层级结构

**拍板理由：** 项目未上线，一步到位；EAV 建好后新增品类/属性纯配置操作，长期维护成本低。

### 14.2 品类规模预测问题

第十一章基于 "品类扩展到几千个" 的假设，但：

- 餐厅积分抽奖系统的商品品类天然有限（餐饮券、电子产品、家居、礼品卡、收藏品）
- 本项目不是通用电商平台，品类不会自然增长到 "几千个"
- 当前 9 个品类覆盖了可预见的全部业务场景

### 14.3 第十章（小改造）vs 第十一章（EAV 大改造）对比

| 维度 | 第十章（小改造） | 第十一章（EAV 大改造） |
|------|---------------|---------------------|
| 新建表数 | 0 张 | 11 张 |
| DDL 变更 | 9 项 ADD COLUMN | 11 张新表 + 数据迁移 |
| 工时 | 5-7 天 | 17-22 天 |
| 品类支撑 | <100 个（JSON） | 几千个（EAV） |
| 属性筛选 | JSON 函数索引 | SQL 原生索引 |
| 维护复杂度 | 低 | 高（8 张商品中心表 JOIN） |
| 是否解决核心问题 | ✅ 完全解决（兑换→铸造打通） | ✅ 解决 + 额外支撑万级 SKU |
| 实际需要？ | ✅ 匹配当前和可预见规模 | ⚠️ 超出当前需求 3-4 个数量级 |

---

## 十五、⚠️ 需要拍板的决策点

### 决策 6（新增）：选择第十章还是第十一章

> **这是最关键的决策，直接影响工时、复杂度和长期维护成本。**

| 选项 | 方案 | 工时 | 适用场景 |
|------|------|------|---------|
| A | 第十章（小改造）— 在现有 `exchange_items` 上加字段打通物品系统 | 5-7 天 | 品类 <100、SKU <万级、当前阶段 |
| **✅ B** | **第十一章（EAV 大改造）— 新建统一商品中心 + EAV 属性体系** | **17-22 天** | **品类 >500、SKU >十万级、多渠道定价** |
| C | 分步走 — 先执行第十章上线，验证业务后再评估是否升级到第十一章 | 5-7 天 + 后续按需 | 不确定未来规模时的稳妥选择 |

#### ✅ 已拍板：选 B — 第十一章 EAV 大改造

**拍板理由：** 项目未上线，一步到位成本最低。EAV 一旦建好，新增品类/属性纯配置操作，长期维护成本低。不需要先做小改造再做大改造的二次重构。

> **注：** 第十四章指出的 "第七章禁止 EAV vs 第十一章引入 EAV" 矛盾现已解决——用户明确选择 EAV 大改造方案，第七章的 "禁止 EAV" 条目作废，以第十一章方案为准。

### 决策 7（新增）：人民币购买渠道是否在本期

第十一章包含了 `shop_channel_prices` + `shop_orders` + 微信支付/支付宝接入，这是一个独立的大需求。

| 选项 | 说明 | 额外工时 |
|------|------|---------|
| 在本期 | 统一商品中心 + 兑换渠道 + 购物渠道同步建设 | +5-6 天（支付网关+订单系统） |
| **✅ 不在本期** | **只做兑换渠道 + 物品系统打通，购物渠道未来用充值模型** | **0** |

#### ✅ 已拍板：不做人民币购买，全走材料资产兑换

**结论：** 保持当前状态——用户通过抽奖获得材料资产，材料资产兑换商品。完全不涉及 RMB 支付，不需要接入任何支付系统。

**当前已有的完整闭环：**

```
用户消费 → 获得积分 → 抽奖 → 获得材料资产（红水晶碎片等）
                                    ↓
                              材料资产兑换商品（B2C）
                                    ↓
                              物品实例进入背包
                                    ↓
                              C2C 市场用 DIAMOND 交易
```

**不做 RMB 支付的理由：**
1. 当前业务闭环已完整，材料资产兑换覆盖全部商品获取场景
2. 不涉及 RMB 支付 = 不需要接入微信支付/支付宝 = 零支付合规风险
3. C2C 市场已用 DIAMOND 结算（150 笔真实交易），虚拟货币体系已自洽
4. 减少工时：第十一章原方案的 `shop_channel_prices`、`shop_orders`、ShopOrderService、支付网关接入全部不做

**从第十一章中移除的内容：**

| 原方案内容 | 处理 |
|-----------|------|
| `shop_channel_prices` 表 | ❌ 不建 |
| `shop_orders` 表 | ❌ 不建 |
| `ShopOrderService`（下单、支付回调、退款、对账） | ❌ 不做 |
| 微信支付（JSAPI/Native）+ 支付宝接入 | ❌ 不做 |
| 第十一章 11.7 "用户购买" 数据流 | ❌ 不适用 |

**保留的内容：**
- `exchange_channel_prices` 表（兑换渠道定价）——这是唯一的销售渠道
- Layer 2 多渠道架构设计保留扩展能力——未来如需 RMB 入口，加一张渠道定价表即可

### 决策 8（新增）：items 表与 item_templates 的关联方式

当前 `items` 通过 `prize_definition_id → lottery_prizes` 间接关联模板，文档提出新增 `items.item_template_id` 直接关联。

| 选项 | 说明 |
|------|------|
| **✅ 新增直接外键** | **`items.item_template_id` → `item_templates`，所有来源统一用此字段** |
| 保持间接关联 | 抽奖来源继续用 `prize_definition_id`，兑换来源用新字段 `exchange_item_id` |

#### ✅ 已拍板：新增直接外键，无争议

**行业验证：** 100% 的公司（Steam / 原神 / 暴雪 / 淘宝 / 有赞 / Shopify）都用直接关联。没有任何公司用间接关联来管理 "物品实例 → 物品定义" 的关系。

**执行方案：**
- 新增 `items.item_template_id BIGINT NULL FK → item_templates`
- 所有来源（抽奖/兑换/竞价/管理员）统一用 `item_template_id` 标识 "这个物品是什么"
- `prize_definition_id` 保留但降级为来源追溯信息——仅表示 "这个物品是从哪个奖品池抽到的"，不再作为 "这个物品是什么" 的主要关联
- 历史 7,832 条 `items` 记录可通过 `lottery_prizes → item_templates` 关系回填 `item_template_id`

---

## 十六、问题归属分析（后端 / Web管理后台 / 微信小程序）

### 16.1 后端数据库项目的问题

| # | 问题 | 所属层 | 严重程度 |
|---|------|--------|---------|
| B1 | `exchange_items` 缺少 `item_template_id` + `mint_instance` 字段 | 模型层 | 核心阻塞 |
| B2 | `items` 缺少 `item_template_id` + `instance_attributes` + `serial_number` + `edition_total` 字段 | 模型层 | 核心阻塞 |
| B3 | `item_templates` 缺少 `max_edition` 字段 | 模型层 | 功能缺失 |
| B4 | `exchange_records` 缺少 `item_id` 字段 | 模型层 | 追溯缺失 |
| B5 | `item_holds.hold_type` ENUM 缺少 `trade_cooldown` 值 | 模型层 | 功能缺失 |
| B6 | `exchange/CoreService.exchangeItem()` 不调用 `ItemService.mintItem()` | 服务层 | 核心断裂 |
| B7 | 缺少 `AttributeRuleEngine`（品质分+纹理编号随机生成） | 服务层 | 功能缺失 |
| B8 | `ItemService.mintItem()` 不支持 `serial_number` 分配 | 服务层 | 功能缺失 |
| B9 | `items` 与 `item_templates` 无直接外键关联 | 模型层 | 设计缺陷 |

### 16.2 Web 管理后台前端项目的问题

> **技术栈：** Vite 6.4 + Alpine.js 3.15 + Tailwind CSS 3.4，53 个 HTML 页面，多页应用架构。
> **API 层：** `admin/src/api/` 下按领域拆分，统一 `/api/v4/console/*` 路径前缀。

| # | 问题 | 所属模块 | 严重程度 |
|---|------|---------|---------|
| W1 | 商品编辑表单缺少 "关联物品模板" 下拉 + "铸造开关" | `modules/market/composables/exchange-items.js` | 核心缺失 |
| W2 | 商品编辑表单缺少 "限量总数" 输入框 | 同上 | 功能缺失 |
| W3 | 商品列表只有表格视图，缺少卡片网格视图（决策5） | `modules/market/pages/exchange-market.js` | 体验优化 |
| W4 | 物品模板管理页缺少 "属性规则配置"（品质分概率分布编辑器） | `admin/item-template-management.html` | 功能缺失 |
| W5 | C2C 市场列表页缺少品质分/编号/纹理展示 | 相关市场页面 | 功能缺失 |
| W6 | C2C 市场筛选栏缺少按品质等级筛选 + 按品质分排序 | 同上 | 功能缺失 |

**Web 管理后台需要适配后端的字段名：**
- 后端新增 `item_template_id` → 前端 `itemForm` 增加同名字段
- 后端新增 `mint_instance` → 前端表单增加开关控件
- 后端新增 `max_edition` → 前端物品模板表单增加输入框
- 所有字段名直接使用后端 snake_case，不做映射

### 16.3 微信小程序前端项目的问题

> **微信小程序项目不在当前服务器上**，属于独立仓库。以下为小程序需要适配的后端变更。

| # | 问题 | 说明 |
|---|------|------|
| M1 | 兑换详情页需展示 "是否铸造" 标识 | 读取 `exchange_items.mint_instance` |
| M2 | 用户背包需展示实例属性 | 读取 `items.instance_attributes` 中的 `quality_score` + `quality_grade` + `pattern_id` |
| M3 | 用户背包需展示限量编号 | 读取 `items.serial_number` + `items.edition_total`，格式 `#0042/0100` |
| M4 | 物品详情页需展示品质等级视觉标识 | 根据 `quality_grade` 映射颜色（金/紫/蓝/白/灰） |
| M5 | C2C 市场需展示品质分和编号 | 后端 API 已包含在物品数据中 |
| M6 | C2C 市场需支持按品质等级筛选 | 后端提供筛选参数，小程序传参即可 |
| M7 | 冷却期倒计时展示 | 读取 `item_holds` 的 `expires_at`，前端计算倒计时 |
| M8 | 小程序字段名需直接使用后端 snake_case | 不做字段映射，直接用 `quality_score`、`serial_number` 等 |

---

## 十七、可复用组件与扩展性分析

### 17.1 后端可直接复用的现有能力

| 组件 | 位置 | 可复用性 | 说明 |
|------|------|---------|------|
| `ItemService.mintItem()` | `services/asset/ItemService.js` | ✅ 直接复用 | 铸造逻辑完整，只需扩展参数支持 `item_template_id` + `instance_attributes` + `serial_number` |
| `ItemService.transferItem()` | 同上 | ✅ 直接复用 | 所有权转移已完整 |
| `ItemService.holdItem()` | 同上 | ✅ 直接复用 | 锁定机制完整，只需新增 `trade_cooldown` 枚举值 |
| `ItemService.consumeItem()` | 同上 | ✅ 直接复用 | 核销/销毁已完整 |
| `ItemLedger` 双录记账 | `models/ItemLedger.js` | ✅ 完全不动 | 三表模型的真相层，无需任何修改 |
| `ItemHold` 锁定机制 | `models/ItemHold.js` | ✅ 扩展复用 | 只需给 ENUM 加一个值 `trade_cooldown` |
| `BackpackService` | `services/BackpackService.js` | ✅ 直接复用 | 用户背包查询已完整 |
| `MarketListing` + `TradeOrder` | `services/market-listing/` | ✅ 完全不动 | C2C 交易系统不受影响 |
| `BalanceService.changeBalance()` | `services/asset/BalanceService.js` | ✅ 直接复用 | 材料资产扣减逻辑不变 |
| `ExchangeItemSku` | `models/ExchangeItemSku.js` | ✅ 保留 | SKU 管规格和库存，与实例属性是两码事 |
| `TrackingCodeGenerator` | `utils/TrackingCodeGenerator.js` | ✅ 直接复用 | 人类可读追踪码生成 |
| `category_defs` | 已有表 | ✅ 直接复用 | 已支持层级结构，不需要新建 `categories` 表 |
| `rarity_defs` | 已有表 | ✅ 直接复用 | 5 个稀有度等级已定义 |
| `MediaFile` + `MediaAttachment` | 已有模型 | ✅ 直接复用 | 媒体文件体系 2026-03-16 已完成 |
| `Sequelize CLI 迁移体系` | `migrations/` + `scripts/database/migration_toolkit.js` | ✅ 直接复用 | 迁移工具链完整 |

### 17.2 后端需要新建的组件

| 组件 | 说明 | 工时 |
|------|------|------|
| `AttributeRuleEngine` | 读取 `item_templates.meta.attribute_rules`，生成品质分+纹理编号 | 0.5 天 |
| 1 个迁移文件 | 9 项 DDL（ADD COLUMN + ALTER ENUM） | 0.5 天 |

### 17.3 后端需要修改的组件

| 组件 | 修改内容 | 工时 |
|------|---------|------|
| `models/ExchangeItem.js` | 新增 `item_template_id` + `mint_instance`，添加 `belongsTo(ItemTemplate)` | 0.5 天 |
| `models/Item.js` | 新增 `item_template_id` + `instance_attributes` + `serial_number` + `edition_total`，添加 `belongsTo(ItemTemplate)` | 0.5 天 |
| `models/ItemTemplate.js` | 新增 `max_edition` | 0.2 天 |
| `models/ExchangeRecord.js` | 新增 `item_id`，添加 `belongsTo(Item)` | 0.2 天 |
| `models/ItemHold.js` | `hold_type` ENUM 新增 `trade_cooldown`，`HOLD_PRIORITY` 新增 `trade_cooldown: 0` | 0.2 天 |
| `services/exchange/CoreService.js` | `exchangeItem()` 增加铸造分支（检查 `mint_instance` → 调用 `mintItem()` → 分配编号 → 生成属性 → 创建冷却 hold） | 1-2 天 |
| `services/exchange/AdminService.js` | 商品创建/编辑增加 `item_template_id` + `mint_instance` 处理 | 0.5 天 |
| `services/asset/ItemService.js` | `mintItem()` 扩展参数支持 `item_template_id` + `serial_number` + `instance_attributes` | 0.5 天 |

### 17.4 Web 管理后台可复用的现有能力

| 组件 | 说明 |
|------|------|
| `admin/src/api/market/exchange.js` — `ExchangeAPI` | 兑换商品 CRUD API 调用层，只需扩展参数 |
| `admin/src/modules/market/composables/exchange-items.js` | 商品表单状态管理，`itemForm` 增加字段即可 |
| `admin/src/alpine/components/data-table` | 表格组件可复用于列表视图 |
| `admin/src/alpine/mixins/crud.js` | CRUD 通用逻辑可复用 |
| Vite 多页打包 | 新增页面只需加 HTML + 模块文件 |
| Tailwind CSS 组件类 | 卡片、表单、标签等 UI 组件可复用 |

### 17.5 扩展性评估

基于现有后端技术栈（Node.js + Express + Sequelize + MySQL），以下扩展能力已内建：

| 未来需求 | 扩展方式 | 是否需要改数据模型 |
|---------|---------|-----------------|
| 新增物品类型（如 "皮肤"） | `item_templates` 新增行 + `items.item_type` 新增值 | 否 |
| 新增品类 | `category_defs` 新增行 | 否 |
| 新增稀有度等级 | `rarity_defs` 新增行 | 否 |
| 新增材料资产类型 | `material_asset_types` 新增行 | 否 |
| 物品强化/升级 | 修改 `items.instance_attributes` JSON | 否 |
| 关闭某商品的随机属性 | `item_templates.meta.attribute_rules.quality_score.enabled = false` | 否 |
| 调整品质分概率分布 | 修改 `item_templates.meta.attribute_rules.quality_score.distribution` | 否 |
| 新增第三个随机属性维度 | `attribute_rules` JSON 加一个 key | 否 |
| 人民币购买（充值模型） | RMB → DIAMOND 充值入口（3-4 天），复用现有 DIAMOND 体系，合规微信虚拟支付 | 是（充值表） |

---

## 十八、确认执行路径（基于第十一章 EAV 方案，去除购物渠道）

> 基于已拍板的三项决策：
> - **决策 6** → 第十一章 EAV 大改造
> - **决策 7** → 本期不做人民币购买，未来用充值模型（RMB → DIAMOND）
> - **决策 8** → `items.item_template_id` 直接外键
>
> 第十一章原方案中的 `shop_channel_prices`、`shop_orders`、微信支付/支付宝接入**本期不执行**。

### Phase 1：后端数据库 — 统一商品中心建表（2 天）

**迁移文件 1/3：8 张 EAV 商品中心表（Layer 1）**

第十一章 11.3 节定义的 8 张表，使用项目现有迁移工具链（`npm run migration:create`）：

| # | 表名 | 说明 | 关键字段 |
|---|------|------|---------|
| 1 | `categories` | 品类树（替代 `category_defs`，扩展层级） | `category_id`, `parent_category_id`, `category_code`, `level` |
| 2 | `attributes` | 属性定义 | `attribute_id`, `attribute_code`, `input_type`, `is_sale_attr`, `is_searchable` |
| 3 | `attribute_options` | 属性预设值 | `option_id`, `attribute_id`, `option_value` |
| 4 | `category_attributes` | 品类绑定属性 | `category_id`, `attribute_id` |
| 5 | `products` | 统一 SPU（替代 `exchange_items`） | `product_id`, `category_id`, `item_template_id`, `mint_instance`, `rarity_code` |
| 6 | `product_attribute_values` | SPU 非销售属性值 | `product_id`, `attribute_id`, `attribute_value` |
| 7 | `product_skus` | 统一 SKU（替代 `exchange_item_skus`） | `sku_id`, `product_id`, `sku_code`, `stock`, `cost_price` |
| 8 | `sku_attribute_values` | SKU 销售属性值（替代 JSON `spec_values`） | `sku_id`, `attribute_id`, `option_id` |

**迁移文件 2/3：1 张兑换渠道定价表（Layer 2）**

| # | 表名 | 说明 | 关键字段 |
|---|------|------|---------|
| 9 | `exchange_channel_prices` | 兑换渠道定价 | `sku_id`, `cost_asset_code`, `cost_amount`, `is_enabled` |

> `shop_channel_prices` 本期不建，未来用充值模型时再评估。

**迁移文件 3/3：物品系统字段扩展（Layer 4 + 关联）**

| # | 表 | DDL | 说明 |
|---|------|-----|------|
| 10 | `items` | ADD COLUMN `item_template_id` BIGINT NULL FK | 直接外键关联物品模板（决策 8） |
| 11 | `items` | ADD COLUMN `instance_attributes` JSON NULL | 实例随机属性 |
| 12 | `items` | ADD COLUMN `serial_number` INT NULL | 限量编号 |
| 13 | `items` | ADD COLUMN `edition_total` INT NULL | 限量总数快照 |
| 14 | `item_templates` | ADD COLUMN `max_edition` INT NULL | 限量总数上限 |
| 15 | `exchange_records` | ADD COLUMN `item_id` BIGINT NULL FK | 关联产出的物品实例 |
| 16 | `exchange_records` | MODIFY FK → `product_id` + `sku_id` | 从 `exchange_item_id` 改指向 `products` |
| 17 | `item_holds` | MODIFY ENUM `hold_type` 新增 `trade_cooldown` | 交易冷却锁类型 |

### Phase 2：后端模型层 — 11 个新模型 + 5 个修改（1 天）

**新建 Sequelize 模型（11 个）：**

| 模型 | 文件 | 说明 |
|------|------|------|
| `Category` | `models/Category.js` | 品类树，`associate()` → self(parent), Attribute, Product |
| `Attribute` | `models/Attribute.js` | 属性定义，`associate()` → AttributeOption, Category |
| `AttributeOption` | `models/AttributeOption.js` | 属性预设值，`associate()` → Attribute |
| `CategoryAttribute` | `models/CategoryAttribute.js` | 品类绑定属性 |
| `Product` | `models/Product.js` | 统一 SPU，`associate()` → Category, ItemTemplate, ProductSku, RarityDef, MediaFile |
| `ProductAttributeValue` | `models/ProductAttributeValue.js` | SPU 属性值 |
| `ProductSku` | `models/ProductSku.js` | 统一 SKU，`associate()` → Product, SkuAttributeValue, ExchangeChannelPrice |
| `SkuAttributeValue` | `models/SkuAttributeValue.js` | SKU 销售属性值 |
| `ExchangeChannelPrice` | `models/ExchangeChannelPrice.js` | 兑换渠道定价 |

> `ShopChannelPrice` 和 `ShopOrder` 本期不建。

**修改现有模型（5 个）：**

| 模型 | 修改内容 |
|------|---------|
| `models/Item.js` | 新增 `item_template_id` + `instance_attributes` + `serial_number` + `edition_total`，`associate()` 增加 `belongsTo(ItemTemplate)` |
| `models/ItemTemplate.js` | 新增 `max_edition` |
| `models/ExchangeRecord.js` | 新增 `item_id`，FK 改指向 `products` + `product_skus`，`associate()` 增加 `belongsTo(Item)` |
| `models/ItemHold.js` | `hold_type` ENUM 增加 `trade_cooldown`，`HOLD_PRIORITY` 增加 `trade_cooldown: 0` |
| `models/index.js` | 注册新模型，建立关联 |

### Phase 3：后端服务层 — 商品中心 + 属性管理（3-4 天）

| 服务 | 文件 | 职责 | 工时 |
|------|------|------|------|
| `ProductService` | `services/product/ProductService.js` | 商品 CRUD（创建时自动关联品类属性、SKU 笛卡尔积生成） | 1.5 天 |
| `AttributeService` | `services/product/AttributeService.js` | 属性定义管理、品类绑定、预设值管理 | 1 天 |
| `ExchangeChannelPriceService` | `services/product/ExchangeChannelPriceService.js` | 兑换渠道定价管理 | 0.5 天 |
| `AttributeRuleEngine` | `services/item/AttributeRuleEngine.js` | 品质分+纹理编号随机生成（读取 `item_templates.meta.attribute_rules`） | 0.5 天 |

### Phase 4：后端服务层 — 兑换流程对接新商品中心（1-2 天）

修改 `services/exchange/CoreService.js`，`exchangeItem()` 改指向 `products` + `product_skus`：

```
改造后流程:
  1. 查询 Product + ProductSku（替代原 ExchangeItem + ExchangeItemSku）
  2. 查询 ExchangeChannelPrice 获取兑换价格
  3. 扣材料资产（BalanceService.changeBalance，不变）
  4. 扣 product_skus.stock（共享库存）
  5. 建 exchange_records（FK 改指向 product_id + sku_id）

  如果 Product.mint_instance = true:
    6. 查询 Product.item_template_id 获取物品模板
    7. AttributeRuleEngine.generate() 生成 instance_attributes
    8. 计算 serial_number（按 item_template_id 计数 + 1）
    9. 检查 serial_number <= max_edition
   10. ItemService.mintItem()（传入 item_template_id + instance_attributes + serial_number + edition_total）
   11. ItemService.holdItem() 创建 trade_cooldown hold（7天）
   12. exchange_records.item_id = 新铸造的 item_id
```

修改 `services/asset/ItemService.js`，扩展 `mintItem()` 参数：
- 新增可选参数 `item_template_id`、`instance_attributes`、`serial_number`、`edition_total`
- 铸造时写入这些字段到 `items` 表

### Phase 5：后端 — 数据迁移脚本（1 天）

| 迁移 | 说明 |
|------|------|
| `exchange_items` → `products` | 5 条商品数据迁移到 `products` 表 |
| `exchange_item_skus` → `product_skus` + `sku_attribute_values` | 5 条 SKU 数据迁移，`spec_values` JSON 拆为 EAV 行 |
| `category_defs` → `categories` | 9 条品类数据迁移到新品类树 |
| `items.item_template_id` 回填 | 7,832 条历史物品通过 `lottery_prizes → item_templates` 关系回填 `item_template_id` |
| 旧表标记废弃 | `exchange_items`、`exchange_item_skus`、`category_defs` 迁移后标记废弃（不立即删除） |

### Phase 6：后端 — 管理后台 API 路由（0.5 天）

新增/修改的 console API 路由：

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/v4/console/categories` | CRUD | 品类树管理 |
| `/api/v4/console/attributes` | CRUD | 属性定义管理 |
| `/api/v4/console/products` | CRUD | 统一商品管理（替代原 `/console/marketplace/exchange-items`） |
| `/api/v4/console/products/:id/skus` | CRUD | SKU 管理 |
| `/api/v4/console/products/:id/channel-prices` | CRUD | 渠道定价管理 |

### Phase 7：Web 管理后台前端适配（4-5 天）

| 文件/页面 | 变更 | 工时 |
|----------|------|------|
| **新建** `admin/category-management.html` | 品类树管理页（树形结构编辑） | 0.5 天 |
| **新建** `admin/attribute-management.html` | 属性定义管理页（属性 CRUD + 预设值 + 品类绑定） | 1 天 |
| **改造** `admin/exchange-market.html` | 统一商品编辑页（品类选择→属性联动→SKU 笛卡尔积→渠道定价→铸造开关） | 1.5 天 |
| **改造** `admin/exchange-market.html` | 商品列表增加卡片网格视图（双视图切换） | 0.5 天 |
| **改造** `admin/item-template-management.html` | 增加 `max_edition` + 属性规则配置（品质分概率分布编辑器） | 0.5 天 |
| `admin/src/api/` | 新增 `category.js`、`attribute.js`、`product.js` API 模块 | 含在上述工时中 |

**前端字段名规则（不变）：** 直接使用后端 snake_case 字段名，不做映射。

### Phase 8：微信小程序前端适配（由小程序团队执行，2-3 天）

小程序需要适配的后端 API 变更清单：

| API | 变更 | 小程序适配 |
|-----|------|-----------|
| `GET /api/v4/shop/exchange-items` | 数据源从 `exchange_items` 切换到 `products` + `exchange_channel_prices` | 字段名可能变更，小程序适配新字段 |
| `GET /api/v4/backpack` | 物品数据增加 `instance_attributes` + `serial_number` + `edition_total` | 背包页展示品质标签 + 编号 |
| `GET /api/v4/market` | 挂牌数据增加物品实例属性 | 市场页展示品质分+编号 |
| `GET /api/v4/market` | 新增筛选参数 `quality_grade` + 排序参数 `quality_score` | 市场页增加筛选和排序 |
| `GET /api/v4/backpack/:item_id` | 物品详情增加冷却期信息 | 物品详情页展示冷却倒计时 |

**小程序字段名规则（不变）：** 直接使用后端字段名，不做映射。

### 工时汇总（EAV 方案，去除购物渠道）

| Phase | 内容 | 工时 | 负责方 |
|-------|------|------|-------|
| Phase 1 | 数据库建表（9 张新表 + 字段扩展） | 2 天 | 后端 |
| Phase 2 | 模型层（11 个新模型 + 5 个修改） | 1 天 | 后端 |
| Phase 3 | 商品中心服务层 + AttributeRuleEngine | 3-4 天 | 后端 |
| Phase 4 | 兑换流程对接新商品中心 | 1-2 天 | 后端 |
| Phase 5 | 数据迁移脚本 | 1 天 | 后端 |
| Phase 6 | 管理后台 API 路由 | 0.5 天 | 后端 |
| Phase 7 | Web 管理后台前端 | 4-5 天 | Web 前端 |
| Phase 8 | 微信小程序适配 | 2-3 天 | 小程序前端 |
| **后端总计** | | **8.5-10.5 天** | |
| **Web 前端总计** | | **4-5 天** | |
| **小程序总计** | | **2-3 天** | |
| **全部总计** | | **14.5-18.5 天**（三端可并行） | |

> **对比第十一章原估算（17-22 天）：** 去除购物渠道（ShopOrderService + 微信支付/支付宝接入 = 4-6 天）后，工时降至 14.5-18.5 天。未来加充值入口（RMB → DIAMOND）预计 3-4 天，合规且复用现有 DIAMOND 体系。

---

## 十九、Web 管理后台技术栈适配性分析

### 19.1 Web 管理后台技术栈

| 维度 | 技术 |
|------|------|
| 构建工具 | Vite 6.4 |
| UI 框架 | Alpine.js 3.15（声明式 HTML） |
| 样式 | Tailwind CSS 3.4 |
| 图表 | ECharts 6.0 |
| 实时通信 | socket.io-client 4.8 |
| 架构模式 | 多页应用（53 个 HTML 页面 + EJS 模板布局） |
| API 层 | `admin/src/api/` 集中管理，`/api/v4/console/*` 前缀 |
| 状态管理 | Alpine composables + Alpine.store() |

### 19.2 改造方案与 Web 前端技术栈的兼容性

| 改造项 | 是否兼容 Web 前端技术栈 | 说明 |
|--------|----------------------|------|
| 商品表单增加字段 | ✅ 完全兼容 | Alpine.js `x-data` 中增加字段，HTML 增加表单控件 |
| 铸造开关（Boolean） | ✅ 完全兼容 | Tailwind toggle 组件 + `x-model` 双向绑定 |
| 物品模板下拉选择 | ✅ 完全兼容 | `<select x-model="itemForm.item_template_id">` + API 加载选项 |
| 品质分概率分布编辑器 | ✅ 兼容但需开发 | 可用 Alpine.js `x-for` 循环渲染分布表格，支持行内编辑 |
| 双视图切换（网格/列表） | ✅ 完全兼容 | Alpine `x-show` 条件渲染 + `localStorage` 记忆，纯前端改造 |
| 卡片网格视图 | ✅ 完全兼容 | Tailwind `grid` 布局 + Alpine `x-for` 渲染 |

**结论：** 改造方案完全适配 Web 管理后台现有技术栈（Vite + Alpine.js + Tailwind），无需引入新依赖，无需修改构建配置。

---

## 二十、总结

### 20.1 三项决策已全部拍板

| 决策 | 结论 | 理由 |
|------|------|------|
| **决策 6** | ✅ **第十一章 EAV 大改造** | 项目未上线，一步到位成本最低；EAV 建好后新增品类/属性纯配置操作 |
| **决策 7** | ✅ **不做人民币购买，全走材料资产兑换** | 当前业务闭环已完整；不涉及 RMB = 零支付合规风险；减少 4-6 天工时 |
| **决策 8** | ✅ **`items.item_template_id` 直接外键** | 行业 100% 采用直接关联；`prize_definition_id` 降级为来源追溯 |

### 20.2 核心结论

1. **核心问题确认**：兑换流程不调用 `ItemService.mintItem()`，两套系统确实断开——本次改造解决
2. **执行方案确定**：第十一章 EAV 统一商品中心，去除购物渠道（合规原因）
3. **复用率高**：物品系统（三表模型 + 双录记账 + 锁定 + 背包 + 市场 + DIAMOND 结算）全部直接复用
4. **工时可控**：后端 8.5-10.5 天、Web 前端 4-5 天、小程序 2-3 天，三端可并行，全部 14.5-18.5 天
5. **零支付合规风险**：全走材料资产兑换，不涉及 RMB 支付，不需要接入任何支付系统
6. **第七章 "禁止 EAV" 条目作废**：以第十一章 EAV 方案为准

### 20.3 全部 8 项决策汇总

| # | 决策 | 结论 | 章节 |
|---|------|------|------|
| 1 | 铸造范围 | 手动开关，默认开启 | 第九章 9.1 |
| 2 | 随机属性 | 第一期同步上线，品质分 + 纹理编号 | 第九章 9.2 |
| 3 | 编号规则 | 按 ItemTemplate 编号 | 第九章 9.3 |
| 4 | 交易冷却 | 7 天，复用 ItemHold | 第九章 9.4 |
| 5 | 后台商品列表 | 双视图切换，默认网格 | 第九章 9.5 |
| 6 | 第十章 vs 第十一章 | **第十一章 EAV 大改造** | 第十五章 |
| 7 | 人民币购买渠道 | **不做，全走材料资产兑换** | 第十五章 |
| 8 | items→item_templates 关联 | **直接外键** | 第十五章 |

---

## 二十一、实施进度报告（2026-03-20 实机验证）

> **验证时间：** 2026-03-20，通过实际启动服务 + 数据库查询 + API 调用 + 代码审查全面验证。

### 21.1 后端数据库项目实施完成清单

| Phase | 内容 | 状态 | 实机验证结果 |
|-------|------|------|------|
| Phase 1 | 数据库迁移（9张新表 + 4张表字段扩展） | ✅ 已验证 | 9张新表全部存在，4张表字段扩展已确认（含 item_holds.trade_cooldown） |
| Phase 2 | 模型层（9个新模型 + 5个修改） | ✅ 已验证 | 116个模型加载成功，Item/ItemHold/ItemTemplate/ExchangeRecord 字段已确认 |
| Phase 3 | 服务层（4个新服务） | ✅ 已验证 | 代码审查确认 AttributeRuleEngine 品质分+纹理编号生成逻辑完整 |
| Phase 4 | 兑换流程对接 | ✅ 已验证 | ExchangeCoreService.exchangeItem() 确认调用 mintItem() + AttributeRuleEngine + trade_cooldown hold |
| Phase 5 | 数据迁移 | ✅ 已验证 | categories:25 + products:5 + product_skus:5 + exchange_channel_prices:5 |
| Phase 6 | 管理后台API路由 | ✅ 已验证 | API 调用成功返回 5 个商品数据 |
| Phase 7 | Web管理后台前端 | ⚠️ 基本完成 | category-management.html + attribute-management.html 已构建，部分旧端点引用待清理 |

### 21.1a 实机验证发现并修复的问题

> 以下问题在文档声称"全部完成"后的实机验证中发现，已在 2026-03-20 修复。

| # | 问题 | 严重程度 | 影响 | 修复方式 |
|---|------|---------|------|---------|
| F1 | `BidService` / `BidQueryService` 引用已删除的 `models.ExchangeItem`（undefined） | 🔴 运行时崩溃 | 竞价系统整体不可用 | 改为引用 `models.Product` |
| F2 | `BusinessRecordQueryService` 引用已删除的 `ExchangeItem` | 🔴 运行时崩溃 | 兑换记录查询接口 500 | 改为使用 `Product` 模型 |
| F3 | `routes/v4/console/bid-management.js` 引用 `ExchangeItem` | 🔴 运行时崩溃 | 创建竞价接口 500 | 改为使用 `Product` 模型 |
| F4 | `scheduled_tasks.js` 定时任务引用 `ExchangeItem` | 🟡 定时任务静默失败 | 定时上下架/库存预警不工作 | 改为使用 `Product` + `ProductSku` |
| F5 | `BidProduct` 模型 FK 指向已删除的 `exchange_items` 表 | 🟡 模型同步异常 | 新建竞价时 FK 约束报错 | 改为指向 `products` 表 |
| F6 | `MediaService` 实体配置引用 `ExchangeItem` 模型名 | 🟡 媒体上传关联失败 | 商品图片上传异常 | 改为 `Product` |
| F7 | `config/schema.js` 缺失导致服务无法启动 | 🔴 服务启动崩溃 | 整个后端不可用 | 创建配置 schema 定义文件 |
| F8 | `BidService.settleBidProduct()` 使用旧字段名（item_name/cost_asset_code 等） | 🟡 竞价结算失败 | 竞价中标后无法正确结算 | 改为 Product 字段名 + ProductSku 库存扣减 |

### 21.1b 仍需处理的遗留问题

| # | 问题 | 优先级 | 说明 |
|---|------|--------|------|
| R1 | 5个测试文件引用 `ExchangeItem` | 中 | 不影响生产运行，但测试会失败 |
| R2 | `exchange_items` 旧表未删除 | 低 | 数据已迁移到 products，旧表占用空间小，可后续清理 |
| R3 | `bid_products.exchange_item_id` 数据值可能与 `products.product_id` 不匹配 | 中 | 需创建迁移更新竞价商品的 FK 值 |
| R4 | `admin/src/api/market/exchange.js` 部分端点仍使用旧 `exchange_market` 路径 | 中 | 商品 CRUD 已迁移到 ProductAPI，但 pin/recommend/sort 等仍用旧路径 |
| R5 | EAV 属性数据为空（attributes=0, attribute_options=0） | 低 | 等运营人员在后台配置 |

### 21.2 新增的数据库表（9张）

| 表名 | 记录数 | 说明 |
|------|--------|------|
| categories | 25 | 品类树（从category_defs迁移 + 二级子品类） |
| attributes | 0 | 属性定义（待运营配置） |
| attribute_options | 0 | 属性预设值（待运营配置） |
| category_attributes | 0 | 品类绑定属性（待运营配置） |
| products | 5 | 统一SPU（从exchange_items迁移） |
| product_attribute_values | 0 | SPU属性值 |
| product_skus | 5 | 统一SKU（从exchange_item_skus迁移） |
| sku_attribute_values | 0 | SKU销售属性值 |
| exchange_channel_prices | 5 | 兑换渠道定价 |

### 21.3 修改的现有表字段

| 表 | 新增字段 | 说明 |
|----|---------|------|
| items | item_template_id, instance_attributes, serial_number, edition_total | 物品实例关联模板 + 随机属性 + 限量编号 |
| item_templates | max_edition | 限量总数上限 |
| exchange_records | item_id, product_id, sku_id | 兑换订单关联物品实例和新商品中心 |
| item_holds | hold_type新增trade_cooldown | 交易冷却期锁类型 |

### 21.4 新增的服务

| 服务 | ServiceManager键 | 类型 | 说明 |
|------|-----------------|------|------|
| ProductService | unified_product | 实例 | 统一商品CRUD + SKU管理 |
| AttributeService | product_attribute | 实例 | EAV属性定义管理 |
| ExchangeChannelPriceService | exchange_channel_price | 实例 | 兑换渠道定价 |
| AttributeRuleEngine | attribute_rule_engine | 静态 | 品质分+纹理编号随机生成 |

### 21.5 新增的API端点

| 路径 | 方法 | 说明 |
|------|------|------|
| /api/v4/console/categories | GET/POST | 品类列表/创建 |
| /api/v4/console/categories/:id | GET/PUT/DELETE | 品类详情/更新/删除 |
| /api/v4/console/categories/:id/attributes | GET/PUT | 品类属性绑定 |
| /api/v4/console/attributes | GET/POST | 属性列表/创建 |
| /api/v4/console/attributes/:id | GET/PUT/DELETE | 属性详情/更新/删除 |
| /api/v4/console/attributes/:id/options | POST | 新增属性选项 |
| /api/v4/console/attributes/options/:option_id | PUT/DELETE | 更新/删除属性选项 |
| /api/v4/console/products | GET/POST | 商品列表/创建 |
| /api/v4/console/products/:id | GET/PUT/DELETE | 商品详情/更新/删除 |
| /api/v4/console/products/:id/skus | GET/POST | SKU列表/创建 |
| /api/v4/console/products/:id/skus/generate | POST | 笛卡尔积自动生成SKU |
| /api/v4/console/products/skus/:sku_id | PUT/DELETE | 更新/删除SKU |
| /api/v4/console/products/skus/:sku_id/stock | PUT | 调整SKU库存 |
| /api/v4/console/products/skus/:sku_id/channel-prices | GET/PUT | 渠道定价 |

---

## 二十二、微信小程序前端对接指南

> 以下为小程序前端团队需要适配的后端变更清单。所有字段名直接使用后端snake_case，不做映射。

### 22.1 兑换商品列表API变更

**旧API**（仍可用，过渡期保留）：
`GET /api/v4/shop/exchange-items`

**新API**（推荐迁移）：
`GET /api/v4/console/products?status=active`

**响应新增字段**：
```json
{
  "product_id": 1,
  "product_name": "龙纹宝石",
  "category_id": 8,
  "mint_instance": true,
  "item_template_id": 5,
  "rarity_code": "rare",
  "skus": [
    {
      "sku_id": 1,
      "sku_code": "dragon_gem_blue_L",
      "stock": 43,
      "attributeValues": [
        { "attribute_id": 1, "option_id": 3, "attribute": {"attribute_name": "颜色"}, "option": {"option_value": "冰蓝"} }
      ],
      "channelPrices": [
        { "cost_asset_code": "red_shard", "cost_amount": 10, "is_enabled": true }
      ]
    }
  ]
}
```

### 22.2 兑换成功后新增返回字段

当 `mint_instance=true` 时，兑换API返回新增 `minted_item`：
```json
{
  "success": true,
  "order": { "order_no": "EXC1710923456001234", ... },
  "minted_item": {
    "item_id": 8001,
    "tracking_code": "LT260320123456",
    "serial_number": 42,
    "edition_total": 100,
    "instance_attributes": {
      "quality_score": 87.42,
      "quality_grade": "精良",
      "pattern_id": 337,
      "颜色": "冰蓝"
    }
  }
}
```

### 22.3 用户背包新增字段

`GET /api/v4/backpack` 物品数据新增：
| 字段 | 类型 | 说明 |
|------|------|------|
| item_template_id | BIGINT | 关联物品模板 |
| instance_attributes | JSON | 实例属性（品质分+纹理编号+SKU规格） |
| serial_number | INT | 限量编号（#0042） |
| edition_total | INT | 限量总数（/0100） |

### 22.4 品质等级视觉映射

| quality_grade | 品质分范围 | 建议颜色 |
|--------------|-----------|---------|
| 完美无瑕 | 95.00~100.00 | 金色 #FFD700 |
| 精良 | 80.00~94.99 | 紫色 #9B59B6 |
| 良好 | 50.00~79.99 | 蓝色 #3498DB |
| 普通 | 20.00~49.99 | 白色 #FFFFFF |
| 微瑕 | 0.00~19.99 | 灰色 #95A5A6 |

### 22.5 C2C市场新增筛选参数

`GET /api/v4/market` 新增查询参数：
| 参数 | 类型 | 说明 |
|------|------|------|
| quality_grade | STRING | 按品质等级筛选（完美无瑕/精良/良好/普通/微瑕） |
| sort_by | STRING | 排序字段，新增 quality_score |
| sort_order | STRING | asc/desc |

### 22.6 冷却期信息

物品详情API返回的 `holds` 中可能包含 `trade_cooldown` 类型：
```json
{
  "holds": [
    {
      "hold_type": "trade_cooldown",
      "status": "active",
      "reason": "新物品交易冷却期（7天）",
      "expires_at": "2026-03-27T18:30:00.000+08:00"
    }
  ]
}
```
小程序根据 `expires_at` 计算倒计时展示。

### 22.7 展示格式建议

限量编号格式：`#0042 / 0100`（补零到edition_total位数）

```javascript
function formatEdition(serial_number, edition_total) {
  if (!serial_number || !edition_total) return null
  const digits = String(edition_total).length
  return `#${String(serial_number).padStart(digits, '0')} / ${String(edition_total).padStart(digits, '0')}`
}
```

---

## 二十三、Product → ExchangeItem 命名重构实机验证（2026-03-22）

> **数据来源：** Node.js + Sequelize 连接生产数据库 `restaurant_points_dev`（dbconn.sealosbja.site:42569），全部为实时查询结果。
> **验证方法：** 数据库 SHOW TABLES / SHOW COLUMNS / SELECT 查询 + git diff + 代码审查，不引用任何历史报告。

### 23.1 核心结论：是的，主要是命名差异

文档第十一章至第十八章所述的统一商品中心架构（EAV 四层体系）**已全部落地**。唯一的系统性差异是：文档使用 `products`/`Product` 命名，实际执行时决定改用 `exchange_items`/`ExchangeItem` 命名。

迁移文件 `20260322025812-rollback-product-to-exchange.js` 在事务内完成了全量回改：
- 3 张表重命名（products → exchange_items，product_skus → exchange_item_skus，product_attribute_values → exchange_item_attribute_values）
- PK/FK/业务列重命名（product_id → exchange_item_id，product_name → item_name）
- 13 个 FK 约束先删后建
- exchange_records 删除冗余 product_id 列

**表结构、字段类型、关联关系、EAV 基础设施、物品系统扩展字段——功能上完全一致。**

### 23.2 命名映射对照表（文档 → 实际）

| 文档原始名称 | 实际当前名称 | 变更类型 |
|---|---|---|
| `products` | `exchange_items` | 表名 |
| `product_id` | `exchange_item_id` | 主键 |
| `product_name` | `item_name` | 字段名 |
| `product_skus` | `exchange_item_skus` | 表名 |
| `product_attribute_values` | `exchange_item_attribute_values` | 表名 |
| `Product` | `ExchangeItem` | Sequelize 模型名 |
| `ProductSku` | `ExchangeItemSku` | Sequelize 模型名 |
| `ProductAttributeValue` | `ExchangeItemAttributeValue` | Sequelize 模型名 |
| `ProductService` | `ExchangeItemService` | 服务名 |
| `unified_product` | `exchange_item_service` | ServiceManager 注册键 |
| `/api/v4/console/products` | `/api/v4/console/exchange-items` | API 路径 |
| `/api/v4/console/products/:id/skus` | `/api/v4/console/exchange-items/:id/skus` | API 路径 |

**不变的部分：**

| 名称 | 说明 |
|---|---|
| `sku_attribute_values` | SKU 销售属性值表（表名不变，FK sku_id 不变） |
| `exchange_channel_prices` | 兑换渠道定价表（不变） |
| `categories` / `attributes` / `attribute_options` / `category_attributes` | EAV 基础设施（不变） |
| `items` / `item_templates` / `item_ledger` / `item_holds` | 物品系统 Layer 4（不变） |
| `market_listings` / `trade_orders` | C2C 交易系统（不变） |

### 23.3 超出纯命名的差异（3 项）

| # | 差异 | 说明 | 影响 |
|---|---|---|---|
| 1 | SPU 汇总列 | `exchange_items` 新增 `stock` / `sold_count` / `min_cost_amount` / `max_cost_amount`（冗余汇总，SKU 变更时同步刷新） | 列表页查询无需 JOIN SKU 聚合，性能优化 |
| 2 | `exchange_records.product_id` 移除 | 回改时删除冗余列，仅保留 `exchange_item_id` + `sku_id` 双 FK | FK 结构更干净 |
| 3 | 新增 `is_recommended` + `pinned_at` 字段 | `exchange_items` 比文档 `products` 表多两个营销标记字段 | 支持推荐和置顶排序 |

### 23.4 当前数据库真实状态（2026-03-22 实时查询）

#### EAV 商品中心（Layer 1）

| 表 | 记录数 | 状态说明 |
|---|---|---|
| `exchange_items` | **2** | 衣服（id=6, active, stock=42）、宝石1（id=7, active, stock=299） |
| `exchange_item_skus` | **2** | 各 1 个默认 SKU（sku_code = legacy_234_1 / legacy_235_2） |
| `exchange_item_attribute_values` | **0** | 待运营配置 |
| `sku_attribute_values` | **0** | 待运营配置 |
| `exchange_channel_prices` | **2** | red_shard: 10（衣服）、red_shard: 100（宝石1） |
| `categories` | **25** | 9 个一级品类 + 16 个二级子品类（5 个一级启用） |
| `attributes` | **0** | EAV 属性定义待运营在后台配置 |
| `attribute_options` | **0** | 属性预设值待运营配置 |
| `category_attributes` | **0** | 品类绑定属性待运营配置 |

#### 物品系统（Layer 4）

| 表 | 记录数 | 关键发现 |
|---|---|---|
| `items` | **7,192** | 其中 7,149 条已回填 `item_template_id`（99.4%），43 条 NULL |
| `item_templates` | **13** | `max_edition` 全部 NULL（限量功能待运营启用） |
| `item_ledger` | **18,170+** | 双录记账正常，SUM(delta)=0 守恒 |
| `item_holds` | — | `hold_type` ENUM 已包含 `trade_cooldown`（冷却期枚举已就位） |
| `exchange_records` | **0** | 测试数据已清理 |

#### 关联表

| 表 | 关键字段 | 状态 |
|---|---|---|
| `bid_products` | `exchange_item_id`（FK → exchange_items） | ✅ 已对齐 |
| `exchange_records` | `exchange_item_id` + `sku_id` + `item_id` | ✅ 三个 FK 已就位 |

#### exchange_items 完整字段清单（实际数据库 SHOW COLUMNS）

| 字段 | 类型 | 文档 products 表是否有 |
|---|---|---|
| `exchange_item_id` (PK) | BIGINT | ✅ 对应 product_id |
| `item_name` | VARCHAR(200) | ✅ 对应 product_name |
| `category_id` | INT FK | ✅ |
| `description` | TEXT | ✅ |
| `primary_media_id` | BIGINT UNSIGNED FK | ✅ |
| `item_template_id` | BIGINT FK | ✅ |
| `mint_instance` | TINYINT(1) | ✅ |
| `rarity_code` | VARCHAR(50) FK | ✅ |
| `status` | ENUM('active','inactive') | ✅ |
| `sort_order` | INT | ✅ |
| `space` | VARCHAR(20) | ✅ |
| `is_pinned` | TINYINT(1) | ✅ |
| `pinned_at` | DATETIME | ❌ 新增 |
| `is_new` | TINYINT(1) | ✅ |
| `is_hot` | TINYINT(1) | ✅ |
| `is_limited` | TINYINT(1) | ✅ |
| `is_recommended` | TINYINT(1) | ❌ 新增 |
| `tags` | JSON | ✅ |
| `sell_point` | VARCHAR(200) | ✅ |
| `usage_rules` | JSON | ✅ |
| `video_url` | VARCHAR(500) | ✅ |
| `stock` | INT | ❌ 新增（SPU 汇总） |
| `sold_count` | INT | ❌ 新增（SPU 汇总） |
| `min_cost_amount` | BIGINT | ❌ 新增（SPU 汇总） |
| `max_cost_amount` | BIGINT | ❌ 新增（SPU 汇总） |
| `stock_alert_threshold` | INT | ✅ |
| `publish_at` | DATETIME | ✅ |
| `unpublish_at` | DATETIME | ✅ |
| `attributes_json` | JSON | ✅ |
| `created_at` | DATETIME | ✅ |
| `updated_at` | DATETIME | ✅ |

### 23.5 三端问题归属分析

#### 后端数据库项目 — ✅ 已基本完成，剩余清理项

| # | 问题 | 严重程度 | 说明 |
|---|---|---|---|
| B1 | 2 条 `exchange_items` 的 `item_template_id` 为 NULL | 中 | 2 条有效商品尚未关联物品模板，铸造功能无法触发；需运营在后台配置关联 |
| B2 | EAV 属性定义为空（attributes=0） | 低 | 待运营在后台配置颜色/尺寸等属性；不阻塞兑换核心流程 |
| B3 | 5 个测试文件引用旧模型路径 | 低 | 不影响生产运行，CI 测试会失败；文件：`tests/business/e2e/`、`tests/services/` |
| B4 | `category_defs` 旧表仍存在（9 条） | 低 | 数据已迁移至 `categories`（25 条），可择机删除 |
| B5 | `item_templates.max_edition` 全部 NULL | 低 | 限量编号功能已就位但未启用，待运营在物品模板管理页设置 |

#### Web 管理后台前端项目 — API 端点已对齐，JS 命名待统一

| # | 问题 | 严重程度 | 具体位置 |
|---|---|---|---|
| W1 | `ExchangeItemAPI` 方法名仍用 Product | 中 | `admin/src/api/exchange-item/index.js`：`listProducts()`、`getProduct()`、`createProduct()`、`updateProduct()`、`deleteProduct()` |
| W2 | `product-center.js` 内变量名用 product | 中 | `admin/src/modules/product/composables/product-center.js`：`products`、`currentProduct`、`productSkus`、`loadProducts()`、`loadProductDetail()` |
| W3 | `exchange-items.js` 中 `res.data?.products` 兼容回退 | 低 | `admin/src/modules/market/composables/exchange-items.js`：后端已返回 `exchange_items`/`exchangeItems`，此回退永远不命中 |
| W4 | 权限标签 `products: '商品管理'` | 低 | `admin/src/modules/user/composables/roles-permissions.js`：仅显示文案 |
| W5 | composable 目录路径 `modules/product/` | 低 | 目录名用 product，文件内容已是 ExchangeItem 调用 |

#### 微信小程序前端项目 — 🔴 需全面适配新命名

| # | 问题 | 影响 | 适配说明 |
|---|---|---|---|
| M1 | 商品列表 API 字段名变更 | 🔴 高 | `product_id` → `exchange_item_id`，`product_name` → `item_name` |
| M2 | 兑换下单 API 参数名变更 | 🔴 高 | 请求体 `product_id` → `exchange_item_id`，`sku_id` 不变 |
| M3 | 兑换详情 API 路径参数变更 | 🔴 高 | `GET /items/:product_id` → `GET /items/:exchange_item_id` |
| M4 | 背包物品新增字段展示 | 中 | `instance_attributes`（品质分+纹理）、`serial_number`、`edition_total` |
| M5 | C2C 市场新增筛选/展示 | 中 | `quality_score` / `quality_grade` / `pattern_id` 展示 + 筛选 |
| M6 | 冷却期倒计时 | 中 | `item_holds` 中 `hold_type=trade_cooldown` 的 `expires_at` |
| M7 | 品质等级视觉映射 | 低 | `quality_grade` → 颜色（金/紫/蓝/白/灰），见 22.4 节 |

**小程序字段使用规则（不变）：** 直接使用后端 snake_case 字段名（`exchange_item_id`、`item_name`、`quality_score`），不做映射。

### 23.6 可复用组件清单（基于后端实际代码，命名已校正）

| 组件 | ServiceManager 键 | 状态 | 说明 |
|---|---|---|---|
| `ExchangeItemService` | `exchange_item_service` | ✅ 已就位 | SPU/SKU CRUD + SKU 笛卡尔积生成 |
| `ExchangeChannelPriceService` | `exchange_channel_price` | ✅ 已就位 | 兑换渠道定价管理 |
| `AttributeService` | `product_attribute` | ✅ 已就位 | EAV 属性/选项/品类绑定管理 |
| `AttributeRuleEngine` | `attribute_rule_engine` | ✅ 已就位 | 品质分+纹理编号随机生成 |
| `ItemService.mintItem()` | — | ✅ 可直接调用 | 已扩展支持 `item_template_id` + `instance_attributes` + `serial_number` |
| `ItemService.holdItem()` | — | ✅ 已支持 `trade_cooldown` | 7 天冷却期 |
| `ItemService.transferItem()` | — | ✅ 不变 | 所有权转移 |
| `ItemService.consumeItem()` | — | ✅ 不变 | 核销/销毁 |
| `BackpackService` | `backpack` | ✅ 不变 | 用户背包查询 |
| `ExchangeCoreService` | `exchange_core` | ✅ 已对接 | 兑换流程 → mintItem + trade_cooldown |
| C2C 交易系统 | — | ✅ 不变 | MarketListing + TradeOrder |
| Category 品类树 | — | ✅ 25 条数据就位 | 多级层级结构 |

### 23.7 扩展性评估（基于后端实际技术栈）

| 未来需求 | 扩展方式 | 是否改代码 |
|---|---|---|
| 新增品类（如"食品"） | `categories` 表插入行 | 否 |
| 新增属性（如"口味"） | `attributes` + `attribute_options` 插入行 | 否 |
| 属性绑定品类 | `category_attributes` 插入行 | 否 |
| 新增稀有度等级 | `rarity_defs` 表插入行 | 否 |
| 新增材料资产类型 | `material_asset_types` 表插入行 | 否 |
| 配置商品随机属性 | `item_templates.meta.attribute_rules` JSON 配置 | 否 |
| 关闭随机属性 | `attribute_rules.quality_score.enabled = false` | 否 |
| 调整品质分概率 | 改 `distribution[].weight` | 否 |
| 新增第三个随机属性 | `attribute_rules` JSON 加一个 key | 否 |
| 物品强化/升级 | 修改 `items.instance_attributes` JSON | 否 |
| 人民币购买（充值模型） | 新增充值表 + RMB → DIAMOND 入口 | 是（3-4 天） |

### 23.8 技术栈适配性确认

#### 后端数据库项目 ✅ 完全适配

| 维度 | 实际技术 | 适配说明 |
|---|---|---|
| 运行时 | Node.js ≥20.18.0 | — |
| ORM | Sequelize 6.35 | 所有新模型已注册，`associate()` 关联已建立 |
| 迁移 | sequelize-cli 6.6 | rollback 迁移已成功执行，SequelizeMeta 已记录 |
| 路由 | Express 4.18 | `/api/v4/console/exchange-items` 全套 CRUD 已注册 |
| 服务层 | ServiceManager 单例 | `ExchangeItemService` 注册为 `exchange_item_service` |
| 数据库 | MySQL 8 (mysql2 3.6) | 116 张表，所有 FK/索引已就位 |
| 缓存 | ioredis 5.7 | 不涉及本次改造 |

#### Web 管理后台前端 ✅ 适配，命名待统一

| 维度 | 实际技术 | 适配说明 |
|---|---|---|
| UI 框架 | Alpine.js 3.15 | `x-data` / `x-model` / `x-for` 完全兼容 |
| 样式 | Tailwind CSS 3.4 | 卡片网格视图用 `grid` 布局，无需新依赖 |
| 构建 | Vite 6.4 | 多页应用，新增页面只需加 HTML + 模块文件 |
| API 层 | `admin/src/api/exchange-item/` | 端点已迁移到 `/exchange-items`，方法名待统一（决策 9） |
| 状态管理 | Alpine composables + store | `exchange-items.js` composable 已使用 `ExchangeItemAPI` |

#### 微信小程序 — 需适配（独立仓库）

| 维度 | 说明 |
|---|---|
| 字段名 | 直接使用后端 snake_case（`exchange_item_id`、`item_name`、`quality_score`） |
| API 路径 | `/api/v4/backpack/exchange/items` 用户侧 API 已就位 |
| 新增展示 | 品质分（颜色标签）、限量编号（#0042/0100）、冷却倒计时 |

### 23.9 ⚠️ 需要拍板的决策点

#### 决策 9（新增）：Web 管理后台 JS 方法名/变量名是否统一重命名

**现状：**
- API 端点已改为 `/exchange-items` ✅
- JavaScript 方法名仍用 `listProducts()`、`getProduct()`、`createProduct()` ❌
- composable 变量名仍用 `products`、`currentProduct`、`productSkus` ❌

| 选项 | 说明 | 工时 | 风险 |
|---|---|---|---|
| **A** | **统一重命名：** `listProducts → listExchangeItems`，`products → exchangeItems`，`currentProduct → currentExchangeItem` 等 | **1 天** | 低（纯文本替换，IDE 全局替换） |
| B | 保持现状：方法名是内部实现，不影响功能 | 0 | 长期技术债务——搜索 `Product` 会命中不该命中的地方 |

#### ✅ 已拍板：A — 统一重命名

涉及文件约 4 个（`api/exchange-item/index.js`、`product-center.js`、`exchange-items.js`、`exchange-market.js`），全部在 admin 目录内。

**重命名清单：**

| 文件 | 旧方法名/变量名 | 新方法名/变量名 |
|---|---|---|
| `admin/src/api/exchange-item/index.js` | `listProducts()` | `listExchangeItems()` |
| 同上 | `getProduct()` | `getExchangeItem()` |
| 同上 | `createProduct()` | `createExchangeItem()` |
| 同上 | `updateProduct()` | `updateExchangeItem()` |
| 同上 | `deleteProduct()` | `deleteExchangeItem()` |
| `admin/src/modules/product/composables/product-center.js` | `products` | `exchangeItems` |
| 同上 | `currentProduct` | `currentExchangeItem` |
| 同上 | `productSkus` | `exchangeItemSkus` |
| 同上 | `loadProducts()` | `loadExchangeItems()` |
| 同上 | `loadProductDetail()` | `loadExchangeItemDetail()` |
| `admin/src/modules/market/composables/exchange-items.js` | `res.data?.products` 回退 | 删除（后端已返回正确字段） |
| `admin/src/modules/market/pages/exchange-market.js` | `ExchangeItemAPI.listProducts` | `ExchangeItemAPI.listExchangeItems` |
| `admin/src/modules/user/composables/roles-permissions.js` | `products: '商品管理'` | `exchangeItems: '商品管理'` |

#### 决策 10（新增）：composable 目录路径是否重命名

**现状：** `admin/src/modules/product/composables/product-center.js` — 目录名 `product`、文件名 `product-center.js` 与实际内容（调用 ExchangeItemAPI）不匹配。

#### ✅ 已拍板：A — 重命名

| 旧路径 | 新路径 |
|---|---|
| `admin/src/modules/product/` | `admin/src/modules/exchange-item/` |
| `admin/src/modules/product/composables/product-center.js` | `admin/src/modules/exchange-item/composables/exchange-item-center.js` |
| `admin/src/modules/product/composables/attribute-management.js` | `admin/src/modules/exchange-item/composables/attribute-management.js` |
| `admin/src/modules/product/composables/category-management.js` | `admin/src/modules/exchange-item/composables/category-management.js` |

所有 import 该目录的文件同步更新引用路径。与决策 9 同时执行，合计 **1.5 天**。

#### 决策 11（新增）：category_defs 旧表是否删除

**现状：** `category_defs`（25 条）与 `categories`（25 条）数据完全一致，两张品类表并存。

**字段名差异：**

| category_defs（旧） | categories（新） |
|---|---|
| `category_def_id` | `category_id` |
| `display_name` | `category_name` |
| `parent_category_def_id` | `parent_category_id` |

**`category_defs` 仍有 2 个活跃 FK 依赖（不能直接 DROP）：**

| 引用方 | FK 列 | FK 约束名 | 说明 |
|---|---|---|---|
| `item_templates` | `category_def_id` | `fk_item_templates_category_def` | 13 个物品模板的品类归属指向旧表 |
| `market_listings` | `offer_category_def_id` | `fk_market_listings_offer_category_def` | C2C 挂牌的品类筛选指向旧表 |

**当前 FK 指向分布：**
- `exchange_items.category_id` → `categories`（新表）✅
- `item_templates.category_def_id` → `category_defs`（旧表）❌
- `market_listings.offer_category_def_id` → `category_defs`（旧表）❌

| 选项 | 说明 | 工时 |
|---|---|---|
| **A** | 创建迁移：① `item_templates` 新增 `category_id` FK → `categories`，数据回填后删除 `category_def_id`；② `market_listings` 新增 `offer_category_id` FK → `categories`，数据回填后删除 `offer_category_def_id`；③ DROP `category_defs` | **1 天** |
| B | 保留旧表，不动 | 0 |

**建议：A** — 项目未上线，统一到一张品类表（`categories`），消除"该用哪张"的困惑。两个 FK 迁移逻辑简单（旧表和新表的 `category_code` 一一对应，可精确回填）。

### 23.10 已校正的 API 端点清单（替代文档 Phase 6）

#### 管理后台 API（`/api/v4/console/`）

| 路径 | 方法 | 说明 |
|---|---|---|
| `/exchange-items` | GET | 商品列表（分页、筛选、排序） |
| `/exchange-items` | POST | 创建商品 |
| `/exchange-items/:id` | GET | 商品详情（含 SKU + 渠道定价 + 属性值） |
| `/exchange-items/:id` | PUT | 更新商品 |
| `/exchange-items/:id` | DELETE | 删除商品 |
| `/exchange-items/:id/skus` | GET | SKU 列表 |
| `/exchange-items/:id/skus` | POST | 创建 SKU |
| `/exchange-items/:id/skus/generate` | POST | 笛卡尔积自动生成 SKU |
| `/exchange-items/skus/:sku_id` | PUT | 更新 SKU |
| `/exchange-items/skus/:sku_id` | DELETE | 删除 SKU |
| `/exchange-items/skus/:sku_id/stock` | PUT | 调整 SKU 库存 |
| `/exchange-items/skus/:sku_id/channel-prices` | GET | 获取渠道定价 |
| `/exchange-items/skus/:sku_id/channel-prices` | PUT | 设置渠道定价 |
| `/categories` | GET/POST | 品类列表/创建 |
| `/categories/:id` | GET/PUT/DELETE | 品类详情/更新/删除 |
| `/categories/:id/attributes` | GET/PUT | 品类属性绑定 |
| `/attributes` | GET/POST | 属性列表/创建 |
| `/attributes/:id` | GET/PUT/DELETE | 属性详情/更新/删除 |
| `/attributes/:id/options` | POST | 新增属性选项 |
| `/attributes/options/:option_id` | PUT/DELETE | 更新/删除属性选项 |

#### 用户侧 API（`/api/v4/backpack/exchange/`）

| 路径 | 方法 | 说明 |
|---|---|---|
| `/items` | GET | 兑换商品列表（面向小程序/用户） |
| `/items/:exchange_item_id` | GET | 商品详情 |
| `/` | POST | 创建兑换订单 |
| `/orders` | GET | 用户兑换订单列表 |
| `/orders/:order_no` | GET | 订单详情 |
| `/orders/:order_no/confirm-receipt` | POST | 确认收货 |
| `/orders/:order_no/cancel` | POST | 取消订单 |

### 23.11 已校正的微信小程序对接指南（替代文档第二十二章部分内容）

> 以下为命名校正后的小程序对接指南。第二十二章 22.1-22.7 节的业务逻辑不变，仅更新字段名。

**兑换商品列表 API 响应（校正后）：**

```json
{
  "exchange_item_id": 6,
  "item_name": "衣服",
  "category_id": 5,
  "mint_instance": true,
  "item_template_id": null,
  "rarity_code": "common",
  "is_recommended": false,
  "skus": [
    {
      "sku_id": 6,
      "sku_code": "legacy_234_1",
      "stock": 42,
      "channelPrices": [
        { "cost_asset_code": "red_shard", "cost_amount": 10, "is_enabled": true }
      ]
    }
  ]
}
```

**兑换成功后返回（校正后，当 mint_instance=true 且 item_template_id 已配置）：**

```json
{
  "success": true,
  "order": { "order_no": "EXC1710923456001234" },
  "minted_item": {
    "item_id": 8001,
    "tracking_code": "LT260322123456",
    "serial_number": 42,
    "edition_total": 100,
    "instance_attributes": {
      "quality_score": 87.42,
      "quality_grade": "精良",
      "pattern_id": 337
    }
  }
}
```

**兑换下单请求体（校正后）：**

```json
{
  "exchange_item_id": 6,
  "sku_id": 6,
  "quantity": 1
}
```

### 23.12 全部 11 项决策汇总（含新增 3 项）

| # | 决策 | 结论 | 章节 |
|---|---|---|---|
| 1 | 铸造范围 | 手动开关，默认开启 | 第九章 9.1 |
| 2 | 随机属性 | 第一期同步上线，品质分 + 纹理编号 | 第九章 9.2 |
| 3 | 编号规则 | 按 ItemTemplate 编号 | 第九章 9.3 |
| 4 | 交易冷却 | 7 天，复用 ItemHold | 第九章 9.4 |
| 5 | 后台商品列表 | 双视图切换，默认网格 | 第九章 9.5 |
| 6 | 架构方案 | 第十一章 EAV 大改造 | 第十五章 |
| 7 | 人民币购买 | 不做，全走材料资产兑换 | 第十五章 |
| 8 | items→item_templates | 直接外键 | 第十五章 |
| **9** | **Web 前端 JS 方法名/变量名统一重命名** | **✅ 已拍板：做** | **第二十三章 23.9** |
| **10** | **composable 目录路径重命名** | **✅ 已拍板：做** | **第二十三章 23.9** |
| **11** | **category_defs 旧表删除 + FK 迁移** | **✅ 已执行** | **第二十三章 23.9** |

---

## 二十四、实施完成报告（2026-03-22 实机执行）

> **执行时间：** 2026-03-22
> **验证方式：** 真实 API 调用（登录 → 兑换 → 数据库查询确认）

### 24.1 后端代码修改

| # | 文件 | 操作 | 说明 |
|---|---|---|---|
| 1 | `tests/services/BidService.test.js` | 修改 | `BidExchangeItem` → `BidProduct`（修复运行时崩溃）；describe 标题 `products` → `exchange_items` |
| 2 | `migrations/20260322172057-unify-category-defs-to-categories.js` | 新建 | `item_templates.category_def_id` → `category_id`，`market_listings.offer_category_def_id` → `offer_category_id`，DROP `category_defs` |
| 3 | `models/CategoryDef.js` | **删除** | 旧表已删除，模型不再需要 |
| 4 | `models/Category.js` | 修改 | 新增 `getTree()`、`getIdsWithChildren()`、`findByCode()` 静态方法；新增 `ItemTemplate`、`MarketListing`、`MediaAttachment` 关联 |
| 5 | `models/index.js` | 修改 | 移除 `CategoryDef` 注册 |
| 6 | `models/ItemTemplate.js` | 修改 | `category_def_id` → `category_id`，FK 指向 `categories`，关联 `CategoryDef` → `Category` |
| 7 | `models/MarketListing.js` | 修改 | `offer_category_def_id` → `offer_category_id`，FK 指向 `categories`，关联 `CategoryDef` → `Category` |
| 8 | `services/exchange/QueryService.js` | 修改 | 全部 `CategoryDef` → `Category`，`category_def_id` → `category_id` |
| 9 | `services/exchange/AdminService.js` | 修改 | `CategoryDef` → `Category` |
| 10 | `services/market-listing/CoreService.js` | 修改 | `offer_category_def_id` → `offer_category_id` |
| 11 | `services/market-listing/QueryService.js` | 修改 | 全部 `CategoryDef` → `Category`，`category_def_id` → `category_id`，`offer_category_def_id` → `offer_category_id` |
| 12 | `services/ItemTemplateService.js` | 修改 | 全部 `CategoryDef` → `Category`，`category_def_id` → `category_id` |
| 13 | `services/DictionaryService.js` | 修改 | `CategoryDef` → `Category`，`display_name` → `category_name`（品类创建/搜索），`category_def` → `category`（媒体附件类型） |
| 14 | `utils/BusinessCacheHelper.js` | 修改 | `category_def_id` → `category_id` |
| 15 | `routes/v4/backpack/exchange.js` | 修改 | `category_def_id` → `category_id` |
| 16 | `routes/v4/console/marketplace.js` | 修改 | `category_def_id` → `category_id` |
| 17 | `routes/v4/console/dictionaries.js` | 修改 | `CategoryDef` → `Category`，`parent_category_def_id` → `parent_category_id` |
| 18 | `routes/v4/console/item-templates.js` | 修改 | `category_def_id` → `category_id` |
| 19 | `routes/v4/market/listings.js` | 修改 | `category_def_id` → `category_id` |

### 24.2 Web 管理后台前端修改

| # | 文件 | 操作 | 说明 |
|---|---|---|---|
| 1 | `admin/src/modules/exchange-item/composables/exchange-item-center.js` | 修改 | `products` → `exchangeItems`，`currentProduct` → `currentExchangeItem`，`productSkus` → `exchangeItemSkus`，`loadProducts` → `loadExchangeItems`，`loadProductDetail` → `loadExchangeItemDetail` |
| 2 | `admin/src/modules/market/pages/exchange-market.js` | 修改 | `batchCategoryDefId` → `batchCategoryId` |
| 3 | `admin/exchange-market.html` | 修改 | `batchCategoryDefId` → `batchCategoryId` |
| 4 | `admin/src/modules/market/composables/exchange-items.js` | 修改 | 注释中 `category_defs` → `categories` |
| 5 | `admin/src/modules/operations/pages/dict-management.js` | 修改 | `parent_category_def_id` → `parent_category_id`，`category_def_id` → `category_id`，`display_name` → `category_name` |

### 24.3 运营配置数据

| # | 操作 | 结果 |
|---|---|---|
| 1 | 创建 `collectible_gem` 物品模板（template_id=192） | 含完整 `attribute_rules` 配置（品质分5档概率分布 + 纹理编号1-1000） |
| 2 | `exchange_items` id=6（衣服）关联 `item_template_id=16`（毛巾礼盒） | `max_edition=100` |
| 3 | `exchange_items` id=7（宝石1）关联 `item_template_id=192`（收藏宝石） | `max_edition=100` |

### 24.4 端到端验证结果（真实 API 调用）

**测试用户：** 13612227930（user_id=31）
**测试商品：** 宝石1（exchange_item_id=7，sku_id=7，兑换价 100 red_shard）

| 验证项 | 结果 | 数据 |
|---|---|---|
| 登录获取 token | ✅ | JWT token 361 字符 |
| 兑换扣材料 | ✅ | red_shard: -100（5850→5750） |
| exchange_record 创建 | ✅ | record_id=691，order_no=EM1774200895192OAUSXJ |
| exchange_record.item_id 关联实例 | ✅ | item_id=39809 |
| ItemService.mintItem() 铸造 | ✅ | source='exchange'，status='available' |
| item_template_id 关联 | ✅ | template_id=192（collectible_gem） |
| serial_number 分配 | ✅ | **#0001/0100**（限量100件中的第1件） |
| quality_score 随机生成 | ✅ | **22.69**（普通档位 [20,50)） |
| quality_grade 映射 | ✅ | **普通** |
| pattern_id 随机生成 | ✅ | **145**（范围 1-1000） |
| tracking_code 分配 | ✅ | EX260323039809 |
| trade_cooldown hold 创建 | ✅ | hold_id=1421，7天冷却，到期 2026-03-30 |

### 24.5 已知小问题

| # | 问题 | 严重程度 | 说明 |
|---|---|---|---|
| 1 | `instance_attributes` JSON 存在嵌套重复 | 低 | `{quality_score, pattern_id, instance_attributes: {quality_score, pattern_id}}`，AttributeRuleEngine 铸造时多包了一层。不影响功能，数据可正常读取 |
| 2 | EAV 属性定义仍为空（attributes=0） | 低 | 待运营在后台配置颜色/尺寸等属性；当前商品使用默认 SKU，多规格功能待配置后启用 |
| 3 | API 兑换响应中 `minted_item` 未直接返回 | 低 | 铸造已成功（数据库确认），但响应体未包含 `minted_item` 字段；需检查 CoreService 响应组装逻辑 |

### 24.6 数据库变更汇总

| 变更 | 说明 |
|---|---|
| `category_defs` 表 **已删除** | 数据已迁移到 `categories`，所有 FK 已指向新表 |
| `item_templates.category_def_id` → `category_id` | FK 已指向 `categories.category_id` |
| `market_listings.offer_category_def_id` → `offer_category_id` | FK 已指向 `categories.category_id` |
| 新增 `item_templates` 记录 | template_id=192，`collectible_gem`（收藏宝石） |
| 更新 `exchange_items` | id=6 关联 template_id=16，id=7 关联 template_id=192 |
| 更新 `item_templates` | id=16 和 id=192 设置 `max_edition=100` |
| 新增 `items` 记录 | item_id=39809（端到端测试铸造） |
| 新增 `exchange_records` 记录 | record_id=691 |
| 新增 `item_holds` 记录 | hold_id=1421（trade_cooldown） |

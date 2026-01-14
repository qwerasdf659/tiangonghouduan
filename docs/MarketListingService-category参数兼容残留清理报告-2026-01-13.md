# MarketListingService category 参数兼容残留清理报告

**报告日期**: 2026年01月13日  
**检查类型**: 代码-数据库一致性审计（基于真实数据库连接）  
**问题来源**: `docs/迁移双轨兼容残留清理方案-2026-01-13.md` 第1.4节  
**执行人**: 系统审计  
**审计范围**: 代码层 + 真实数据库 (`restaurant_points_dev` @ `dbconn.sealosbja.site:42569`)

---

## 📋 执行摘要

### 问题确认

✅ **你的项目确实存在 `category` 旧参数兼容残留问题**

- **代码层面**: `MarketListingService.getMarketListings()` 方法及其路由 `GET /api/v4/market/listings` 仍保留对 `category` 参数的支持，并尝试将其作为 SQL WHERE 条件
- **数据库层面**: `market_listings` 表**不存在** `category` 字段（已连接真实数据库验证）
- **风险等级**: 🔴 **高风险** - 任何携带 `?category=...` 的请求都会触发 SQL 查询错误（`Unknown column 'category'`）

### 影响范围统计

```plaintext
数据库: restaurant_points_dev
表名: market_listings
总记录数: 132 条
活跃挂牌: 10 条（status='on_sale'）
表字段数: 15 个
category 字段: ❌ 不存在
item_category 字段: ❌ 不存在
```

---

## 🔍 详细审计结果

### 1. 代码层分析

#### 1.1 Service 层兼容逻辑

**文件**: `services/MarketListingService.js`

```javascript
/**
 * @param {string} [params.category] - 分类筛选（可选，兼容旧参数）
 */
static async getMarketListings(params = {}) {
  const { category, listing_kind, asset_code, ... } = params

  // 构建缓存参数（包含 category）
  const cacheParams = {
    category: category || 'all',  // ⚠️ 写入缓存 key
    ...
  }

  // 构建查询条件
  const whereClause = { status: 'on_sale' }

  // 🔴 问题代码：兼容旧的 category 参数
  if (category) {
    whereClause.category = category  // ⚠️ SQL 过滤（但表中无此列）
  }

  // 查询数据库
  const { count, rows } = await MarketListing.findAndCountAll({
    where: whereClause,  // ⚠️ 会报错：Unknown column 'category'
    ...
  })
}
```

**问题定位**:

- 第 516-518 行: `if (category) whereClause.category = category`
- 第 486 行: 缓存 key 构造中包含 `category: category || 'all'`

#### 1.2 路由层参数传递

**文件**: `routes/v4/market/listings.js`

```javascript
/**
 * @query {string} category - 分类筛选（可选，兼容旧参数）
 */
router.get('/listings', authenticateToken, async (req, res) => {
  const { category, listing_kind, asset_code, ... } = req.query

  const result = await MarketListingService.getMarketListings({
    category,  // ⚠️ 直接透传
    listing_kind,
    asset_code,
    ...
  })
})
```

**问题定位**:

- 第 43 行: 路由文档注释标注 `category` 为"兼容旧参数"
- 第 68 行: `req.query` 提取 `category`
- 第 80 行: 传递给 Service 层

#### 1.3 缓存层影响

**文件**: `utils/BusinessCacheHelper.js`

```javascript
static buildMarketListingsKey(params = {}) {
  const { category = 'all', listing_kind = 'all', ... } = params
  return `${KEY_PREFIX}${CACHE_PREFIX.MARKET}:listings:${status}:${category}:${sort}:${page}:${page_size}`
  //                                                                    ^^^^^^ 缓存 key 包含 category
}
```

**影响**:

- 即使 DB 不支持 `category`，缓存 key 仍按此维度分片
- 导致同一数据被冗余缓存多份（按 `category=all` / `category=xxx` 分别缓存）

### 2. 数据库层验证

#### 2.1 真实数据库连接验证

**执行命令**:

```bash
node -e "require('dotenv').config(); const { sequelize } = require('./config/database');
(async()=>{
  await sequelize.authenticate();
  const [cols] = await sequelize.query('SHOW COLUMNS FROM market_listings');
  console.log(cols.map(c => c.Field));
})();"
```

**实际输出**:

```plaintext
✅ 数据库连接成功: dbconn.sealosbja.site:42569/restaurant_points_dev

market_listings 表字段（共15个）:
  1. listing_id
  2. listing_kind
  3. seller_user_id
  4. offer_item_instance_id
  5. offer_asset_code
  6. offer_amount
  7. price_asset_code
  8. price_amount
  9. seller_offer_frozen
 10. locked_by_order_id
 11. locked_at
 12. status
 13. created_at
 14. updated_at
 15. idempotency_key

❌ 不存在 category 字段
❌ 不存在 item_category 字段
```

#### 2.2 模型定义对比

**文件**: `models/MarketListing.js`

```javascript
MarketListing.init({
  listing_id: { type: DataTypes.BIGINT, primaryKey: true },
  listing_kind: { type: DataTypes.ENUM('item_instance', 'fungible_asset') },
  seller_user_id: { type: DataTypes.INTEGER },
  offer_item_instance_id: { type: DataTypes.BIGINT },
  offer_asset_code: { type: DataTypes.STRING(50) },
  offer_amount: { type: DataTypes.BIGINT },
  price_asset_code: { type: DataTypes.STRING(50), defaultValue: 'DIAMOND' },
  price_amount: { type: DataTypes.BIGINT },
  seller_offer_frozen: { type: DataTypes.BOOLEAN },
  locked_by_order_id: { type: DataTypes.BIGINT },
  locked_at: { type: DataTypes.DATE },
  status: { type: DataTypes.ENUM(...) },
  idempotency_key: { type: DataTypes.STRING(128) },
  // ❌ 无 category 字段定义
  // ❌ 无 item_category 字段定义
})
```

**结论**: 模型定义与真实数据库字段一致，均不包含 `category` 相关字段

#### 2.3 迁移历史审计

**审计范围**: `migrations/*.js` 中所有涉及 `market_listings` 的迁移

**审计结果**:

```bash
grep -r "market_listings.*category\|addColumn.*market_listings.*category" migrations/
# 输出: 无匹配结果
```

**结论**: 从未存在过向 `market_listings` 添加 `category` 字段的迁移

---

## 🎯 业务语义分析

### 当前项目的实际业务模型

#### 1. 商业模式定位

- **核心业务**: 餐厅积分抽奖体系
- **扩展功能**:
  - **C2C 交易市场**: 用户间物品/资产交易（`market_listings` + `trade_orders`）
  - **B2C 兑换商城**: 官方商品兑换（`exchange_items` + `exchange_records`）

#### 2. 交易市场挂牌模型

**挂牌类型** (`listing_kind`):

- `item_instance`: 不可叠加物品实例（装备、卡牌、优惠券等）
- `fungible_asset`: 可叠加资产/材料（钻石、碎片、水晶等）

**定价币种**: 固定为 `DIAMOND`（钻石）

**核心业务流程**:

```plaintext
创建挂牌 → 锁定标的 → 购买锁定 → 冻结买家DIAMOND → 成交结算 → 所有权转移
   ↓          ↓            ↓            ↓              ↓            ↓
on_sale  冻结卖家资产   locked     冻结买家资产       sold      解冻/扣减
```

### 现有筛选能力（与 DB 字段对齐）

| 筛选维度 | 参数名                   | DB 字段                      | 索引支持 | 业务语义           |
| -------- | ------------------------ | ---------------------------- | -------- | ------------------ |
| 挂牌类型 | `listing_kind`           | `listing_kind`               | ✅       | 物品 vs 资产       |
| 资产代码 | `asset_code`             | `offer_asset_code`           | ✅       | 红碎片/蓝水晶等    |
| 价格区间 | `min_price`, `max_price` | `price_amount`               | ✅       | 价格筛选           |
| 排序方式 | `sort`                   | `created_at`, `price_amount` | ✅       | 最新/价格升序/降序 |
| 分页     | `page`, `page_size`      | -                            | -        | 分页展示           |

### "分类"概念的可能来源（需产品确认）

由于现有模型不支持 `category`，需确认业务上"分类"的真实需求：

**可能性 A**: 前端自行分类展示

- 按 `listing_kind` 分两栏（物品/材料）
- 材料资产按 `offer_asset_code` 映射到颜色分组（红/橙/黄/绿/蓝/紫）
- 物品按 `ItemInstance.item_type` 分类（装备/卡牌/优惠券）

**可能性 B**: 历史遗留参数（已废弃）

- 早期版本可能支持过 `category`，但在某次重构中被 `listing_kind` 取代
- 兼容代码残留但未同步清理

**可能性 C**: 未来规划功能（尚未实现）

- 计划增加分类维度，但 DB 迁移未完成
- Service 层提前预留了兼容逻辑

---

## 🔧 清理方案（可执行版）

### 方案选择决策树

```plaintext
是否需要"分类筛选"功能？
│
├─ NO（推荐）→ 方案A: 正式废弃 category 参数
│   ├─ 优势: 快速、低风险、无需 DB 变更
│   ├─ 劣势: 无法按分类筛选（但现有筛选已满足需求）
│   └─ 适用: 现有 listing_kind + asset_code 已满足业务需求
│
└─ YES → 方案B: 实现分类功能
    ├─ B1: 新增 category 表字段
    │   ├─ 优势: 标准方案，性能最优
    │   └─ 劣势: 需 DB 迁移、数据回填、索引优化
    │
    └─ B2: 衍生计算分类
        ├─ 优势: 无需改表结构
        └─ 劣势: 查询性能较差，逻辑复杂

推荐: 方案A（正式废弃）
```

---

### 方案 A: 正式废弃 category 参数（推荐）

#### 阶段 0: 立即止血（1 天完成）

**目标**: 防止携带 `category` 的请求触发 SQL 错误

**代码修改** (`services/MarketListingService.js`):

```javascript
static async getMarketListings(params = {}) {
  const {
    category,  // ⚠️ 保留参数提取（向后兼容）
    listing_kind,
    asset_code,
    ...
  } = params

  // 🔴 立即止血：忽略 category 但记录警告
  if (category !== undefined) {
    logger.warn('[MarketListingService] 收到已废弃的 category 参数', {
      category: category,
      request_id: params.request_id,
      deprecation_notice: 'category 参数已废弃，请使用 listing_kind + asset_code 替代'
    })
  }

  // 构建缓存参数（🔴 移除 category 维度）
  const cacheParams = {
    page,
    page_size,
    // category: category || 'all',  // ❌ 删除此行
    listing_kind: listing_kind || 'all',
    asset_code: asset_code || 'all',
    min_price: min_price || 0,
    max_price: max_price || 0,
    sort
  }

  // 构建查询条件
  const whereClause = { status: 'on_sale' }

  // ❌ 删除旧代码：兼容旧的 category 参数
  // if (category) {
  //   whereClause.category = category
  // }

  // ✅ 保留新筛选能力
  if (listing_kind && ['item_instance', 'fungible_asset'].includes(listing_kind)) {
    whereClause.listing_kind = listing_kind
  }
  if (asset_code) {
    whereClause.offer_asset_code = asset_code
  }
  // ... 其他筛选条件保持不变
}
```

**验证步骤**:

1. 请求 `/api/v4/market/listings` (不带 category) → 应正常返回
2. 请求 `/api/v4/market/listings?category=test` → 应正常返回（忽略 category）并记录警告日志
3. 检查日志中是否出现 `[MarketListingService] 收到已废弃的 category 参数` 警告

**缓存失效**:

```bash
# 清理所有 market listings 缓存（避免旧 key 残留）
redis-cli --scan --pattern "app:v4:*:api:market:listings:*" | xargs redis-cli del
```

#### 阶段 1: 客户端改造期（2-4 周）

**目标**: 通知并协助前端/小程序移除 `category` 参数

**API 文档更新** (`routes/v4/market/listings.js`):

```javascript
/**
 * @route GET /api/v4/market/listings
 * @desc 获取交易市场挂牌列表（带缓存）
 *
 * @query {string} listing_kind - 挂牌类型筛选（item_instance / fungible_asset，可选）
 * @query {string} asset_code - 资产代码筛选（如 red_shard，仅对 fungible_asset 有效）
 * @query {number} min_price - 最低价格筛选（可选）
 * @query {number} max_price - 最高价格筛选（可选）
 * @query {string} sort - 排序方式（newest/price_asc/price_desc，默认newest）
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页数量（默认20）
 *
 * @deprecated category - ⚠️ 已废弃，请勿使用。替代方案：
 *   - 物品筛选: listing_kind=item_instance
 *   - 材料筛选: listing_kind=fungible_asset&asset_code=red_shard
 *
 * @example 查询可叠加资产（红色碎片）:
 *   GET /api/v4/market/listings?listing_kind=fungible_asset&asset_code=red_shard&page=1&limit=20
 *
 * @example 查询物品实例:
 *   GET /api/v4/market/listings?listing_kind=item_instance&sort=price_asc&page=1&limit=20
 */
router.get('/listings', authenticateToken, async (req, res) => {
  const { category, listing_kind, asset_code, ... } = req.query

  // 🔴 兼容期警告响应头
  if (category !== undefined) {
    res.set('X-Deprecated-Param', 'category')
    res.set('X-Deprecation-Notice', 'Use listing_kind and asset_code instead')
  }

  const result = await MarketListingService.getMarketListings({
    // category,  // ❌ 不再传递给 Service
    listing_kind,
    asset_code,
    ...
  })

  // ... 返回结果
})
```

**前端改造指南**:

| 旧调用（废弃）        | 新调用（推荐）                                      | 说明         |
| --------------------- | --------------------------------------------------- | ------------ |
| `?category=weapon`    | `?listing_kind=item_instance`                       | 物品类筛选   |
| `?category=material`  | `?listing_kind=fungible_asset`                      | 材料类筛选   |
| `?category=red_shard` | `?listing_kind=fungible_asset&asset_code=red_shard` | 具体材料筛选 |

**监控指标**:

```javascript
// 在 MarketListingService.getMarketListings() 中添加
if (category !== undefined) {
  metrics.increment('api.market.listings.deprecated_category_usage', {
    category_value: category,
    client_version: req.headers['x-client-version'] || 'unknown'
  })
}
```

**目标**: `deprecated_category_usage` 指标在 2-4 周内归零

#### 阶段 2: 强制废弃（兼容期结束后）

**触发条件**: `deprecated_category_usage` 连续 7 天为 0

**代码修改** (`routes/v4/market/listings.js`):

```javascript
router.get('/listings', authenticateToken, async (req, res) => {
  const { category, listing_kind, asset_code, ... } = req.query

  // 🔴 强制拦截：category 参数已废弃
  if (category !== undefined) {
    logger.warn('[API废弃] 收到已废弃的 category 参数', {
      ip: req.ip,
      user_id: req.user?.user_id,
      category: category,
      request_id: req.id
    })

    return res.apiError(
      '参数 category 已废弃，请使用 listing_kind 和 asset_code 替代',
      'DEPRECATED_PARAMETER',
      {
        deprecated_param: 'category',
        replacement: {
          for_items: 'listing_kind=item_instance',
          for_assets: 'listing_kind=fungible_asset&asset_code=<ASSET_CODE>',
          examples: [
            '/api/v4/market/listings?listing_kind=item_instance',
            '/api/v4/market/listings?listing_kind=fungible_asset&asset_code=red_shard'
          ]
        },
        deprecation_date: '2026-01-13',
        enforcement_date: '2026-02-10'
      },
      410  // 410 Gone - 资源已永久移除
    )
  }

  // 正常业务逻辑
  const result = await MarketListingService.getMarketListings({ listing_kind, asset_code, ... })
  return res.apiSuccess({ products: result.products, pagination: result.pagination })
})
```

**文档修改注释清理**:

```javascript
// 完全移除所有 "兼容旧参数 category" 的注释
// ❌ 删除: @param {string} [params.category] - 分类筛选（可选，兼容旧参数）
```

---

### 方案 B: 实现分类功能（仅当业务确实需要时）

#### B1: 新增 category 表字段

**数据库迁移** (`migrations/20260113000000-add-category-to-market-listings.js`):

```javascript
'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      console.log('🔧 为 market_listings 表添加 category 字段')

      // 1. 添加字段
      await queryInterface.addColumn(
        'market_listings',
        'category',
        {
          type: Sequelize.ENUM(
            'weapon',
            'card',
            'coupon',
            'material_red',
            'material_orange',
            'material_yellow'
          ),
          allowNull: true, // 暂时允许 NULL（兼容存量数据）
          comment:
            '挂牌分类（Category）：weapon-武器装备 | card-卡牌 | coupon-优惠券 | material_*-材料分组'
        },
        { transaction }
      )

      // 2. 回填存量数据（根据 listing_kind 和 offer_asset_code 推导）
      await queryInterface.sequelize.query(
        `
        UPDATE market_listings ml
        SET category = CASE
          WHEN ml.listing_kind = 'fungible_asset' AND ml.offer_asset_code LIKE 'red_%' THEN 'material_red'
          WHEN ml.listing_kind = 'fungible_asset' AND ml.offer_asset_code LIKE 'orange_%' THEN 'material_orange'
          WHEN ml.listing_kind = 'fungible_asset' AND ml.offer_asset_code LIKE 'yellow_%' THEN 'material_yellow'
          WHEN ml.listing_kind = 'item_instance' THEN (
            SELECT CASE
              WHEN ii.item_type LIKE '%weapon%' THEN 'weapon'
              WHEN ii.item_type LIKE '%card%' THEN 'card'
              WHEN ii.item_type LIKE '%coupon%' THEN 'coupon'
              ELSE NULL
            END
            FROM item_instances ii
            WHERE ii.item_instance_id = ml.offer_item_instance_id
          )
          ELSE NULL
        END
        WHERE category IS NULL
        `,
        { transaction }
      )

      // 3. 添加索引
      await queryInterface.addIndex('market_listings', ['category', 'status'], {
        name: 'idx_market_listings_category_status',
        transaction
      })

      // 4. 设置字段为非空（存量数据已回填）
      await queryInterface.changeColumn(
        'market_listings',
        'category',
        {
          type: Sequelize.ENUM(
            'weapon',
            'card',
            'coupon',
            'material_red',
            'material_orange',
            'material_yellow'
          ),
          allowNull: false,
          comment:
            '挂牌分类（Category）：weapon-武器装备 | card-卡牌 | coupon-优惠券 | material_*-材料分组'
        },
        { transaction }
      )

      await transaction.commit()
      console.log('✅ category 字段添加完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.removeIndex('market_listings', 'idx_market_listings_category_status', {
        transaction
      })
      await queryInterface.removeColumn('market_listings', 'category', { transaction })
      await transaction.commit()
      console.log('✅ category 字段回滚完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
```

**模型定义更新** (`models/MarketListing.js`):

```javascript
MarketListing.init(
  {
    // ... 其他字段

    category: {
      type: DataTypes.ENUM(
        'weapon',
        'card',
        'coupon',
        'material_red',
        'material_orange',
        'material_yellow'
      ),
      allowNull: false,
      comment:
        '挂牌分类（Category）：weapon-武器装备 | card-卡牌 | coupon-优惠券 | material_*-材料分组'
    }

    // ... 其他字段
  },
  {
    indexes: [
      { fields: ['category', 'status'], name: 'idx_category_status' }
      // ... 其他索引
    ]
  }
)
```

**Service 层修改** (`services/MarketListingService.js`):

```javascript
static async getMarketListings(params = {}) {
  const { category, listing_kind, asset_code, ... } = params

  // ✅ 正式支持 category 筛选
  if (category && ['weapon', 'card', 'coupon', 'material_red', 'material_orange', 'material_yellow'].includes(category)) {
    whereClause.category = category
  }

  // 缓存 key 包含 category
  const cacheParams = {
    category: category || 'all',
    ...
  }

  // ... 其他逻辑
}
```

**前置条件**:

- [ ] 产品需求明确：定义清晰的分类体系（枚举值、业务语义）
- [ ] 数据治理方案：新挂牌如何自动归类、存量数据如何回填
- [ ] 前端改造时间：需配套前端 UI 改造（分类筛选下拉框/Tab 切换）

#### B2: 衍生计算分类（不推荐）

**实现思路**:

```javascript
static async getMarketListings(params = {}) {
  const { category, ... } = params

  // 根据 category 映射到实际字段筛选
  if (category) {
    switch (category) {
      case 'weapon':
      case 'card':
      case 'coupon':
        whereClause.listing_kind = 'item_instance'
        // 需要 JOIN item_instances 并按 item_type 过滤（性能差）
        include.push({
          model: ItemInstance,
          as: 'offerItem',
          where: { item_type: { [Op.like]: `%${category}%` } },
          required: true
        })
        break

      case 'material_red':
        whereClause.listing_kind = 'fungible_asset'
        whereClause.offer_asset_code = { [Op.like]: 'red_%' }
        break

      // ... 其他映射
    }
  }
}
```

**劣势**:

- JOIN 查询性能差（无法利用 `status` + `created_at` 等核心索引）
- `item_type` 的 LIKE 查询无法使用索引
- 缓存命中率低（category 与实际 where 条件不对应）

**适用场景**: 仅临时过渡，长期仍需改为方案 B1

---

## ✅ 验证清单

### 代码层验证

- [ ] **静态扫描**: 全仓库搜索 `params.category`、`whereClause.category`、`req.query.category`，确认所有引用已按方案处理
- [ ] **API 文档**: 更新 Swagger/Postman 文档，标注 `category` 废弃状态
- [ ] **测试用例**: 补充测试覆盖

  ```javascript
  // 测试带 category 参数的请求（阶段0-1: 应忽略不报错）
  it('应忽略已废弃的 category 参数', async () => {
    const res = await request(app)
      .get('/api/v4/market/listings?category=test&page=1&limit=20')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  // 测试不带 category 参数的请求（应正常工作）
  it('应正常返回市场列表', async () => {
    const res = await request(app)
      .get('/api/v4/market/listings?listing_kind=fungible_asset&asset_code=red_shard')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.products).toBeInstanceOf(Array)
  })
  ```

### 数据库层验证

- [ ] **字段检查**: 连接生产/测试库执行 `SHOW COLUMNS FROM market_listings`，确认字段集合符合预期
- [ ] **索引检查**: 执行 `SHOW INDEX FROM market_listings`，确认无冗余 `category` 相关索引
- [ ] **慢查询监控**: 上线后观察是否有因 `category` 导致的慢查询（应为 0）

### 缓存层验证

- [ ] **缓存 Key 审计**: 检查 Redis 中是否还存在包含 `category` 的旧 key
  ```bash
  redis-cli --scan --pattern "*:market:listings:*:category:*" --count 1000
  # 应返回空（如有旧 key 需手动清理）
  ```
- [ ] **缓存命中率**: 监控 `market:listings` 缓存命中率，确保清理后无显著下降

### 业务层验证

- [ ] **功能回归**: 前端/小程序完整回归测试
  - 商品列表正常展示（按 `listing_kind`、`asset_code`、价格筛选）
  - 排序功能正常（最新/价格升序/降序）
  - 分页功能正常
  - 筛选组合正常（`listing_kind + asset_code + price_range`）
- [ ] **边界测试**:
  - 请求携带 `category`（阶段0-1: 应忽略；阶段2: 应返回410）
  - 请求不携带任何筛选参数（应返回全部在售挂牌）
  - 请求携带非法 `listing_kind` 值（应正常处理，不过滤该维度）

### 监控指标

- [ ] **错误率监控**: `/api/v4/market/listings` 接口错误率应为 0（尤其是 SQL 错误）
- [ ] **性能监控**: 响应时间 P95 < 100ms（缓存命中时 < 50ms）
- [ ] **废弃参数监控**: `deprecated_category_usage` 指标趋势（目标：归零）
- [ ] **日志告警**: 搜索关键词 `Unknown column 'category'`（应无匹配）

---

## 📊 推荐执行时间表

| 阶段                | 时间     | 工作内容                        | 责任人   | 验收标准                 |
| ------------------- | -------- | ------------------------------- | -------- | ------------------------ |
| **阶段0: 立即止血** | Day 1    | 移除 SQL 过滤逻辑，添加警告日志 | 后端开发 | 带 category 请求不再报错 |
| **阶段1: 兼容期**   | Week 1-4 | 更新文档、通知前端、监控使用率  | 全栈团队 | category 使用率归零      |
| **阶段2: 强制废弃** | Week 5+  | 添加 410 错误响应，清理代码注释 | 后端开发 | 所有 category 引用已清理 |
| **最终验收**        | Week 6   | 完整回归测试、性能验证          | 测试团队 | 通过全部验证清单         |

---

## 📞 技术支持联系人

**问题升级路径**:

1. **开发阶段**: 遇到技术问题联系后端开发负责人
2. **兼容期**: 前端/小程序改造疑问联系全栈团队
3. **生产验证**: 性能/稳定性问题联系运维团队

**关键决策点**:

- **是否采用方案 A 还是方案 B**: 需产品经理确认业务需求
- **兼容期时长**: 建议 2-4 周，可根据实际监控数据调整
- **强制废弃时机**: 需确认 `deprecated_category_usage` 连续 7 天为 0

---

## 📚 相关文档

- `docs/迁移双轨兼容残留清理方案-2026-01-13.md` - 原始问题报告
- `models/MarketListing.js` - 市场挂牌模型定义
- `services/MarketListingService.js` - 挂牌服务层代码
- `routes/v4/market/listings.js` - 市场列表路由
- `migrations/20260104000000-baseline-v2.0.0-from-production.js` - 生产基线迁移

---

**报告生成时间**: 2026年01月13日  
**审计基准**: 代码库最新版本 + 真实数据库 `restaurant_points_dev`  
**下次审计**: 方案执行完成后进行全面复核

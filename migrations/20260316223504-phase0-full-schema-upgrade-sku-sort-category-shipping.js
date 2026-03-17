'use strict'

/**
 * Phase 0 — 一次性全量 Schema 升级（幂等版本）
 *
 * 按文档「管理后台功能差距分析与优化方案 v3.1」10.14 决策9：
 * 项目未上线，数据库 Schema 一步到位，业务逻辑分批开发。
 *
 * 变更清单：
 * 1. CREATE TABLE exchange_item_skus   — SPU/SKU 全量模式（5.2.7 + 9.1#2）
 * 2. ALTER  exchange_items             — +spec_names/min_cost_amount/max_cost_amount/is_pinned/pinned_at/is_recommended
 * 3. ALTER  market_listings            — +sort_order/is_pinned/pinned_at/is_recommended
 * 4. ALTER  lottery_campaigns          — +sort_order/is_featured/is_hidden/display_tags/display_start_time/display_end_time
 * 5. ALTER  category_defs             — +parent_code/level（两级分类 8.5）
 * 6. ALTER  exchange_records           — +shipping_company/shipping_company_name/shipping_no（快递 8.6）
 * 7. INSERT exchange_item_skus         — 为现有商品创建默认 SKU
 * 8. INSERT system_configs             — 退款防刷 3 个配置项（初始值全 0）
 *
 * 注意：MySQL DDL 不支持事务回滚，本迁移使用幂等检查（IF NOT EXISTS / columnExists）保证可重入。
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize
    const qi = queryInterface

    /**
     * 安全添加列：检查列是否存在后再添加
     * @param {string} table - 表名
     * @param {string} column - 列名
     * @param {Object} definition - 列定义
     */
    async function safeAddColumn(table, column, definition) {
      const exists = await columnExists(table, column)
      if (!exists) {
        await qi.addColumn(table, column, definition)
      } else {
        console.log(`  [跳过] ${table}.${column} 已存在`)
      }
    }

    /**
     * 检查列是否存在
     * @param {string} table - 表名
     * @param {string} column - 列名
     * @returns {Promise<boolean>} 是否存在
     */
    async function columnExists(table, column) {
      const [cols] = await qi.sequelize.query(
        `SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`
      )
      return cols.length > 0
    }

    /**
     * 安全添加索引：检查索引是否存在后再添加
     * @param {string} table - 表名
     * @param {Array} fields - 索引字段
     * @param {Object} options - 索引选项（必须包含 name）
     */
    async function safeAddIndex(table, fields, options) {
      const [indexes] = await qi.sequelize.query(
        `SHOW INDEX FROM \`${table}\` WHERE Key_name = '${options.name}'`
      )
      if (indexes.length === 0) {
        await qi.addIndex(table, fields, options)
      } else {
        console.log(`  [跳过] 索引 ${options.name} 已存在`)
      }
    }

    /**
     * 检查表是否存在
     * @param {string} table - 表名
     * @returns {Promise<boolean>} 是否存在
     */
    async function tableExists(table) {
      const [tables] = await qi.sequelize.query(
        `SHOW TABLES LIKE '${table}'`
      )
      return tables.length > 0
    }

    // ================================================================
    // 1. CREATE TABLE exchange_item_skus（SPU/SKU 全量模式）
    // ================================================================
    console.log('[Phase0] 步骤1: 创建 exchange_item_skus 表...')

    if (!(await tableExists('exchange_item_skus'))) {
      await qi.createTable(
        'exchange_item_skus',
        {
          sku_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: 'SKU 主键'
          },
          exchange_item_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            comment: '关联 SPU 商品ID',
            references: { model: 'exchange_items', key: 'exchange_item_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          spec_values: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {},
            comment: '规格值 JSON，如 {"颜色":"白色","尺码":"S"}；单品商品为 {}'
          },
          cost_asset_code: {
            type: DataTypes.STRING(50),
            allowNull: true,
            comment: '支付资产代码（可覆盖 SPU 默认值），NULL 时使用 SPU 的 cost_asset_code'
          },
          cost_amount: {
            type: DataTypes.BIGINT,
            allowNull: false,
            comment: '该 SKU 的兑换价格（材料数量）'
          },
          stock: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '该 SKU 独立库存'
          },
          sold_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '该 SKU 已售数量'
          },
          image_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: '该 SKU 专属图片ID，关联 image_resources.image_resource_id',
            references: { model: 'image_resources', key: 'image_resource_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          status: {
            type: DataTypes.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active',
            comment: 'SKU 状态：active-可售 | inactive-停售'
          },
          sort_order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'SKU 排序（同一商品内的展示顺序）'
          },
          created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '兑换商品 SKU 表（规格变体，全量模式：所有商品至少有一个默认 SKU）'
        }
      )
    } else {
      console.log('  [跳过] exchange_item_skus 表已存在')
    }

    await safeAddIndex('exchange_item_skus', ['exchange_item_id'], { name: 'idx_sku_exchange_item_id' })
    await safeAddIndex('exchange_item_skus', ['exchange_item_id', 'status'], { name: 'idx_sku_item_status' })
    await safeAddIndex('exchange_item_skus', ['status'], { name: 'idx_sku_status' })

    // ================================================================
    // 2. ALTER TABLE exchange_items — SPU 扩展 + 排序增强
    // ================================================================
    console.log('[Phase0] 步骤2: exchange_items 新增字段...')

    await safeAddColumn('exchange_items', 'spec_names', {
      type: DataTypes.JSON, allowNull: true, defaultValue: null,
      comment: '规格维度名称，如 ["颜色","尺码"]；单品商品为 NULL', after: 'rarity_code'
    })
    await safeAddColumn('exchange_items', 'min_cost_amount', {
      type: DataTypes.BIGINT, allowNull: true, defaultValue: null,
      comment: 'SKU 最低价（自动计算，单品时等于 cost_amount）', after: 'spec_names'
    })
    await safeAddColumn('exchange_items', 'max_cost_amount', {
      type: DataTypes.BIGINT, allowNull: true, defaultValue: null,
      comment: 'SKU 最高价（自动计算，单品时等于 cost_amount）', after: 'min_cost_amount'
    })
    await safeAddColumn('exchange_items', 'is_pinned', {
      type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0,
      comment: '是否置顶（置顶的始终排在最前）', after: 'max_cost_amount'
    })
    await safeAddColumn('exchange_items', 'pinned_at', {
      type: DataTypes.DATE, allowNull: true, defaultValue: null,
      comment: '置顶时间（多个置顶时按此排序）', after: 'is_pinned'
    })
    await safeAddColumn('exchange_items', 'is_recommended', {
      type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0,
      comment: '是否推荐（前端可高亮展示）', after: 'pinned_at'
    })

    // ================================================================
    // 3. ALTER TABLE market_listings — 排序增强
    // ================================================================
    console.log('[Phase0] 步骤3: market_listings 新增排序字段...')

    await safeAddColumn('market_listings', 'sort_order', {
      type: DataTypes.INTEGER, allowNull: false, defaultValue: 0,
      comment: '运营排序权重（数值越小越靠前）', after: 'status'
    })
    await safeAddColumn('market_listings', 'is_pinned', {
      type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0,
      comment: '是否置顶', after: 'sort_order'
    })
    await safeAddColumn('market_listings', 'pinned_at', {
      type: DataTypes.DATE, allowNull: true, defaultValue: null,
      comment: '置顶时间', after: 'is_pinned'
    })
    await safeAddColumn('market_listings', 'is_recommended', {
      type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0,
      comment: '是否推荐（前端「推荐」标签）', after: 'pinned_at'
    })

    // ================================================================
    // 4. ALTER TABLE lottery_campaigns — 展示控制
    // ================================================================
    console.log('[Phase0] 步骤4: lottery_campaigns 新增展示控制字段...')

    await safeAddColumn('lottery_campaigns', 'sort_order', {
      type: DataTypes.INTEGER, allowNull: false, defaultValue: 0,
      comment: '展示排序（数值越小越靠前）', after: 'background_image_url'
    })
    await safeAddColumn('lottery_campaigns', 'is_featured', {
      type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0,
      comment: '是否精选/主推活动（前端可高亮展示）', after: 'sort_order'
    })
    await safeAddColumn('lottery_campaigns', 'is_hidden', {
      type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0,
      comment: '是否隐藏（active 但不在列表展示，用于内测/定向活动）', after: 'is_featured'
    })
    await safeAddColumn('lottery_campaigns', 'display_tags', {
      type: DataTypes.JSON, allowNull: true, defaultValue: null,
      comment: '展示标签，如 ["限时","新活动","热门"]', after: 'is_hidden'
    })
    await safeAddColumn('lottery_campaigns', 'display_start_time', {
      type: DataTypes.DATE, allowNull: true, defaultValue: null,
      comment: '展示开始时间（可早于 start_time 做预热展示）', after: 'display_tags'
    })
    await safeAddColumn('lottery_campaigns', 'display_end_time', {
      type: DataTypes.DATE, allowNull: true, defaultValue: null,
      comment: '展示结束时间（可晚于 end_time 做收尾展示）', after: 'display_start_time'
    })

    // ================================================================
    // 5. ALTER TABLE category_defs — 两级分类
    // ================================================================
    console.log('[Phase0] 步骤5: category_defs 新增两级分类字段...')

    await safeAddColumn('category_defs', 'parent_code', {
      type: DataTypes.STRING(50), allowNull: true, defaultValue: null,
      comment: '父分类代码，NULL 表示一级分类。FK → category_defs.category_code', after: 'is_enabled'
    })
    await safeAddColumn('category_defs', 'level', {
      type: DataTypes.TINYINT, allowNull: false, defaultValue: 1,
      comment: '层级（1=一级，2=二级），应用层限制最多 2 级', after: 'parent_code'
    })

    // 自引用外键（幂等：检查约束是否存在）
    const [fks] = await qi.sequelize.query(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'category_defs'
         AND CONSTRAINT_NAME = 'fk_category_parent' AND CONSTRAINT_TYPE = 'FOREIGN KEY'`
    )
    if (fks.length === 0) {
      await qi.addConstraint('category_defs', {
        type: 'foreign key',
        name: 'fk_category_parent',
        fields: ['parent_code'],
        references: { table: 'category_defs', field: 'category_code' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      })
    }

    await safeAddIndex('category_defs', ['parent_code'], { name: 'idx_category_parent_code' })
    await safeAddIndex('category_defs', ['level'], { name: 'idx_category_level' })

    // ================================================================
    // 6. ALTER TABLE exchange_records — 快递字段
    // ================================================================
    console.log('[Phase0] 步骤6: exchange_records 新增快递字段...')

    await safeAddColumn('exchange_records', 'shipping_company', {
      type: DataTypes.STRING(50), allowNull: true, defaultValue: null,
      comment: '快递公司代码（如 sf/yt/zt/yto）', after: 'refunded_at'
    })
    await safeAddColumn('exchange_records', 'shipping_company_name', {
      type: DataTypes.STRING(100), allowNull: true, defaultValue: null,
      comment: '快递公司名称（如 顺丰速运）', after: 'shipping_company'
    })
    await safeAddColumn('exchange_records', 'shipping_no', {
      type: DataTypes.STRING(100), allowNull: true, defaultValue: null,
      comment: '快递单号', after: 'shipping_company_name'
    })

    await safeAddIndex('exchange_records', ['shipping_no'], { name: 'idx_exchange_records_shipping_no' })

    // ================================================================
    // 7. 为现有商品创建默认 SKU（幂等：仅在 SKU 表为空时执行）
    // ================================================================
    console.log('[Phase0] 步骤7: 为现有商品创建默认 SKU...')

    const [skuCount] = await qi.sequelize.query(
      'SELECT COUNT(*) as cnt FROM exchange_item_skus'
    )
    if (skuCount[0].cnt === 0) {
      const [existingItems] = await qi.sequelize.query(
        'SELECT exchange_item_id, cost_asset_code, cost_amount, stock, sold_count FROM exchange_items'
      )
      if (existingItems.length > 0) {
        const skuValues = existingItems.map(item =>
          `(${item.exchange_item_id}, '{}', '${item.cost_asset_code}', ${item.cost_amount}, ${item.stock}, ${item.sold_count}, 'active', 0, NOW(), NOW())`
        ).join(', ')

        await qi.sequelize.query(
          `INSERT INTO exchange_item_skus
            (exchange_item_id, spec_values, cost_asset_code, cost_amount, stock, sold_count, status, sort_order, created_at, updated_at)
           VALUES ${skuValues}`
        )

        for (const item of existingItems) {
          await qi.sequelize.query(
            `UPDATE exchange_items SET min_cost_amount = ${item.cost_amount}, max_cost_amount = ${item.cost_amount}
             WHERE exchange_item_id = ${item.exchange_item_id}`
          )
        }
        console.log(`  已为 ${existingItems.length} 个商品创建默认 SKU`)
      }
    } else {
      console.log(`  [跳过] exchange_item_skus 已有 ${skuCount[0].cnt} 条数据`)
    }

    // ================================================================
    // 8. 插入退款防刷配置项（初始值全 0 = 关闭）
    // ================================================================
    console.log('[Phase0] 步骤8: 插入退款防刷配置项...')

    const refundConfigs = [
      { key: 'refund_cooldown_hours', value: '0', desc: '退款冷却期（小时）：同用户同商品退款后 N 小时内不可再次兑换。0=关闭' },
      { key: 'refund_monthly_limit', value: '0', desc: '单用户每月退款上限（次）。0=不限' },
      { key: 'refund_approval_threshold', value: '0', desc: '退款大额审批阈值（材料数量）：退款金额超过此值需二次审批。0=关闭' }
    ]

    for (const cfg of refundConfigs) {
      const [existing] = await qi.sequelize.query(
        `SELECT system_config_id FROM system_configs WHERE config_key = '${cfg.key}' LIMIT 1`
      )
      if (existing.length === 0) {
        await qi.sequelize.query(
          `INSERT INTO system_configs (config_key, config_value, description, config_category, is_active, created_at, updated_at)
           VALUES ('${cfg.key}', '"${cfg.value}"', '${cfg.desc}', 'exchange_refund', 1, NOW(), NOW())`
        )
        console.log(`  已插入配置: ${cfg.key}`)
      } else {
        console.log(`  [跳过] 配置 ${cfg.key} 已存在`)
      }
    }

    console.log('[Phase0] ✅ 全量 Schema 升级完成')
  },

  async down(queryInterface) {
    const qi = queryInterface

    await qi.sequelize.query(
      "DELETE FROM system_configs WHERE config_key IN ('refund_cooldown_hours','refund_monthly_limit','refund_approval_threshold')"
    )

    const removeColumnSafe = async (table, column) => {
      try { await qi.removeColumn(table, column) } catch { /* ignore */ }
    }
    const removeIndexSafe = async (table, name) => {
      try { await qi.removeIndex(table, name) } catch { /* ignore */ }
    }

    await removeIndexSafe('exchange_records', 'idx_exchange_records_shipping_no')
    await removeColumnSafe('exchange_records', 'shipping_no')
    await removeColumnSafe('exchange_records', 'shipping_company_name')
    await removeColumnSafe('exchange_records', 'shipping_company')

    await removeIndexSafe('category_defs', 'idx_category_level')
    await removeIndexSafe('category_defs', 'idx_category_parent_code')
    try { await qi.removeConstraint('category_defs', 'fk_category_parent') } catch { /* ignore */ }
    await removeColumnSafe('category_defs', 'level')
    await removeColumnSafe('category_defs', 'parent_code')

    await removeColumnSafe('lottery_campaigns', 'display_end_time')
    await removeColumnSafe('lottery_campaigns', 'display_start_time')
    await removeColumnSafe('lottery_campaigns', 'display_tags')
    await removeColumnSafe('lottery_campaigns', 'is_hidden')
    await removeColumnSafe('lottery_campaigns', 'is_featured')
    await removeColumnSafe('lottery_campaigns', 'sort_order')

    await removeColumnSafe('market_listings', 'is_recommended')
    await removeColumnSafe('market_listings', 'pinned_at')
    await removeColumnSafe('market_listings', 'is_pinned')
    await removeColumnSafe('market_listings', 'sort_order')

    await removeColumnSafe('exchange_items', 'is_recommended')
    await removeColumnSafe('exchange_items', 'pinned_at')
    await removeColumnSafe('exchange_items', 'is_pinned')
    await removeColumnSafe('exchange_items', 'max_cost_amount')
    await removeColumnSafe('exchange_items', 'min_cost_amount')
    await removeColumnSafe('exchange_items', 'spec_names')

    try { await qi.dropTable('exchange_item_skus') } catch { /* ignore */ }

    console.log('[Phase0] ✅ 回滚完成')
  }
}

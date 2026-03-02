'use strict'

/**
 * P1a 迁移：广告定价三大机制 — DAU 系数 + 动态底价 + 阶梯折扣
 *
 * 变更清单：
 * 1. CREATE TABLE ad_dau_daily_stats（DAU 每日统计）
 * 2. ad_slots ADD COLUMN min_daily_price_diamond / floor_price_override
 * 3. system_configs INSERT 5 个定价相关配置键
 * 4. ad_slots 冷启动价格调整（home_popup/home_carousel）
 *
 * @see docs/广告位定价方案-实施差距分析.md 第四步
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========== 1. 创建 ad_dau_daily_stats 表 ==========
      const [tables] = await queryInterface.sequelize.query(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ad_dau_daily_stats'",
        { transaction }
      )
      if (tables.length === 0) {
        await queryInterface.createTable(
          'ad_dau_daily_stats',
          {
            ad_dau_daily_stat_id: {
              type: Sequelize.BIGINT,
              primaryKey: true,
              autoIncrement: true,
              comment: 'DAU 每日统计主键'
            },
            stat_date: {
              type: Sequelize.DATEONLY,
              allowNull: false,
              unique: true,
              comment: '统计日期（唯一，每天一条记录）'
            },
            dau_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '当日活跃用户数'
            },
            dau_coefficient: {
              type: Sequelize.DECIMAL(10, 4),
              allowNull: true,
              comment: '当日 DAU 系数（匹配档位后计算得出）'
            },
            source: {
              type: Sequelize.STRING(50),
              allowNull: false,
              defaultValue: 'last_active_at',
              comment: 'DAU 数据来源字段'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
          },
          { transaction, comment: 'DAU 每日统计表（广告定价的 DAU 系数数据源）' }
        )
      }

      // ========== 2. ad_slots 新增定价扩展字段（幂等） ==========
      const [adSlotCols] = await queryInterface.sequelize.query(
        'SHOW COLUMNS FROM ad_slots',
        { transaction }
      )
      const existingCols = new Set(adSlotCols.map(c => c.Field))

      if (!existingCols.has('min_daily_price_diamond')) {
        await queryInterface.addColumn(
          'ad_slots',
          'min_daily_price_diamond',
          {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '最低日价下限（DAU 系数计算结果不得低于此值），0 表示不限制',
            after: 'min_bid_diamond'
          },
          { transaction }
        )
      }

      if (!existingCols.has('floor_price_override')) {
        await queryInterface.addColumn(
          'ad_slots',
          'floor_price_override',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: null,
            comment: '运营手动覆盖的竞价底价（优先于动态计算值），NULL 表示使用自动计算',
            after: 'min_daily_price_diamond'
          },
          { transaction }
        )
      }

      // ========== 3. system_configs 插入定价配置种子数据（幂等） ==========
      const pricingConfigs = [
        {
          config_key: 'ad_dau_pricing_enabled',
          config_value: JSON.stringify(false),
          config_category: 'ad_pricing',
          description: 'DAU 系数定价总开关：关闭则使用 ad_slots 表中的静态日价'
        },
        {
          config_key: 'ad_dau_coefficient_tiers',
          config_value: JSON.stringify([
            { max_dau: 500, coefficient: 0.375, label: '冷启动期' },
            { max_dau: 2000, coefficient: 1.0, label: '成长期' },
            { max_dau: 10000, coefficient: 2.5, label: '规模期' },
            { max_dau: null, coefficient: 6.25, label: '成熟期' }
          ]),
          config_category: 'ad_pricing',
          description: 'DAU 系数档位配置：根据 DAU 区间匹配对应系数'
        },
        {
          config_key: 'ad_dynamic_floor_price_config',
          config_value: JSON.stringify({
            enabled: false,
            lookback_days: 7,
            floor_ratio: 0.5,
            fallback_prices: {
              home_popup: 50,
              home_carousel: 20,
              lottery_popup: 30,
              profile_popup: 20
            }
          }),
          config_category: 'ad_pricing',
          description: '动态竞价底价配置：回看天数、比例系数、各广告位保底价'
        },
        {
          config_key: 'ad_consecutive_discount_tiers',
          config_value: JSON.stringify([
            { min_days: 7, discount: 0.95, label: '周投95折' },
            { min_days: 14, discount: 0.85, label: '双周85折' },
            { min_days: 30, discount: 0.75, label: '月投75折' }
          ]),
          config_category: 'ad_pricing',
          description: '包天连投阶梯折扣规则'
        },
        {
          config_key: 'ad_discount_enabled',
          config_value: JSON.stringify(false),
          config_category: 'ad_pricing',
          description: '阶梯折扣总开关：关闭则所有包天均原价'
        }
      ]

      for (const cfg of pricingConfigs) {
        const [existingCfg] = await queryInterface.sequelize.query(
          'SELECT system_config_id FROM system_configs WHERE config_key = ?',
          { replacements: [cfg.config_key], transaction }
        )
        if (existingCfg.length === 0) {
          await queryInterface.sequelize.query(
            `INSERT INTO system_configs 
              (config_key, config_value, config_category, description, created_at, updated_at)
             VALUES (?, ?, ?, ?, NOW(), NOW())`,
            {
              replacements: [cfg.config_key, cfg.config_value, cfg.config_category, cfg.description],
              transaction
            }
          )
        }
      }

      // ========== 4. 冷启动价格调整（定价方案建议值） ==========
      await queryInterface.sequelize.query(
        "UPDATE ad_slots SET min_budget_diamond = 300 WHERE slot_key = 'home_popup' AND min_budget_diamond = 500",
        { transaction }
      )
      await queryInterface.sequelize.query(
        "UPDATE ad_slots SET daily_price_diamond = 40, min_bid_diamond = 20, min_budget_diamond = 120 WHERE slot_key = 'home_carousel' AND daily_price_diamond = 60",
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚冷启动价格
      await queryInterface.sequelize.query(
        "UPDATE ad_slots SET min_budget_diamond = 500 WHERE slot_key = 'home_popup' AND min_budget_diamond = 300",
        { transaction }
      )
      await queryInterface.sequelize.query(
        "UPDATE ad_slots SET daily_price_diamond = 60, min_bid_diamond = 50, min_budget_diamond = 500 WHERE slot_key = 'home_carousel' AND daily_price_diamond = 40",
        { transaction }
      )

      // 删除定价配置
      await queryInterface.sequelize.query(
        "DELETE FROM system_configs WHERE config_category = 'ad_pricing'",
        { transaction }
      )

      // 删除新增字段
      const [cols] = await queryInterface.sequelize.query(
        'SHOW COLUMNS FROM ad_slots',
        { transaction }
      )
      const colNames = new Set(cols.map(c => c.Field))

      if (colNames.has('floor_price_override')) {
        await queryInterface.removeColumn('ad_slots', 'floor_price_override', { transaction })
      }
      if (colNames.has('min_daily_price_diamond')) {
        await queryInterface.removeColumn('ad_slots', 'min_daily_price_diamond', { transaction })
      }

      // 删除 DAU 统计表
      await queryInterface.dropTable('ad_dau_daily_stats', { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}

'use strict'

/**
 * 创建抽奖策略配置表迁移
 *
 * 本迁移创建两个核心配置表：
 * 1. lottery_strategy_config - 全局策略配置（阈值、功能开关等）
 * 2. lottery_tier_matrix_config - BxPx矩阵配置（分层乘数）
 *
 * 配置优先级：数据库配置 > 环境变量 > 代码默认值
 *
 * @migration 20260120091143-create-lottery-strategy-config-table
 * @author 抽奖模块策略引擎
 * @since 2026-01-20
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // =========================================
      // 1. 创建 lottery_strategy_config 全局策略配置表
      // =========================================
      await queryInterface.createTable(
        'lottery_strategy_config',
        {
          /**
           * 配置ID（自增主键）
           */
          strategy_config_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '策略配置ID（自增主键）'
          },

          /**
           * 配置分组
           * - budget_tier: 预算分层配置
           * - pressure_tier: 活动压力配置
           * - pity: Pity系统配置
           * - luck_debt: 运气债务配置
           * - anti_empty: 防连续空奖配置
           * - anti_high: 防连续高价值配置
           * - experience_state: 体验状态配置
           */
          config_group: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '配置分组（budget_tier/pressure_tier/pity/luck_debt/anti_empty/anti_high/experience_state）'
          },

          /**
           * 配置键名（如 threshold_high, threshold_low, enabled 等）
           */
          config_key: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '配置键名'
          },

          /**
           * 配置值（JSON格式，支持各种类型）
           */
          config_value: {
            type: Sequelize.JSON,
            allowNull: false,
            comment: '配置值（JSON格式）'
          },

          /**
           * 配置值类型
           * - number: 数值型（整数或浮点）
           * - boolean: 布尔型
           * - string: 字符串型
           * - array: 数组型
           * - object: 对象型
           */
          value_type: {
            type: Sequelize.ENUM('number', 'boolean', 'string', 'array', 'object'),
            allowNull: false,
            defaultValue: 'number',
            comment: '配置值类型'
          },

          /**
           * 配置描述（业务含义说明）
           */
          description: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '配置描述'
          },

          /**
           * 是否启用此配置项
           */
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '是否启用'
          },

          /**
           * 配置优先级（数值越大优先级越高）
           * 用于同一 config_key 有多条记录时的冲突解决
           */
          priority: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '配置优先级（数值越大优先级越高）'
          },

          /**
           * 生效开始时间（支持定时生效的配置）
           */
          effective_start: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '生效开始时间'
          },

          /**
           * 生效结束时间
           */
          effective_end: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '生效结束时间'
          },

          /**
           * 创建人ID
           */
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '创建人ID'
          },

          /**
           * 更新人ID
           */
          updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '更新人ID'
          },

          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },

          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '抽奖策略全局配置表（Budget Tier阈值/Pity配置/功能开关等）'
        }
      )

      // 添加唯一索引：config_group + config_key + priority
      await queryInterface.addIndex('lottery_strategy_config', ['config_group', 'config_key', 'priority'], {
        unique: true,
        name: 'uk_strategy_config_group_key_priority',
        transaction
      })

      // 添加查询索引
      await queryInterface.addIndex('lottery_strategy_config', ['config_group', 'is_active'], {
        name: 'idx_strategy_config_group_active',
        transaction
      })

      // =========================================
      // 2. 创建 lottery_tier_matrix_config BxPx矩阵配置表
      // =========================================
      await queryInterface.createTable(
        'lottery_tier_matrix_config',
        {
          /**
           * 矩阵配置ID（自增主键）
           */
          matrix_config_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '矩阵配置ID（自增主键）'
          },

          /**
           * Budget Tier 预算层级（B0/B1/B2/B3）
           */
          budget_tier: {
            type: Sequelize.ENUM('B0', 'B1', 'B2', 'B3'),
            allowNull: false,
            comment: 'Budget Tier 预算层级'
          },

          /**
           * Pressure Tier 活动压力层级（P0/P1/P2）
           */
          pressure_tier: {
            type: Sequelize.ENUM('P0', 'P1', 'P2'),
            allowNull: false,
            comment: 'Pressure Tier 活动压力层级'
          },

          /**
           * 预算上限乘数（相对于 EffectiveBudget）
           * 0 表示强制空奖（B0 场景）
           */
          cap_multiplier: {
            type: Sequelize.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: 1.0,
            comment: '预算上限乘数（0表示强制空奖）'
          },

          /**
           * 空奖权重乘数
           * < 1.0 抑制空奖，> 1.0 增强空奖
           */
          empty_weight_multiplier: {
            type: Sequelize.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: 1.0,
            comment: '空奖权重乘数（<1抑制空奖，>1增强空奖）'
          },

          /**
           * 配置描述
           */
          description: {
            type: Sequelize.STRING(200),
            allowNull: true,
            comment: '配置描述'
          },

          /**
           * 是否启用
           */
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: '是否启用'
          },

          /**
           * 创建人ID
           */
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '创建人ID'
          },

          /**
           * 更新人ID
           */
          updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '更新人ID'
          },

          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },

          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: 'BxPx矩阵配置表（Budget Tier × Pressure Tier 组合的乘数配置）'
        }
      )

      // 添加唯一索引：budget_tier + pressure_tier
      await queryInterface.addIndex('lottery_tier_matrix_config', ['budget_tier', 'pressure_tier'], {
        unique: true,
        name: 'uk_tier_matrix_budget_pressure',
        transaction
      })

      // =========================================
      // 3. 插入默认配置数据
      // =========================================

      // 3.1 Budget Tier 阈值配置
      await queryInterface.bulkInsert(
        'lottery_strategy_config',
        [
          {
            config_group: 'budget_tier',
            config_key: 'threshold_high',
            config_value: JSON.stringify(1000),
            value_type: 'number',
            description: 'B3阈值：预算>=此值可抽所有档位（包括high）',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            config_group: 'budget_tier',
            config_key: 'threshold_mid',
            config_value: JSON.stringify(500),
            value_type: 'number',
            description: 'B2阈值：预算>=此值可抽mid+low+fallback',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            config_group: 'budget_tier',
            config_key: 'threshold_low',
            config_value: JSON.stringify(100),
            value_type: 'number',
            description: 'B1阈值：预算>=此值可抽low+fallback',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      // 3.2 Pressure Tier 阈值配置
      await queryInterface.bulkInsert(
        'lottery_strategy_config',
        [
          {
            config_group: 'pressure_tier',
            config_key: 'threshold_high',
            config_value: JSON.stringify(0.8),
            value_type: 'number',
            description: 'P2阈值：压力指数>=此值为高压',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            config_group: 'pressure_tier',
            config_key: 'threshold_low',
            config_value: JSON.stringify(0.5),
            value_type: 'number',
            description: 'P1阈值：压力指数>=此值为中压',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      // 3.3 Pity 系统配置
      await queryInterface.bulkInsert(
        'lottery_strategy_config',
        [
          {
            config_group: 'pity',
            config_key: 'enabled',
            config_value: JSON.stringify(true),
            value_type: 'boolean',
            description: '是否启用Pity系统',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            config_group: 'pity',
            config_key: 'hard_guarantee_threshold',
            config_value: JSON.stringify(10),
            value_type: 'number',
            description: '硬保底触发阈值（连续空奖次数）',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            config_group: 'pity',
            config_key: 'min_non_empty_cost',
            config_value: JSON.stringify(10),
            value_type: 'number',
            description: '最低非空奖成本',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            config_group: 'pity',
            config_key: 'multiplier_table',
            config_value: JSON.stringify({
              0: 1.0,
              1: 1.0,
              2: 1.2,
              3: 1.5,
              4: 1.8,
              5: 2.2,
              6: 2.8,
              7: 3.5,
              8: 5.0,
              9: 10.0
            }),
            value_type: 'object',
            description: 'Pity累积倍数表（连续空奖次数 -> 非空奖权重乘数）',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      // 3.4 Luck Debt 运气债务配置
      await queryInterface.bulkInsert(
        'lottery_strategy_config',
        [
          {
            config_group: 'luck_debt',
            config_key: 'enabled',
            config_value: JSON.stringify(true),
            value_type: 'boolean',
            description: '是否启用运气债务机制',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            config_group: 'luck_debt',
            config_key: 'expected_empty_rate',
            config_value: JSON.stringify(0.3),
            value_type: 'number',
            description: '期望空奖率（基准线）',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            config_group: 'luck_debt',
            config_key: 'min_draw_count',
            config_value: JSON.stringify(10),
            value_type: 'number',
            description: '最小抽奖样本量',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      // 3.5 Anti-Empty Streak 配置
      await queryInterface.bulkInsert(
        'lottery_strategy_config',
        [
          {
            config_group: 'anti_empty',
            config_key: 'enabled',
            config_value: JSON.stringify(true),
            value_type: 'boolean',
            description: '是否启用防连续空奖机制',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            config_group: 'anti_empty',
            config_key: 'empty_streak_threshold',
            config_value: JSON.stringify(3),
            value_type: 'number',
            description: '连续空奖触发阈值',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      // 3.6 Anti-High Streak 配置
      await queryInterface.bulkInsert(
        'lottery_strategy_config',
        [
          {
            config_group: 'anti_high',
            config_key: 'enabled',
            config_value: JSON.stringify(true),
            value_type: 'boolean',
            description: '是否启用防连续高价值机制',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            config_group: 'anti_high',
            config_key: 'recent_draw_window',
            config_value: JSON.stringify(5),
            value_type: 'number',
            description: '近期高价值奖品统计窗口',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            config_group: 'anti_high',
            config_key: 'high_streak_threshold',
            config_value: JSON.stringify(2),
            value_type: 'number',
            description: '高价值奖品触发阈值',
            is_active: true,
            priority: 0,
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      // 3.7 BxPx 矩阵默认配置（12种组合）
      const matrixData = [
        // B0 档强制全空奖
        { budget_tier: 'B0', pressure_tier: 'P0', cap_multiplier: 0, empty_weight_multiplier: 10.0, description: 'B0-P0: 预算不足，强制空奖' },
        { budget_tier: 'B0', pressure_tier: 'P1', cap_multiplier: 0, empty_weight_multiplier: 10.0, description: 'B0-P1: 预算不足，强制空奖' },
        { budget_tier: 'B0', pressure_tier: 'P2', cap_multiplier: 0, empty_weight_multiplier: 10.0, description: 'B0-P2: 预算不足，强制空奖' },
        // B1 档
        { budget_tier: 'B1', pressure_tier: 'P0', cap_multiplier: 1.0, empty_weight_multiplier: 1.2, description: 'B1-P0: 低预算+低压，略增空奖' },
        { budget_tier: 'B1', pressure_tier: 'P1', cap_multiplier: 1.0, empty_weight_multiplier: 1.0, description: 'B1-P1: 低预算+中压，正常' },
        { budget_tier: 'B1', pressure_tier: 'P2', cap_multiplier: 0.8, empty_weight_multiplier: 0.8, description: 'B1-P2: 低预算+高压，抑制空奖' },
        // B2 档
        { budget_tier: 'B2', pressure_tier: 'P0', cap_multiplier: 1.0, empty_weight_multiplier: 1.0, description: 'B2-P0: 中预算+低压，正常' },
        { budget_tier: 'B2', pressure_tier: 'P1', cap_multiplier: 1.0, empty_weight_multiplier: 0.9, description: 'B2-P1: 中预算+中压，略抑空奖' },
        { budget_tier: 'B2', pressure_tier: 'P2', cap_multiplier: 0.9, empty_weight_multiplier: 0.7, description: 'B2-P2: 中预算+高压，抑制空奖' },
        // B3 档
        { budget_tier: 'B3', pressure_tier: 'P0', cap_multiplier: 1.0, empty_weight_multiplier: 0.8, description: 'B3-P0: 高预算+低压，抑制空奖' },
        { budget_tier: 'B3', pressure_tier: 'P1', cap_multiplier: 1.0, empty_weight_multiplier: 0.7, description: 'B3-P1: 高预算+中压，显著抑制' },
        { budget_tier: 'B3', pressure_tier: 'P2', cap_multiplier: 1.0, empty_weight_multiplier: 0.6, description: 'B3-P2: 高预算+高压，强烈抑制' }
      ]

      await queryInterface.bulkInsert(
        'lottery_tier_matrix_config',
        matrixData.map((item) => ({
          ...item,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        })),
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 策略配置表创建成功，已插入默认配置数据')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除表（按依赖顺序反向删除）
      await queryInterface.dropTable('lottery_tier_matrix_config', { transaction })
      await queryInterface.dropTable('lottery_strategy_config', { transaction })

      await transaction.commit()
      console.log('✅ 策略配置表删除成功')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}

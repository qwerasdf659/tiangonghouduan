'use strict'

/**
 * Feature Flag 功能开关表迁移
 *
 * 创建 feature_flags 表用于全系统通用的功能开关和灰度发布控制
 *
 * 功能特性：
 * 1. 总开关控制（is_enabled）
 * 2. 灰度发布策略（百分比、用户名单、用户分群、定时发布）
 * 3. 用户白名单/黑名单控制
 * 4. 时间窗口控制（effective_start/effective_end）
 * 5. 降级行为配置
 *
 * @migration 20260121100000-create-feature-flags-table
 * @author Feature Flag 灰度发布模块
 * @since 2026-01-21
 * @see docs/Feature-Flag灰度发布功能实施方案.md
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // =========================================
      // 1. 创建 feature_flags 功能开关表
      // =========================================
      await queryInterface.createTable(
        'feature_flags',
        {
          /**
           * 功能开关ID（自增主键）
           */
          flag_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '功能开关ID（自增主键）'
          },

          /**
           * 功能键名（唯一标识）
           * 命名规范：模块_功能_子功能（如 lottery_pity_system）
           */
          flag_key: {
            type: Sequelize.STRING(100),
            allowNull: false,
            unique: true,
            comment: '功能键名（唯一标识，如 lottery_pity_system）'
          },

          /**
           * 功能名称（显示用）
           */
          flag_name: {
            type: Sequelize.STRING(200),
            allowNull: false,
            comment: '功能名称（显示用）'
          },

          /**
           * 功能描述
           */
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '功能描述（业务含义说明）'
          },

          /**
           * 是否启用（总开关）
           * true: 功能开启（根据策略判断用户是否可用）
           * false: 功能关闭（所有用户不可用）
           */
          is_enabled: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否启用（总开关）'
          },

          /**
           * 发布策略
           * - all: 全量发布（所有用户）
           * - percentage: 百分比灰度（按用户ID哈希）
           * - user_list: 指定用户名单（仅白名单用户）
           * - user_segment: 用户分群（VIP、新用户等）
           * - schedule: 定时发布（仅按时间控制）
           */
          rollout_strategy: {
            type: Sequelize.ENUM('all', 'percentage', 'user_list', 'user_segment', 'schedule'),
            allowNull: false,
            defaultValue: 'all',
            comment: '发布策略（all-全量/percentage-百分比/user_list-名单/user_segment-分群/schedule-定时）'
          },

          /**
           * 开放百分比（0.00-100.00）
           * 仅当 rollout_strategy = 'percentage' 时生效
           */
          rollout_percentage: {
            type: Sequelize.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: 100.0,
            comment: '开放百分比（0.00-100.00，仅百分比策略生效）'
          },

          /**
           * 白名单用户ID列表（JSON数组）
           * 白名单用户优先开放功能，不受百分比限制
           */
          whitelist_user_ids: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '白名单用户ID列表（JSON数组，优先开放）'
          },

          /**
           * 黑名单用户ID列表（JSON数组）
           * 黑名单用户强制关闭功能，优先级最高
           */
          blacklist_user_ids: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '黑名单用户ID列表（JSON数组，强制关闭）'
          },

          /**
           * 目标用户分群（JSON数组）
           * 如 ["vip", "new_user", "merchant"]
           * 用户分群判断逻辑：
           * - vip: users.user_level = 'vip'
           * - merchant: users.user_level = 'merchant'
           * - new_user: 注册时间 < 30天
           * - normal: users.user_level = 'normal'
           */
          target_segments: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '目标用户分群（JSON数组，如 ["vip", "new_user"]）'
          },

          /**
           * 生效开始时间
           * 功能在此时间之后才生效
           */
          effective_start: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '生效开始时间（为空表示立即生效）'
          },

          /**
           * 生效结束时间
           * 功能在此时间之后失效
           */
          effective_end: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '生效结束时间（为空表示永久生效）'
          },

          /**
           * 关联的配置分组
           * 用于关联 lottery_strategy_config 表的 config_group
           */
          related_config_group: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '关联的配置分组（关联 lottery_strategy_config.config_group）'
          },

          /**
           * 降级行为
           * - disabled: 功能完全禁用
           * - default_value: 使用默认值
           * - old_logic: 使用旧逻辑
           */
          fallback_behavior: {
            type: Sequelize.ENUM('disabled', 'default_value', 'old_logic'),
            allowNull: false,
            defaultValue: 'disabled',
            comment: '降级行为（disabled-禁用/default_value-默认值/old_logic-旧逻辑）'
          },

          /**
           * 创建人ID（关联 users.user_id）
           */
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '创建人ID（关联 users.user_id）'
          },

          /**
           * 更新人ID（关联 users.user_id）
           */
          updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '更新人ID（关联 users.user_id）'
          },

          /**
           * 创建时间
           */
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          },

          /**
           * 更新时间
           */
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间'
          }
        },
        {
          transaction,
          comment: '功能开关表（Feature Flag）- 全系统通用灰度发布控制',
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        }
      )

      // =========================================
      // 2. 添加索引
      // =========================================

      // 启用状态索引（快速筛选启用的功能）
      await queryInterface.addIndex('feature_flags', ['is_enabled'], {
        name: 'idx_feature_flags_is_enabled',
        transaction
      })

      // 时间窗口联合索引（定时发布查询）
      await queryInterface.addIndex('feature_flags', ['effective_start', 'effective_end'], {
        name: 'idx_feature_flags_effective_time',
        transaction
      })

      // =========================================
      // 3. 插入初始数据（抽奖策略引擎相关功能开关）
      // =========================================
      await queryInterface.bulkInsert(
        'feature_flags',
        [
          {
            flag_key: 'lottery_pity_system',
            flag_name: 'Pity 软保底机制',
            description: '连续空奖时逐步提升非空奖概率（类似游戏保底），提升用户体验',
            is_enabled: true,
            rollout_strategy: 'all',
            rollout_percentage: 100.0,
            related_config_group: 'pity',
            fallback_behavior: 'disabled',
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            flag_key: 'lottery_luck_debt',
            flag_name: '运气债务机制',
            description: '基于用户历史空奖率的长期平衡调整，确保长期公平性',
            is_enabled: true,
            rollout_strategy: 'all',
            rollout_percentage: 100.0,
            related_config_group: 'luck_debt',
            fallback_behavior: 'disabled',
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            flag_key: 'lottery_anti_empty_streak',
            flag_name: '防连续空奖机制',
            description: '连续K次空奖后强制发放非空奖，避免用户连续失望',
            is_enabled: true,
            rollout_strategy: 'all',
            rollout_percentage: 100.0,
            related_config_group: 'anti_empty',
            fallback_behavior: 'disabled',
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            flag_key: 'lottery_anti_high_streak',
            flag_name: '防连续高价值机制',
            description: '防止短时间内连续获得高价值奖品，控制成本风险',
            is_enabled: true,
            rollout_strategy: 'all',
            rollout_percentage: 100.0,
            related_config_group: 'anti_high',
            fallback_behavior: 'disabled',
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            flag_key: 'lottery_bxpx_matrix',
            flag_name: 'BxPx 矩阵调权',
            description: '根据预算分层和活动压力动态调整权重，智能控制出奖节奏',
            is_enabled: true,
            rollout_strategy: 'all',
            rollout_percentage: 100.0,
            related_config_group: null,
            fallback_behavior: 'disabled',
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            flag_key: 'lottery_budget_tier',
            flag_name: '预算分层控制',
            description: 'B0-B3 四层预算分层机制，根据活动剩余预算调整策略',
            is_enabled: true,
            rollout_strategy: 'all',
            rollout_percentage: 100.0,
            related_config_group: 'budget_tier',
            fallback_behavior: 'disabled',
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            flag_key: 'lottery_pressure_tier',
            flag_name: '活动压力分层',
            description: 'P0-P2 三层活动压力控制，根据抽奖频率调整出奖概率',
            is_enabled: true,
            rollout_strategy: 'all',
            rollout_percentage: 100.0,
            related_config_group: 'pressure_tier',
            fallback_behavior: 'disabled',
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      await transaction.commit()
      console.log('✅ feature_flags 表创建成功，已插入 7 条初始数据')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ feature_flags 表创建失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除表
      await queryInterface.dropTable('feature_flags', { transaction })

      await transaction.commit()
      console.log('✅ feature_flags 表删除成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ feature_flags 表删除失败:', error.message)
      throw error
    }
  }
}


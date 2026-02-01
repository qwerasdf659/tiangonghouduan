/**
 * FeatureFlag 功能开关模型
 *
 * 用于全系统通用的功能开关和灰度发布控制
 *
 * 核心功能：
 * 1. 功能总开关控制（is_enabled）
 * 2. 灰度发布策略（百分比、用户名单、用户分群、定时发布）
 * 3. 用户白名单/黑名单优先级控制
 * 4. 时间窗口自动生效/失效
 * 5. 降级行为配置
 *
 * 表名：feature_flags
 * 主键：flag_id（自增）
 * 业务键：flag_key（唯一标识）
 *
 * @module models/FeatureFlag
 * @author Feature Flag 灰度发布模块
 * @since 2026-01-21
 * @see docs/Feature-Flag灰度发布功能实施方案.md
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const FeatureFlag = sequelize.define(
    'FeatureFlag',
    {
      /**
       * 功能开关ID（自增主键）
       */
      feature_flag_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '功能开关ID（自增主键）'
      },

      /**
       * 功能键名（唯一标识）
       * 命名规范：模块_功能_子功能（如 lottery_pity_system）
       */
      flag_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '功能键名（唯一标识，如 lottery_pity_system）'
      },

      /**
       * 功能名称（显示用）
       */
      flag_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '功能名称（显示用）'
      },

      /**
       * 功能描述
       */
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '功能描述（业务含义说明）'
      },

      /**
       * 是否启用（总开关）
       * true: 功能开启（根据策略判断用户是否可用）
       * false: 功能关闭（所有用户不可用）
       */
      is_enabled: {
        type: DataTypes.BOOLEAN,
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
        type: DataTypes.ENUM('all', 'percentage', 'user_list', 'user_segment', 'schedule'),
        allowNull: false,
        defaultValue: 'all',
        comment:
          '发布策略（all-全量/percentage-百分比/user_list-名单/user_segment-分群/schedule-定时）'
      },

      /**
       * 开放百分比（0.00-100.00）
       * 仅当 rollout_strategy = 'percentage' 时生效
       */
      rollout_percentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 100.0,
        comment: '开放百分比（0.00-100.00，仅百分比策略生效）',
        // eslint-disable-next-line require-jsdoc
        get() {
          // 确保返回数值类型
          const value = this.getDataValue('rollout_percentage')
          return value ? parseFloat(value) : 100.0
        }
      },

      /**
       * 白名单用户ID列表（JSON数组）
       * 白名单用户优先开放功能，不受百分比限制
       */
      whitelist_user_ids: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: '白名单用户ID列表（JSON数组，优先开放）',
        // eslint-disable-next-line require-jsdoc
        get() {
          const value = this.getDataValue('whitelist_user_ids')
          return value || []
        }
      },

      /**
       * 黑名单用户ID列表（JSON数组）
       * 黑名单用户强制关闭功能，优先级最高
       */
      blacklist_user_ids: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: '黑名单用户ID列表（JSON数组，强制关闭）',
        // eslint-disable-next-line require-jsdoc
        get() {
          const value = this.getDataValue('blacklist_user_ids')
          return value || []
        }
      },

      /**
       * 目标用户分群（JSON数组）
       * 如 ["vip", "new_user", "merchant"]
       * 用户分群判断逻辑（基于 users.user_level 字段）：
       * - vip: users.user_level = 'vip'
       * - merchant: users.user_level = 'merchant'
       * - new_user: 注册时间 < 30天
       * - normal: users.user_level = 'normal'
       */
      target_segments: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: '目标用户分群（JSON数组，如 ["vip", "new_user"]）',
        // eslint-disable-next-line require-jsdoc
        get() {
          const value = this.getDataValue('target_segments')
          return value || []
        }
      },

      /**
       * 生效开始时间
       * 功能在此时间之后才生效
       */
      effective_start: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效开始时间（为空表示立即生效）'
      },

      /**
       * 生效结束时间
       * 功能在此时间之后失效
       */
      effective_end: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效结束时间（为空表示永久生效）'
      },

      /**
       * 关联的配置分组
       * 用于关联 lottery_strategy_config 表的 config_group
       */
      related_config_group: {
        type: DataTypes.STRING(50),
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
        type: DataTypes.ENUM('disabled', 'default_value', 'old_logic'),
        allowNull: false,
        defaultValue: 'disabled',
        comment: '降级行为（disabled-禁用/default_value-默认值/old_logic-旧逻辑）'
      },

      /**
       * 创建人ID（关联 users.user_id）
       */
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建人ID（关联 users.user_id）'
      },

      /**
       * 更新人ID（关联 users.user_id）
       */
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '更新人ID（关联 users.user_id）'
      }
    },
    {
      tableName: 'feature_flags',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['flag_key'],
          name: 'uk_feature_flags_flag_key'
        },
        {
          fields: ['is_enabled'],
          name: 'idx_feature_flags_is_enabled'
        },
        {
          fields: ['effective_start', 'effective_end'],
          name: 'idx_feature_flags_effective_time'
        }
      ],
      comment: '功能开关表（Feature Flag）- 全系统通用灰度发布控制'
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - Sequelize 模型集合
   * @returns {void}
   */
  FeatureFlag.associate = function (models) {
    // 创建人关联
    if (models.User) {
      FeatureFlag.belongsTo(models.User, {
        foreignKey: 'created_by',
        as: 'creator',
        constraints: false // 软关联，不创建外键约束
      })

      FeatureFlag.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updater',
        constraints: false
      })
    }
  }

  // ==================== 类方法 ====================

  /**
   * 根据 flag_key 查找功能开关
   *
   * @param {string} flagKey - 功能键名
   * @returns {Promise<FeatureFlag|null>} 功能开关记录
   */
  FeatureFlag.findByKey = function (flagKey) {
    return this.findOne({
      where: { flag_key: flagKey }
    })
  }

  /**
   * 获取所有启用的功能开关
   *
   * @returns {Promise<FeatureFlag[]>} 启用的功能开关列表
   */
  FeatureFlag.findAllEnabled = function () {
    return this.findAll({
      where: { is_enabled: true },
      order: [['flag_key', 'ASC']]
    })
  }

  /**
   * 获取所有功能开关（包含状态）
   *
   * @param {Object} options - 查询选项
   * @param {boolean} [options.is_enabled] - 筛选启用状态
   * @param {string} [options.rollout_strategy] - 筛选发布策略
   * @returns {Promise<FeatureFlag[]>} 功能开关列表
   */
  FeatureFlag.findAllWithFilters = function (options = {}) {
    const where = {}

    if (typeof options.is_enabled === 'boolean') {
      where.is_enabled = options.is_enabled
    }

    if (options.rollout_strategy) {
      where.rollout_strategy = options.rollout_strategy
    }

    return this.findAll({
      where,
      order: [['flag_key', 'ASC']]
    })
  }

  // ==================== 实例方法 ====================

  /**
   * 检查功能开关是否在时间窗口内生效
   *
   * @returns {boolean} 是否在时间窗口内
   */
  FeatureFlag.prototype.isWithinTimeWindow = function () {
    const now = new Date()

    // 检查开始时间
    if (this.effective_start && now < new Date(this.effective_start)) {
      return false
    }

    // 检查结束时间
    if (this.effective_end && now > new Date(this.effective_end)) {
      return false
    }

    return true
  }

  /**
   * 检查用户是否在白名单中
   *
   * @param {number} userId - 用户ID
   * @returns {boolean} 是否在白名单中
   */
  FeatureFlag.prototype.isUserInWhitelist = function (userId) {
    const whitelist = this.whitelist_user_ids || []
    return whitelist.includes(userId)
  }

  /**
   * 检查用户是否在黑名单中
   *
   * @param {number} userId - 用户ID
   * @returns {boolean} 是否在黑名单中
   */
  FeatureFlag.prototype.isUserInBlacklist = function (userId) {
    const blacklist = this.blacklist_user_ids || []
    return blacklist.includes(userId)
  }

  return FeatureFlag
}

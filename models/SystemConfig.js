/**
 * 📋 系统配置模型 - 动态配置管理核心组件
 * 创建时间：2026年01月30日 北京时间
 *
 * 业务职责：
 * - 存储可动态调整的系统配置参数
 * - 支持批量操作的限流配置
 * - 便于运营人员在不修改代码的情况下调整系统行为
 *
 * 技术决策（阶段C核心基础设施）：
 * - 通过 SystemConfigService 提供 Redis 缓存 + 数据库回落
 * - config_value 采用 JSON 格式，支持复杂配置结构
 * - 配置分类管理，支持按类别筛选
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 系统配置模型
 * 业务场景：批量操作限流、功能开关、系统参数调整等
 */
class SystemConfig extends Model {
  /**
   * 模型关联定义
   * @param {Object} _models - 所有模型的引用 (此处未使用，但保留参数以符合规范)
   * @returns {void}
   */
  static associate(_models) {
    // 系统配置表无外键关联，独立存在
  }

  // ==================== 配置分类常量 ====================
  /**
   * 配置分类枚举
   * @readonly
   */
  static get CATEGORIES() {
    return {
      BATCH_OPERATION: 'batch_operation', // 批量操作配置
      RATE_LIMIT: 'rate_limit', // 限流配置
      FEATURE: 'feature', // 功能开关
      GENERAL: 'general' // 通用配置
    }
  }

  /**
   * 配置分类显示名称映射
   * @readonly
   */
  static get CATEGORY_NAMES() {
    return {
      batch_operation: '批量操作配置',
      rate_limit: '限流配置',
      feature: '功能开关',
      general: '通用配置'
    }
  }

  // ==================== 预定义配置键常量 ====================
  /**
   * 批量操作限流配置键
   * @readonly
   */
  static get BATCH_RATE_LIMIT_KEYS() {
    return {
      QUOTA_GRANT: 'batch_rate_limit_quota_grant', // B6: 批量赠送抽奖次数
      PRESET: 'batch_rate_limit_preset', // B7: 批量设置干预规则
      REDEMPTION: 'batch_rate_limit_redemption', // B8: 批量核销确认
      CAMPAIGN_STATUS: 'batch_rate_limit_campaign_status', // B9: 批量活动状态切换
      BUDGET: 'batch_rate_limit_budget', // B10: 批量预算调整
      GLOBAL: 'batch_operation_global' // 全局配置
    }
  }

  // ==================== 实例方法 ====================

  /**
   * 获取分类显示名称
   * @returns {string} 分类中文名称
   */
  getCategoryDisplayName() {
    return SystemConfig.CATEGORY_NAMES[this.config_category] || '未知分类'
  }

  /**
   * 获取配置值（解析 JSON）
   * @returns {Object} 配置值对象
   */
  getValue() {
    if (typeof this.config_value === 'string') {
      try {
        return JSON.parse(this.config_value)
      } catch (e) {
        return this.config_value
      }
    }
    return this.config_value
  }

  /**
   * 获取配置值中的指定属性
   * @param {string} property - 属性名
   * @param {*} defaultValue - 默认值
   * @returns {*} 属性值
   */
  getProperty(property, defaultValue = null) {
    const value = this.getValue()
    if (value && typeof value === 'object') {
      return value[property] !== undefined ? value[property] : defaultValue
    }
    return defaultValue
  }

  /**
   * 判断配置是否启用
   * @returns {boolean} 是否启用
   */
  isEnabled() {
    return this.is_active === true
  }

  /**
   * 更新配置值
   * @param {Object} newValue - 新的配置值对象
   * @param {Object} options - Sequelize 选项（如 transaction）
   * @returns {Promise<SystemConfig>} 更新后的实例
   */
  async updateValue(newValue, options = {}) {
    return await this.update(
      {
        config_value: newValue
      },
      options
    )
  }

  /**
   * 更新配置值中的指定属性（合并更新）
   * @param {Object} partialValue - 部分配置值
   * @param {Object} options - Sequelize 选项（如 transaction）
   * @returns {Promise<SystemConfig>} 更新后的实例
   */
  async mergeValue(partialValue, options = {}) {
    const currentValue = this.getValue()
    const newValue = {
      ...(typeof currentValue === 'object' ? currentValue : {}),
      ...partialValue
    }
    return await this.updateValue(newValue, options)
  }

  /**
   * 启用配置
   * @param {Object} options - Sequelize 选项（如 transaction）
   * @returns {Promise<SystemConfig>} 更新后的实例
   */
  async enable(options = {}) {
    return await this.update({ is_active: true }, options)
  }

  /**
   * 禁用配置
   * @param {Object} options - Sequelize 选项（如 transaction）
   * @returns {Promise<SystemConfig>} 更新后的实例
   */
  async disable(options = {}) {
    return await this.update({ is_active: false }, options)
  }

  // ==================== 静态方法 ====================

  /**
   * 根据配置键获取配置（常用快捷方法）
   * @param {string} config_key - 配置键
   * @param {Object} options - Sequelize 选项
   * @returns {Promise<SystemConfig|null>} 配置记录
   */
  static async getByKey(config_key, options = {}) {
    return await SystemConfig.findOne({
      where: { config_key },
      ...options
    })
  }

  /**
   * 获取配置值（不存在则返回默认值）
   * @param {string} config_key - 配置键
   * @param {*} defaultValue - 默认值
   * @returns {Promise<*>} 配置值
   */
  static async getValue(config_key, defaultValue = null) {
    const config = await SystemConfig.getByKey(config_key)
    if (!config || !config.is_active) {
      return defaultValue
    }
    return config.getValue()
  }

  /**
   * 获取配置值中的指定属性
   * @param {string} config_key - 配置键
   * @param {string} property - 属性名
   * @param {*} defaultValue - 默认值
   * @returns {Promise<*>} 属性值
   */
  static async getProperty(config_key, property, defaultValue = null) {
    const value = await SystemConfig.getValue(config_key)
    if (value && typeof value === 'object') {
      return value[property] !== undefined ? value[property] : defaultValue
    }
    return defaultValue
  }

  /**
   * 获取批量操作限流配置
   * @param {string} operation_type - 操作类型（如 quota_grant_batch）
   * @returns {Promise<Object>} 限流配置
   */
  static async getBatchRateLimitConfig(operation_type) {
    // 映射操作类型到配置键
    const keyMap = {
      quota_grant_batch: SystemConfig.BATCH_RATE_LIMIT_KEYS.QUOTA_GRANT,
      preset_batch: SystemConfig.BATCH_RATE_LIMIT_KEYS.PRESET,
      redemption_verify_batch: SystemConfig.BATCH_RATE_LIMIT_KEYS.REDEMPTION,
      campaign_status_batch: SystemConfig.BATCH_RATE_LIMIT_KEYS.CAMPAIGN_STATUS,
      budget_adjust_batch: SystemConfig.BATCH_RATE_LIMIT_KEYS.BUDGET
    }

    const config_key = keyMap[operation_type]
    if (!config_key) {
      // 返回默认配置
      return {
        max_items_per_request: 50,
        cooldown_seconds: 60
      }
    }

    const config = await SystemConfig.getValue(config_key)
    if (!config) {
      // 返回默认配置
      return {
        max_items_per_request: 50,
        cooldown_seconds: 60
      }
    }

    return {
      max_items_per_request: config.max_items_per_request || 50,
      cooldown_seconds: config.cooldown_seconds || 60
    }
  }

  /**
   * 获取批量操作全局配置
   * @returns {Promise<Object>} 全局配置
   */
  static async getBatchGlobalConfig() {
    const config = await SystemConfig.getValue(SystemConfig.BATCH_RATE_LIMIT_KEYS.GLOBAL)
    if (!config) {
      // 返回默认配置
      return {
        max_concurrent_batches: 3,
        default_retry_count: 3,
        retry_delay_seconds: 5,
        idempotency_key_ttl_hours: 24
      }
    }
    return config
  }

  /**
   * 获取指定分类的所有配置
   * @param {string} category - 配置分类
   * @param {boolean} activeOnly - 是否只返回启用的配置
   * @returns {Promise<Array>} 配置列表
   */
  static async getByCategory(category, activeOnly = true) {
    const where = { config_category: category }
    if (activeOnly) {
      where.is_active = true
    }
    return await SystemConfig.findAll({ where })
  }

  /**
   * 创建或更新配置（upsert）
   * @param {string} config_key - 配置键
   * @param {Object} config_value - 配置值
   * @param {Object} options - 其他选项
   * @param {string} options.description - 配置说明
   * @param {string} options.config_category - 配置分类
   * @param {boolean} options.is_active - 是否启用
   * @param {Object} options.transaction - Sequelize 事务
   * @returns {Promise<[SystemConfig, boolean]>} [配置实例, 是否新创建]
   */
  static async upsert(config_key, config_value, options = {}) {
    const { description, config_category = 'general', is_active = true, transaction } = options

    const [config, created] = await SystemConfig.findOrCreate({
      where: { config_key },
      defaults: {
        config_key,
        config_value,
        description,
        config_category,
        is_active
      },
      transaction
    })

    if (!created) {
      // 更新已存在的配置
      await config.update(
        {
          config_value,
          ...(description && { description }),
          ...(config_category && { config_category }),
          ...(is_active !== undefined && { is_active })
        },
        { transaction }
      )
    }

    return [config, created]
  }
}

/**
 * 模型初始化配置
 * @param {Sequelize} sequelize - Sequelize 实例
 * @returns {SystemConfig} 初始化后的模型
 */
SystemConfig.initModel = sequelize => {
  SystemConfig.init(
    {
      // ==================== 主键 ====================
      config_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '配置ID（主键，自增）'
      },

      // ==================== 配置键值 ====================
      config_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '配置键（唯一，如 batch_rate_limit_quota_grant）'
      },

      config_value: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '配置值JSON（支持复杂配置结构）'
      },

      // ==================== 描述与状态 ====================
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '配置说明（便于运营人员理解配置用途）'
      },

      config_category: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'general',
        comment:
          '配置分类：batch_operation=批量操作 | rate_limit=限流 | feature=功能开关 | general=通用'
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用：true=启用 | false=禁用'
      },

      // ==================== 时间戳 ====================
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间（北京时间）'
      },

      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间（北京时间）'
      }
    },
    {
      sequelize,
      modelName: 'SystemConfig',
      tableName: 'system_configs',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '系统配置表 - 可动态调整的系统参数（阶段C核心基础设施）',

      // 索引定义
      indexes: [
        {
          name: 'idx_system_configs_key',
          unique: true,
          fields: ['config_key'],
          comment: '配置键唯一索引 - 支持快速按键查询'
        },
        {
          name: 'idx_system_configs_category_active',
          fields: ['config_category', 'is_active'],
          comment: '分类+状态索引 - 支持按分类查询启用的配置'
        }
      ],

      // 查询范围定义（Sequelize Scope）
      scopes: {
        // 启用的配置
        active: {
          where: { is_active: true }
        },
        // 禁用的配置
        inactive: {
          where: { is_active: false }
        },
        // 批量操作配置
        batchOperation: {
          where: { config_category: 'batch_operation' }
        },
        // 限流配置
        rateLimit: {
          where: { config_category: 'rate_limit' }
        },
        // 功能开关
        feature: {
          where: { config_category: 'feature' }
        },
        /**
         * 指定分类的配置范围
         * @param {string} category - 配置分类
         * @returns {Object} Sequelize 查询条件
         */
        byCategory(category) {
          return {
            where: { config_category: category }
          }
        }
      }
    }
  )

  return SystemConfig
}

module.exports = SystemConfig

'use strict'

/**
 * LotteryStrategyConfig 模型 - 抽奖策略全局配置表
 *
 * 存储抽奖策略引擎的全局配置参数，包括：
 * - Budget Tier 阈值配置（threshold_high/threshold_mid/threshold_low）
 * - Pressure Tier 阈值配置
 * - Pity 系统配置（enabled/multiplier_table等）
 * - Luck Debt 运气债务配置
 * - Anti-Streak 配置（防连续空奖/防连续高价值）
 *
 * 配置优先级：数据库配置 > 环境变量 > 代码默认值
 *
 * 使用场景：
 * - 运营人员通过后台动态调整策略参数
 * - 定时生效的配置（如活动期间特殊配置）
 * - A/B 测试不同的策略参数
 *
 * @module models/LotteryStrategyConfig
 * @author 抽奖模块策略引擎
 * @since 2026-01-20
 */

const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
  /**
   * 策略配置模型类
   *
   * @class LotteryStrategyConfig
   * @extends Model
   */
  class LotteryStrategyConfig extends Model {
    /**
     * 定义模型关联关系
     *
     * @param {Object} models - 所有已加载的模型
     * @returns {void}
     */
    static associate(models) {
      /* 创建人关联 */
      if (models.User) {
        LotteryStrategyConfig.belongsTo(models.User, {
          as: 'creator',
          foreignKey: 'created_by'
        })

        /* 更新人关联 */
        LotteryStrategyConfig.belongsTo(models.User, {
          as: 'updater',
          foreignKey: 'updated_by'
        })
      }
    }

    /* ========== 静态查询方法 ========== */

    /**
     * 获取指定分组的所有有效配置
     *
     * @param {string} config_group - 配置分组（budget_tier/pressure_tier/pity等）
     * @returns {Promise<Object>} 配置键值对象
     *
     * @example
     * const budgetConfig = await LotteryStrategyConfig.getConfigByGroup('budget_tier')
     * // 返回: { threshold_high: 1000, threshold_mid: 500, threshold_low: 100 }
     */
    static async getConfigByGroup(config_group) {
      const configs = await this.findAll({
        where: {
          config_group,
          is_active: true
        },
        order: [['priority', 'DESC']] // 优先级高的排前面
      })

      // 转换为键值对象（同一key取优先级最高的）
      const result = {}
      const processedKeys = new Set()

      for (const config of configs) {
        if (!processedKeys.has(config.config_key)) {
          result[config.config_key] = config.getParsedValue()
          processedKeys.add(config.config_key)
        }
      }

      return result
    }

    /**
     * 获取单个配置值
     *
     * @param {string} config_group - 配置分组
     * @param {string} config_key - 配置键名
     * @param {*} default_value - 默认值（配置不存在时返回）
     * @returns {Promise<*>} 配置值
     */
    static async getConfigValue(config_group, config_key, default_value = null) {
      const config = await this.findOne({
        where: {
          config_group,
          config_key,
          is_active: true
        },
        order: [['priority', 'DESC']]
      })

      return config ? config.getParsedValue() : default_value
    }

    /**
     * 获取所有分组的完整配置
     *
     * @returns {Promise<Object>} 按分组组织的配置对象
     *
     * @example
     * const allConfig = await LotteryStrategyConfig.getAllConfig()
     * // 返回: {
     * //   budget_tier: { threshold_high: 1000, ... },
     * //   pity: { enabled: true, ... },
     * //   ...
     * // }
     */
    static async getAllConfig() {
      const configs = await this.findAll({
        where: { is_active: true },
        order: [
          ['config_group', 'ASC'],
          ['priority', 'DESC']
        ]
      })

      const result = {}
      const processedKeys = {}

      for (const config of configs) {
        const group = config.config_group
        const key = config.config_key
        const groupKey = `${group}:${key}`

        if (!result[group]) {
          result[group] = {}
        }

        // 同一分组同一key取优先级最高的
        if (!processedKeys[groupKey]) {
          result[group][key] = config.getParsedValue()
          processedKeys[groupKey] = true
        }
      }

      return result
    }

    /**
     * 更新或创建配置项
     *
     * @param {string} config_group - 配置分组
     * @param {string} config_key - 配置键名
     * @param {*} config_value - 配置值
     * @param {Object} options - 额外选项
     * @param {string} options.description - 配置描述
     * @param {number} options.priority - 优先级
     * @param {number} options.updated_by - 更新人ID
     * @param {Object} options.transaction - 事务对象
     * @returns {Promise<LotteryStrategyConfig>} 配置实例
     */
    static async upsertConfig(config_group, config_key, config_value, options = {}) {
      const { description, priority = 0, updated_by, transaction } = options

      // 确定值类型
      const value_type = LotteryStrategyConfig.detectValueType(config_value)

      const [config, created] = await this.findOrCreate({
        where: {
          config_group,
          config_key,
          priority
        },
        defaults: {
          config_value: JSON.stringify(config_value),
          value_type,
          description,
          is_active: true,
          created_by: updated_by,
          updated_by
        },
        transaction
      })

      if (!created) {
        await config.update(
          {
            config_value: JSON.stringify(config_value),
            value_type,
            description: description || config.description,
            updated_by
          },
          { transaction }
        )
      }

      return config
    }

    /**
     * 检测配置值的类型
     *
     * @param {*} value - 配置值
     * @returns {string} 值类型（number/boolean/string/array/object）
     */
    static detectValueType(value) {
      if (typeof value === 'number') return 'number'
      if (typeof value === 'boolean') return 'boolean'
      if (typeof value === 'string') return 'string'
      if (Array.isArray(value)) return 'array'
      if (typeof value === 'object' && value !== null) return 'object'
      return 'string'
    }

    /* ========== 实例方法 ========== */

    /**
     * 获取解析后的配置值
     *
     * @returns {*} 根据 value_type 解析后的值
     */
    getParsedValue() {
      const raw = this.config_value

      // JSON 字段已自动解析，但需要根据 value_type 转换
      switch (this.value_type) {
        case 'number':
          return typeof raw === 'number' ? raw : parseFloat(raw)
        case 'boolean':
          return typeof raw === 'boolean' ? raw : raw === true || raw === 'true'
        case 'string':
          return String(raw)
        case 'array':
          return Array.isArray(raw) ? raw : JSON.parse(raw)
        case 'object':
          return typeof raw === 'object' ? raw : JSON.parse(raw)
        default:
          return raw
      }
    }

    /**
     * 检查配置是否在有效期内
     *
     * @returns {boolean} 是否有效
     */
    isEffective() {
      if (!this.is_active) return false

      const now = new Date()

      if (this.effective_start && now < new Date(this.effective_start)) {
        return false
      }

      if (this.effective_end && now > new Date(this.effective_end)) {
        return false
      }

      return true
    }
  }

  /* ========== 模型初始化 ========== */

  LotteryStrategyConfig.init(
    {
      /**
       * 配置ID（自增主键）
       */
      strategy_config_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '策略配置ID'
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
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '配置分组'
      },

      /**
       * 配置键名（如 threshold_high, enabled 等）
       */
      config_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '配置键名'
      },

      /**
       * 配置值（JSON格式）
       */
      config_value: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '配置值（JSON格式）'
      },

      /**
       * 配置值类型
       */
      value_type: {
        type: DataTypes.ENUM('number', 'boolean', 'string', 'array', 'object'),
        allowNull: false,
        defaultValue: 'number',
        comment: '配置值类型'
      },

      /**
       * 配置描述
       */
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '配置描述'
      },

      /**
       * 是否启用
       */
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
      },

      /**
       * 配置优先级（数值越大优先级越高）
       */
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '配置优先级'
      },

      /**
       * 生效开始时间
       */
      effective_start: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效开始时间'
      },

      /**
       * 生效结束时间
       */
      effective_end: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效结束时间'
      },

      /**
       * 创建人ID
       */
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建人ID'
      },

      /**
       * 更新人ID
       */
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '更新人ID'
      }
    },
    {
      sequelize,
      modelName: 'LotteryStrategyConfig',
      tableName: 'lottery_strategy_config',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '抽奖策略全局配置表',
      indexes: [
        {
          unique: true,
          fields: ['config_group', 'config_key', 'priority'],
          name: 'uk_strategy_config_group_key_priority'
        },
        {
          fields: ['config_group', 'is_active'],
          name: 'idx_strategy_config_group_active'
        }
      ]
    }
  )

  return LotteryStrategyConfig
}

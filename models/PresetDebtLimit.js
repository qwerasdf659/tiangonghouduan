/**
 * 📋 预设欠账上限配置模型 - 统一抽奖架构核心组件
 *
 * 业务职责：
 * - 配置各级别的最大可容忍欠账额度
 * - 控制系统垫付的风险边界
 * - 防止无限制的欠账积累
 *
 * 核心规则（DR-03）：
 * - 支持三级配置：global（全局）、campaign（活动）、prize（奖品）
 * - 超过上限时预设发放将失败
 * - 默认值允许一定的风险容忍度
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 预设欠账上限配置模型
 * 业务场景：风险控制和系统保护
 */
class PresetDebtLimit extends Model {
  /**
   * 模型关联定义
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
    // 多对一：创建人
    PresetDebtLimit.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator',
      onDelete: 'SET NULL',
      comment: '创建人'
    })

    // 多对一：更新人
    PresetDebtLimit.belongsTo(models.User, {
      foreignKey: 'updated_by',
      as: 'updater',
      onDelete: 'SET NULL',
      comment: '更新人'
    })
  }

  /**
   * 获取限制级别显示名称
   * @returns {string} 级别中文名称
   */
  getLimitLevelName() {
    const levelNames = {
      global: '全局',
      campaign: '活动',
      prize: '奖品'
    }
    return levelNames[this.limit_level] || '未知级别'
  }

  /**
   * 检查库存欠账是否超限
   * @param {number} currentDebt - 当前库存欠账数量
   * @param {number} additionalDebt - 即将增加的欠账数量
   * @returns {Object} 检查结果
   */
  checkInventoryDebtLimit(currentDebt, additionalDebt = 1) {
    const totalDebt = currentDebt + additionalDebt
    const isExceeded = totalDebt > this.inventory_debt_limit

    return {
      is_exceeded: isExceeded,
      current_debt: currentDebt,
      additional_debt: additionalDebt,
      total_after_add: totalDebt,
      max_allowed: this.inventory_debt_limit,
      remaining: Math.max(0, this.inventory_debt_limit - currentDebt),
      message: isExceeded
        ? `库存欠账将超限：${totalDebt} > ${this.inventory_debt_limit}`
        : '库存欠账在允许范围内'
    }
  }

  /**
   * 检查预算欠账是否超限
   * @param {number} currentDebt - 当前预算欠账金额
   * @param {number} additionalDebt - 即将增加的欠账金额
   * @returns {Object} 检查结果
   */
  checkBudgetDebtLimit(currentDebt, additionalDebt) {
    const totalDebt = currentDebt + additionalDebt
    const isExceeded = totalDebt > this.budget_debt_limit

    return {
      is_exceeded: isExceeded,
      current_debt: currentDebt,
      additional_debt: additionalDebt,
      total_after_add: totalDebt,
      max_allowed: this.budget_debt_limit,
      remaining: Math.max(0, this.budget_debt_limit - currentDebt),
      message: isExceeded
        ? `预算欠账将超限：${totalDebt} > ${this.budget_debt_limit}`
        : '预算欠账在允许范围内'
    }
  }

  /**
   * 获取欠账上限摘要
   * @returns {Object} 上限配置摘要
   */
  toSummary() {
    return {
      preset_debt_limit_id: this.preset_debt_limit_id,
      limit_level: this.limit_level,
      limit_level_name: this.getLimitLevelName(),
      reference_id: this.reference_id,
      inventory_debt_limit: this.inventory_debt_limit,
      budget_debt_limit: this.budget_debt_limit,
      status: this.status,
      description: this.description,
      created_at: this.created_at,
      updated_at: this.updated_at
    }
  }

  /**
   * 获取或创建全局欠账上限配置
   * @param {Object} options - 查询选项
   * @returns {Promise<PresetDebtLimit>} 全局欠账上限配置
   */
  static async getOrCreateGlobal(options = {}) {
    const { transaction, defaults = {} } = options

    const [limit, created] = await this.findOrCreate({
      where: { limit_level: 'global', reference_id: null },
      defaults: {
        limit_level: 'global',
        reference_id: null,
        inventory_debt_limit: defaults.inventory_debt_limit || 1000,
        budget_debt_limit: defaults.budget_debt_limit || 1000000,
        status: 'active',
        description: '全局欠账上限配置',
        ...defaults
      },
      transaction
    })

    if (created) {
      console.log('[PresetDebtLimit] 创建全局欠账上限配置')
    }

    return limit
  }

  /**
   * 获取或创建活动欠账上限配置
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @returns {Promise<PresetDebtLimit>} 活动欠账上限配置
   */
  static async getOrCreateForCampaign(campaignId, options = {}) {
    const { transaction, defaults = {} } = options

    const [limit, created] = await this.findOrCreate({
      where: { limit_level: 'campaign', reference_id: campaignId },
      defaults: {
        limit_level: 'campaign',
        reference_id: campaignId,
        inventory_debt_limit: defaults.inventory_debt_limit || 100,
        budget_debt_limit: defaults.budget_debt_limit || 100000,
        status: 'active',
        description: `活动 ${campaignId} 欠账上限配置`,
        ...defaults
      },
      transaction
    })

    if (created) {
      console.log(`[PresetDebtLimit] 为活动 ${campaignId} 创建欠账上限配置`)
    }

    return limit
  }

  /**
   * 获取或创建奖品欠账上限配置
   * @param {number} prizeId - 奖品ID
   * @param {Object} options - 查询选项
   * @returns {Promise<PresetDebtLimit>} 奖品欠账上限配置
   */
  static async getOrCreateForPrize(prizeId, options = {}) {
    const { transaction, defaults = {} } = options

    const [limit, created] = await this.findOrCreate({
      where: { limit_level: 'prize', reference_id: prizeId },
      defaults: {
        limit_level: 'prize',
        reference_id: prizeId,
        inventory_debt_limit: defaults.inventory_debt_limit || 50,
        budget_debt_limit: defaults.budget_debt_limit || 50000,
        status: 'active',
        description: `奖品 ${prizeId} 欠账上限配置`,
        ...defaults
      },
      transaction
    })

    if (created) {
      console.log(`[PresetDebtLimit] 为奖品 ${prizeId} 创建欠账上限配置`)
    }

    return limit
  }

  /**
   * 获取有效的欠账上限配置（按优先级：prize > campaign > global）
   * @param {Object} context - 上下文 {campaignId, prizeId}
   * @param {Object} options - 查询选项
   * @returns {Promise<PresetDebtLimit>} 有效的欠账上限配置
   */
  static async getEffectiveLimit(context, options = {}) {
    const { campaignId, prizeId } = context
    const { transaction } = options

    // 按优先级查找：prize > campaign > global
    const levels = []
    if (prizeId) {
      levels.push({ limit_level: 'prize', reference_id: prizeId })
    }
    if (campaignId) {
      levels.push({ limit_level: 'campaign', reference_id: campaignId })
    }
    levels.push({ limit_level: 'global', reference_id: null })

    for (const condition of levels) {
      // eslint-disable-next-line no-await-in-loop -- 按优先级顺序查找，找到第一个即返回，无法并行化
      const limit = await this.findOne({
        where: { ...condition, status: 'active' },
        transaction
      })
      if (limit) {
        return limit
      }
    }

    // 如果没有任何配置，创建全局默认配置
    return this.getOrCreateGlobal({ transaction })
  }

  /**
   * 检查欠账是否接近上限（用于告警）
   * @param {Object} context - 上下文 {campaignId, prizeId}
   * @param {Object} currentDebts - 当前欠账统计 {inventory: number, budget: number}
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 告警检查结果
   */
  static async checkAlertThreshold(context, currentDebts, options = {}) {
    const { transaction } = options

    const limit = await this.getEffectiveLimit(context, { transaction })
    const alertThreshold = 0.8 // 80% 告警阈值

    const inventoryUsage = currentDebts.inventory / limit.inventory_debt_limit
    const budgetUsage = currentDebts.budget / limit.budget_debt_limit

    const needsInventoryAlert = inventoryUsage >= alertThreshold
    const needsBudgetAlert = budgetUsage >= alertThreshold

    return {
      needs_alert: needsInventoryAlert || needsBudgetAlert,
      limit_config: limit.toSummary(),
      inventory: {
        current: currentDebts.inventory,
        limit: limit.inventory_debt_limit,
        usage_percent: Math.round(inventoryUsage * 100),
        needs_alert: needsInventoryAlert,
        remaining: limit.inventory_debt_limit - currentDebts.inventory
      },
      budget: {
        current: currentDebts.budget,
        limit: limit.budget_debt_limit,
        usage_percent: Math.round(budgetUsage * 100),
        needs_alert: needsBudgetAlert,
        remaining: limit.budget_debt_limit - currentDebts.budget
      },
      alert_threshold_percent: Math.round(alertThreshold * 100)
    }
  }
}

/**
 * 模型初始化
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {PresetDebtLimit} 初始化后的模型
 */
module.exports = sequelize => {
  PresetDebtLimit.init(
    {
      /**
       * 配置ID - 主键
       */
      preset_debt_limit_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '欠账上限配置主键ID'
      },

      /**
       * 限制级别
       * - global: 全局配置
       * - campaign: 活动级配置
       * - prize: 奖品级配置
       */
      limit_level: {
        type: DataTypes.ENUM('global', 'campaign', 'prize'),
        allowNull: false,
        comment: '限制级别：global-全局, campaign-活动, prize-奖品'
      },

      /**
       * 关联ID（根据level不同含义不同）
       */
      reference_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment:
          '关联ID：campaign级别为lottery_campaign_id，prize级别为lottery_prize_id，global级别为null'
      },

      /**
       * 库存欠账上限
       */
      inventory_debt_limit: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 100,
        comment: '库存欠账上限数量'
      },

      /**
       * 预算欠账上限
       */
      budget_debt_limit: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 100000,
        comment: '预算欠账上限金额（整数分值）'
      },

      /**
       * 状态
       * - active: 启用
       * - inactive: 停用
       */
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '配置状态：active-启用, inactive-停用'
      },

      /**
       * 配置说明
       */
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '配置说明'
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
      },

      /**
       * 创建时间
       */
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
      },

      /**
       * 更新时间
       */
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间'
      }
    },
    {
      sequelize,
      modelName: 'PresetDebtLimit',
      tableName: 'preset_debt_limits',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '欠账上限配置表 - 配置各级别的欠账上限，防止系统风险',
      indexes: [
        // 唯一索引：限制级别+关联ID
        {
          fields: ['limit_level', 'reference_id'],
          name: 'uk_debt_limit_level_ref',
          unique: true
        },
        // 状态索引
        {
          fields: ['status'],
          name: 'idx_debt_limit_status'
        }
      ]
    }
  )

  return PresetDebtLimit
}

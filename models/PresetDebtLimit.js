/**
 * 📋 预设欠账上限配置模型 - 统一抽奖架构核心组件
 * 创建时间：2026年01月18日 北京时间
 *
 * 业务职责：
 * - 配置活动的最大可容忍欠账额度
 * - 控制系统垫付的风险边界
 * - 防止无限制的欠账积累
 *
 * 核心规则（DR-03）：
 * - 每个活动可配置库存欠账上限
 * - 每个活动可配置预算欠账上限
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
    // 一对一：配置属于某个活动
    PresetDebtLimit.belongsTo(models.LotteryCampaign, {
      foreignKey: 'campaign_id',
      as: 'campaign',
      onDelete: 'CASCADE',
      comment: '所属活动'
    })
  }

  /**
   * 检查库存欠账是否超限
   * @param {number} currentDebt - 当前库存欠账数量
   * @param {number} additionalDebt - 即将增加的欠账数量
   * @returns {Object} 检查结果
   */
  checkInventoryDebtLimit(currentDebt, additionalDebt = 1) {
    const totalDebt = currentDebt + additionalDebt
    const isExceeded = totalDebt > this.max_inventory_debt

    return {
      is_exceeded: isExceeded,
      current_debt: currentDebt,
      additional_debt: additionalDebt,
      total_after_add: totalDebt,
      max_allowed: this.max_inventory_debt,
      remaining: Math.max(0, this.max_inventory_debt - currentDebt),
      message: isExceeded
        ? `库存欠账将超限：${totalDebt} > ${this.max_inventory_debt}`
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
    const isExceeded = totalDebt > this.max_budget_debt

    return {
      is_exceeded: isExceeded,
      current_debt: currentDebt,
      additional_debt: additionalDebt,
      total_after_add: totalDebt,
      max_allowed: this.max_budget_debt,
      remaining: Math.max(0, this.max_budget_debt - currentDebt),
      message: isExceeded
        ? `预算欠账将超限：${totalDebt} > ${this.max_budget_debt}`
        : '预算欠账在允许范围内'
    }
  }

  /**
   * 获取欠账上限摘要
   * @returns {Object} 上限配置摘要
   */
  toSummary() {
    return {
      limit_id: this.limit_id,
      campaign_id: this.campaign_id,
      max_inventory_debt: this.max_inventory_debt,
      max_budget_debt: this.max_budget_debt,
      alert_threshold_percent: this.alert_threshold_percent,
      status: this.status,
      created_at: this.created_at,
      updated_at: this.updated_at
    }
  }

  /**
   * 获取或创建活动的欠账上限配置
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @returns {Promise<PresetDebtLimit>} 欠账上限配置
   */
  static async getOrCreateForCampaign(campaignId, options = {}) {
    const { transaction, defaults = {} } = options

    const [limit, created] = await this.findOrCreate({
      where: { campaign_id: campaignId },
      defaults: {
        campaign_id: campaignId,
        max_inventory_debt: defaults.max_inventory_debt || 100,
        max_budget_debt: defaults.max_budget_debt || 100000,
        alert_threshold_percent: defaults.alert_threshold_percent || 80,
        status: 'active',
        ...defaults
      },
      transaction
    })

    if (created) {
      console.log(`[PresetDebtLimit] 为活动 ${campaignId} 创建默认欠账上限配置`)
    }

    return limit
  }

  /**
   * 检查活动的欠账是否接近上限（用于告警）
   * @param {number} campaignId - 活动ID
   * @param {Object} currentDebts - 当前欠账统计 {inventory: number, budget: number}
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 告警检查结果
   */
  static async checkAlertThreshold(campaignId, currentDebts, options = {}) {
    const { transaction } = options

    const limit = await this.findOne({
      where: { campaign_id: campaignId, status: 'active' },
      transaction
    })

    if (!limit) {
      return {
        needs_alert: false,
        message: '未找到欠账上限配置'
      }
    }

    const inventoryPercent = (currentDebts.inventory / limit.max_inventory_debt) * 100
    const budgetPercent = (currentDebts.budget / limit.max_budget_debt) * 100

    const alerts = []

    if (inventoryPercent >= limit.alert_threshold_percent) {
      alerts.push({
        type: 'inventory',
        current: currentDebts.inventory,
        max: limit.max_inventory_debt,
        percent: inventoryPercent.toFixed(2),
        message: `库存欠账已达${inventoryPercent.toFixed(2)}%`
      })
    }

    if (budgetPercent >= limit.alert_threshold_percent) {
      alerts.push({
        type: 'budget',
        current: currentDebts.budget,
        max: limit.max_budget_debt,
        percent: budgetPercent.toFixed(2),
        message: `预算欠账已达${budgetPercent.toFixed(2)}%`
      })
    }

    return {
      needs_alert: alerts.length > 0,
      alerts,
      threshold_percent: limit.alert_threshold_percent
    }
  }

  /**
   * 批量检查所有活动的欠账告警状态
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 需要告警的活动列表
   */
  static async checkAllCampaignAlerts(options = {}) {
    const { transaction } = options

    // 获取所有启用的欠账上限配置
    const limits = await this.findAll({
      where: { status: 'active' },
      transaction
    })

    const alertCampaigns = []

    for (const limit of limits) {
      /*
       * 这里需要结合其他服务获取当前欠账数据
       * 此处仅返回配置信息，实际告警检查需要在服务层完成
       */
      alertCampaigns.push({
        campaign_id: limit.campaign_id,
        max_inventory_debt: limit.max_inventory_debt,
        max_budget_debt: limit.max_budget_debt,
        alert_threshold_percent: limit.alert_threshold_percent
      })
    }

    return alertCampaigns
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
      limit_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '欠账上限配置主键ID'
      },

      /**
       * 活动ID（唯一）
       */
      campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        comment: '活动ID（外键关联lottery_campaigns.campaign_id，唯一约束）'
      },

      /**
       * 最大库存欠账数量
       */
      max_inventory_debt: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
        comment: '最大库存欠账数量（超过此值预设发放将失败）'
      },

      /**
       * 最大预算欠账金额
       */
      max_budget_debt: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100000,
        comment: '最大预算欠账金额（超过此值预设发放将失败）'
      },

      /**
       * 告警阈值百分比
       */
      alert_threshold_percent: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 80,
        comment: '告警阈值百分比（欠账达到此百分比时触发告警）'
      },

      /**
       * 配置状态
       */
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '配置状态：active=启用, inactive=停用'
      },

      /**
       * 创建人ID
       */
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建人ID（管理员user_id）'
      },

      /**
       * 更新人ID
       */
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '更新人ID（管理员user_id）'
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
      comment: '预设欠账上限配置表 - 配置活动的最大可容忍欠账额度',
      indexes: [
        // 唯一索引：一个活动只能有一个欠账上限配置
        {
          fields: ['campaign_id'],
          unique: true,
          name: 'uk_debt_limits_campaign'
        },
        // 查询索引：按状态查询
        {
          fields: ['status'],
          name: 'idx_debt_limits_status'
        }
      ]
    }
  )

  return PresetDebtLimit
}

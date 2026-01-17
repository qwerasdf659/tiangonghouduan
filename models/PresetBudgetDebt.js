/**
 * 📋 预设预算欠账模型 - 统一抽奖架构核心组件
 * 创建时间：2026年01月18日 北京时间
 *
 * 业务职责：
 * - 记录预设发放时因预算不足产生的欠账
 * - 管理系统垫付的预算偿还
 * - 支持预算充值后的债务清偿
 *
 * 核心规则（DR-02）：
 * - 预设发放不可驳回，即使预算不足也要先发放
 * - 产生的欠账需要运营人员在后台充值偿还
 * - 欠账存在期间不影响活动状态
 *
 * 预算来源（DR-05）：
 * - user：用户个人预算账户欠账
 * - pool：活动池预算欠账
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 预设预算欠账模型
 * 业务场景：管理预设发放产生的预算负债
 */
class PresetBudgetDebt extends Model {
  /**
   * 模型关联定义
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
    // 多对一：欠账属于某个活动
    PresetBudgetDebt.belongsTo(models.LotteryCampaign, {
      foreignKey: 'campaign_id',
      as: 'campaign',
      onDelete: 'RESTRICT',
      comment: '所属活动（禁止删除有欠账的活动）'
    })

    // 多对一：欠账关联某个用户（如果是用户预算）
    PresetBudgetDebt.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'RESTRICT',
      comment: '欠账用户（如果是用户预算欠账）'
    })

    // 多对一：欠账由某次抽奖产生
    PresetBudgetDebt.belongsTo(models.LotteryDraw, {
      foreignKey: 'draw_id',
      targetKey: 'draw_id',
      as: 'draw',
      onDelete: 'SET NULL',
      comment: '产生欠账的抽奖记录'
    })

    // 多对一：欠账由某个预设产生
    PresetBudgetDebt.belongsTo(models.LotteryPreset, {
      foreignKey: 'preset_id',
      targetKey: 'preset_id',
      as: 'preset',
      onDelete: 'SET NULL',
      comment: '产生欠账的预设'
    })
  }

  /**
   * 获取欠账状态显示名称
   * @returns {string} 状态中文名称
   */
  getStatusName() {
    const statusNames = {
      pending: '待偿还',
      repaying: '偿还中',
      repaid: '已偿还',
      cancelled: '已取消'
    }
    return statusNames[this.debt_status] || '未知状态'
  }

  /**
   * 获取预算来源显示名称
   * @returns {string} 预算来源中文名称
   */
  getBudgetSourceName() {
    const sourceNames = {
      user: '用户预算',
      pool: '活动池预算'
    }
    return sourceNames[this.budget_source] || '未知来源'
  }

  /**
   * 检查是否可以偿还
   * @returns {boolean} 是否可偿还
   */
  canRepay() {
    return this.debt_status === 'pending' || this.debt_status === 'repaying'
  }

  /**
   * 计算剩余欠账金额
   * @returns {number} 剩余欠账金额
   */
  getRemainingDebt() {
    return this.debt_amount - this.repaid_amount
  }

  /**
   * 偿还欠账
   * @param {number} amount - 偿还金额
   * @param {number} repaidBy - 偿还人ID
   * @param {Object} options - 事务选项
   * @returns {Promise<boolean>} 是否完全偿还
   */
  async repay(amount, repaidBy, options = {}) {
    const { transaction } = options
    const remaining = this.getRemainingDebt()

    if (amount <= 0) {
      throw new Error('偿还金额必须大于0')
    }

    if (amount > remaining) {
      throw new Error(`偿还金额(${amount})超过剩余欠账(${remaining})`)
    }

    const newRepaidAmount = this.repaid_amount + amount
    const isFullyRepaid = newRepaidAmount >= this.debt_amount

    await this.update(
      {
        repaid_amount: newRepaidAmount,
        debt_status: isFullyRepaid ? 'repaid' : 'repaying',
        repaid_at: isFullyRepaid ? new Date() : null,
        repaid_by: repaidBy
      },
      { transaction }
    )

    return isFullyRepaid
  }

  /**
   * 获取欠账摘要
   * @returns {Object} 欠账摘要对象
   */
  toSummary() {
    return {
      debt_id: this.debt_id,
      campaign_id: this.campaign_id,
      user_id: this.user_id,
      budget_source: this.budget_source,
      budget_source_name: this.getBudgetSourceName(),
      debt_amount: this.debt_amount,
      repaid_amount: this.repaid_amount,
      remaining_amount: this.getRemainingDebt(),
      debt_status: this.debt_status,
      status_name: this.getStatusName(),
      can_repay: this.canRepay(),
      created_at: this.created_at,
      repaid_at: this.repaid_at
    }
  }

  /**
   * 按活动统计预算欠账
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 统计结果
   */
  static async getDebtStatsByCampaign(campaignId, options = {}) {
    const { transaction } = options
    const { Op, fn, col } = require('sequelize')

    const result = await this.findOne({
      attributes: [
        [fn('COUNT', col('debt_id')), 'total_debts'],
        [fn('SUM', col('debt_amount')), 'total_debt_amount'],
        [fn('SUM', col('repaid_amount')), 'total_repaid_amount']
      ],
      where: {
        campaign_id: campaignId,
        debt_status: {
          [Op.in]: ['pending', 'repaying']
        }
      },
      raw: true,
      transaction
    })

    return {
      total_debts: parseInt(result.total_debts) || 0,
      total_debt_amount: parseInt(result.total_debt_amount) || 0,
      total_repaid_amount: parseInt(result.total_repaid_amount) || 0,
      remaining_debt_amount:
        (parseInt(result.total_debt_amount) || 0) -
        (parseInt(result.total_repaid_amount) || 0)
    }
  }

  /**
   * 按用户统计预算欠账
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 统计结果
   */
  static async getDebtStatsByUser(userId, options = {}) {
    const { transaction } = options
    const { Op, fn, col } = require('sequelize')

    const result = await this.findOne({
      attributes: [
        [fn('COUNT', col('debt_id')), 'total_debts'],
        [fn('SUM', col('debt_amount')), 'total_debt_amount'],
        [fn('SUM', col('repaid_amount')), 'total_repaid_amount']
      ],
      where: {
        user_id: userId,
        budget_source: 'user',
        debt_status: {
          [Op.in]: ['pending', 'repaying']
        }
      },
      raw: true,
      transaction
    })

    return {
      total_debts: parseInt(result.total_debts) || 0,
      total_debt_amount: parseInt(result.total_debt_amount) || 0,
      total_repaid_amount: parseInt(result.total_repaid_amount) || 0,
      remaining_debt_amount:
        (parseInt(result.total_debt_amount) || 0) -
        (parseInt(result.total_repaid_amount) || 0)
    }
  }

  /**
   * 查询未偿还的欠账列表
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 未偿还欠账列表
   */
  static async findPendingDebts(options = {}) {
    const { campaignId, userId, budgetSource, limit = 100, transaction } = options
    const { Op } = require('sequelize')

    const where = {
      debt_status: {
        [Op.in]: ['pending', 'repaying']
      }
    }

    if (campaignId) {
      where.campaign_id = campaignId
    }

    if (userId) {
      where.user_id = userId
    }

    if (budgetSource) {
      where.budget_source = budgetSource
    }

    return this.findAll({
      where,
      order: [['created_at', 'ASC']],
      limit,
      transaction
    })
  }

  /**
   * 按预算来源分组统计欠账
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 按预算来源分组的统计结果
   */
  static async getDebtsBySource(campaignId, options = {}) {
    const { transaction } = options
    const { Op, fn, col } = require('sequelize')

    return this.findAll({
      attributes: [
        'budget_source',
        [fn('SUM', col('debt_amount')), 'total_debt'],
        [fn('SUM', col('repaid_amount')), 'total_repaid'],
        [fn('COUNT', col('debt_id')), 'debt_count']
      ],
      where: {
        campaign_id: campaignId,
        debt_status: {
          [Op.in]: ['pending', 'repaying']
        }
      },
      group: ['budget_source'],
      transaction
    })
  }
}

/**
 * 模型初始化
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {PresetBudgetDebt} 初始化后的模型
 */
module.exports = sequelize => {
  PresetBudgetDebt.init(
    {
      /**
       * 欠账记录ID - 主键
       */
      debt_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '预算欠账主键ID'
      },

      /**
       * 活动ID
       */
      campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '活动ID（外键关联lottery_campaigns.campaign_id）'
      },

      /**
       * 用户ID（用户预算欠账时必填）
       */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '用户ID（budget_source=user时必填）'
      },

      /**
       * 预算来源
       */
      budget_source: {
        type: DataTypes.ENUM('user', 'pool'),
        allowNull: false,
        comment: '预算来源：user=用户预算欠账, pool=活动池预算欠账'
      },

      /**
       * 欠账金额
       */
      debt_amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '欠账金额（系统垫付的预算金额）'
      },

      /**
       * 已偿还金额
       */
      repaid_amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '已偿还金额'
      },

      /**
       * 欠账状态
       */
      debt_status: {
        type: DataTypes.ENUM('pending', 'repaying', 'repaid', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '欠账状态：pending=待偿还, repaying=偿还中, repaid=已偿还, cancelled=已取消'
      },

      /**
       * 产生欠账的预设ID
       */
      preset_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '产生欠账的预设ID（外键关联lottery_presets.preset_id）'
      },

      /**
       * 产生欠账的抽奖记录ID
       */
      draw_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '产生欠账的抽奖记录ID（外键关联lottery_draws.draw_id）'
      },

      /**
       * 偿还人ID
       */
      repaid_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '偿还人ID（管理员user_id）'
      },

      /**
       * 偿还时间
       */
      repaid_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '完全偿还时间'
      },

      /**
       * 创建时间
       */
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '欠账产生时间'
      },

      /**
       * 更新时间
       */
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '最后更新时间'
      }
    },
    {
      sequelize,
      modelName: 'PresetBudgetDebt',
      tableName: 'preset_budget_debt',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '预设预算欠账表 - 记录预设发放产生的预算欠账',
      indexes: [
        // 查询索引：按活动和状态查询
        {
          fields: ['campaign_id', 'debt_status'],
          name: 'idx_budget_debt_campaign_status'
        },
        // 查询索引：按用户和状态查询
        {
          fields: ['user_id', 'debt_status'],
          name: 'idx_budget_debt_user_status'
        },
        // 查询索引：按预算来源和状态查询
        {
          fields: ['budget_source', 'debt_status'],
          name: 'idx_budget_debt_source_status'
        },
        // 查询索引：按预设查询
        {
          fields: ['preset_id'],
          name: 'idx_budget_debt_preset'
        },
        // 查询索引：按创建时间查询
        {
          fields: ['created_at'],
          name: 'idx_budget_debt_created'
        }
      ]
    }
  )

  return PresetBudgetDebt
}

/**
 * 📋 预设预算欠账模型 - 统一抽奖架构核心组件
 *
 * 业务职责：
 * - 记录预设发放时因预算不足产生的欠账
 * - 管理系统垫付的预算清偿
 * - 支持预算充值后的债务清偿
 *
 * 核心规则（DR-02）：
 * - 预设发放不可驳回，即使预算不足也要先发放
 * - 产生的欠账需要运营人员在后台充值清偿
 * - 欠账存在期间不影响活动状态
 *
 * 预算来源（DR-05）：
 * - user_budget：用户个人预算账户欠账
 * - pool_budget：活动池预算欠账
 * - pool_quota：池+配额模式欠账
 *
 * 命名规范：
 * - 统一使用 cleared_* 系列命名（清偿相关字段）
 * - 状态枚举：pending（待清偿）、cleared（已清偿）、written_off（已核销）
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
      foreignKey: 'lottery_campaign_id',
      as: 'campaign',
      onDelete: 'RESTRICT',
      comment: '所属活动（禁止删除有欠账的活动）'
    })

    // 多对一：欠账关联某个用户
    PresetBudgetDebt.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'RESTRICT',
      comment: '收到预设奖品的用户'
    })

    /**
     * 多对一：欠账由某次抽奖产生
     * 外键：lottery_draw_id → lottery_draws.lottery_draw_id
     */
    PresetBudgetDebt.belongsTo(models.LotteryDraw, {
      foreignKey: 'lottery_draw_id',
      targetKey: 'lottery_draw_id',
      as: 'draw',
      onDelete: 'SET NULL',
      comment: '产生欠账的抽奖记录'
    })

    // 多对一：欠账由某个预设产生
    PresetBudgetDebt.belongsTo(models.LotteryPreset, {
      foreignKey: 'lottery_preset_id',
      targetKey: 'lottery_preset_id',
      as: 'preset',
      onDelete: 'SET NULL',
      comment: '产生欠账的预设'
    })

    // 多对一：清偿操作人
    PresetBudgetDebt.belongsTo(models.User, {
      foreignKey: 'cleared_by_user_id',
      as: 'clearedByUser',
      onDelete: 'SET NULL',
      comment: '清偿操作人'
    })
  }

  /**
   * 获取欠账状态显示名称
   * @returns {string} 状态中文名称
   */
  getStatusName() {
    const statusNames = {
      pending: '待清偿',
      cleared: '已清偿',
      written_off: '已核销'
    }
    return statusNames[this.status] || '未知状态'
  }

  /**
   * 获取预算来源显示名称
   * @returns {string} 预算来源中文名称
   */
  getDebtSourceName() {
    const sourceNames = {
      user_budget: '用户预算',
      pool_budget: '活动池预算',
      pool_quota: '池+配额预算'
    }
    return sourceNames[this.debt_source] || '未知来源'
  }

  /**
   * 检查是否可以清偿
   * @returns {boolean} 是否可清偿
   */
  canClear() {
    return this.status === 'pending'
  }

  /**
   * 检查是否可以核销
   * @returns {boolean} 是否可核销
   */
  canWriteOff() {
    return this.status === 'pending'
  }

  /**
   * 计算剩余欠账金额
   * @returns {number} 剩余欠账金额
   */
  getRemainingDebt() {
    return this.debt_amount - this.cleared_amount
  }

  /**
   * 清偿欠账
   * @param {number} amount - 清偿金额
   * @param {Object} options - 清偿选项
   * @param {number} options.clearedByUserId - 清偿操作人ID
   * @param {string} options.clearedByMethod - 清偿方式：topup（充值触发）、manual（手动清偿）、auto（自动清偿）
   * @param {string} options.clearedNotes - 清偿备注
   * @param {Object} options.transaction - 事务对象
   * @returns {Promise<boolean>} 是否完全清偿
   */
  async clearDebt(amount, options = {}) {
    const { clearedByUserId, clearedByMethod = 'manual', clearedNotes, transaction } = options
    const remaining = this.getRemainingDebt()

    if (amount <= 0) {
      throw new Error('清偿金额必须大于0')
    }

    if (amount > remaining) {
      throw new Error(`清偿金额(${amount})超过剩余欠账(${remaining})`)
    }

    const newClearedAmount = this.cleared_amount + amount
    const isFullyCleared = newClearedAmount >= this.debt_amount

    await this.update(
      {
        cleared_amount: newClearedAmount,
        status: isFullyCleared ? 'cleared' : 'pending',
        cleared_at: isFullyCleared ? new Date() : null,
        cleared_by_user_id: clearedByUserId,
        cleared_by_method: clearedByMethod,
        cleared_notes: clearedNotes
      },
      { transaction }
    )

    return isFullyCleared
  }

  /**
   * 核销欠账（决定不再追讨）
   * @param {Object} options - 核销选项
   * @param {number} options.clearedByUserId - 核销操作人ID
   * @param {string} options.clearedNotes - 核销备注
   * @param {Object} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   */
  async writeOff(options = {}) {
    const { clearedByUserId, clearedNotes, transaction } = options

    if (!this.canWriteOff()) {
      throw new Error(`当前状态(${this.status})不允许核销`)
    }

    await this.update(
      {
        status: 'written_off',
        cleared_at: new Date(),
        cleared_by_user_id: clearedByUserId,
        cleared_by_method: 'auto',
        cleared_notes: clearedNotes || '核销处理'
      },
      { transaction }
    )
  }

  /**
   * 获取欠账摘要
   * @returns {Object} 欠账摘要对象
   */
  toSummary() {
    return {
      preset_budget_debt_id: this.preset_budget_debt_id,
      lottery_campaign_id: this.lottery_campaign_id,
      user_id: this.user_id,
      debt_source: this.debt_source,
      debt_source_name: this.getDebtSourceName(),
      debt_amount: this.debt_amount,
      cleared_amount: this.cleared_amount,
      remaining_amount: this.getRemainingDebt(),
      status: this.status,
      status_name: this.getStatusName(),
      can_clear: this.canClear(),
      can_write_off: this.canWriteOff(),
      cleared_by_method: this.cleared_by_method,
      created_at: this.created_at,
      cleared_at: this.cleared_at
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
    const { fn, col } = require('sequelize')

    const result = await this.findOne({
      attributes: [
        [fn('COUNT', col('preset_budget_debt_id')), 'total_debts'],
        [fn('SUM', col('debt_amount')), 'total_debt_amount'],
        [fn('SUM', col('cleared_amount')), 'total_cleared_amount']
      ],
      where: {
        lottery_campaign_id: campaignId,
        status: 'pending'
      },
      raw: true,
      transaction
    })

    return {
      total_debts: parseInt(result.total_debts) || 0,
      total_debt_amount: parseInt(result.total_debt_amount) || 0,
      total_cleared_amount: parseInt(result.total_cleared_amount) || 0,
      remaining_debt_amount:
        (parseInt(result.total_debt_amount) || 0) - (parseInt(result.total_cleared_amount) || 0)
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
    const { fn, col } = require('sequelize')

    const result = await this.findOne({
      attributes: [
        [fn('COUNT', col('preset_budget_debt_id')), 'total_debts'],
        [fn('SUM', col('debt_amount')), 'total_debt_amount'],
        [fn('SUM', col('cleared_amount')), 'total_cleared_amount']
      ],
      where: {
        user_id: userId,
        debt_source: 'user_budget',
        status: 'pending'
      },
      raw: true,
      transaction
    })

    return {
      total_debts: parseInt(result.total_debts) || 0,
      total_debt_amount: parseInt(result.total_debt_amount) || 0,
      total_cleared_amount: parseInt(result.total_cleared_amount) || 0,
      remaining_debt_amount:
        (parseInt(result.total_debt_amount) || 0) - (parseInt(result.total_cleared_amount) || 0)
    }
  }

  /**
   * 查询待清偿的欠账列表
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 待清偿欠账列表
   */
  static async findPendingDebts(options = {}) {
    const { campaignId, userId, debtSource, limit = 100, transaction } = options

    const where = {
      status: 'pending'
    }

    if (campaignId) {
      where.lottery_campaign_id = campaignId
    }

    if (userId) {
      where.user_id = userId
    }

    if (debtSource) {
      where.debt_source = debtSource
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
    const { fn, col } = require('sequelize')

    return this.findAll({
      attributes: [
        'debt_source',
        [fn('SUM', col('debt_amount')), 'total_debt'],
        [fn('SUM', col('cleared_amount')), 'total_cleared'],
        [fn('COUNT', col('preset_budget_debt_id')), 'debt_count']
      ],
      where: {
        lottery_campaign_id: campaignId,
        status: 'pending'
      },
      group: ['debt_source'],
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
      preset_budget_debt_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '预算欠账主键ID'
      },

      /**
       * 关联的预设ID
       */
      lottery_preset_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '关联的预设ID（外键关联lottery_presets.lottery_preset_id）'
      },

      /**
       * 关联的抽奖记录ID（外键）
       */
      lottery_draw_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '关联的抽奖记录ID（外键关联 lottery_draws.lottery_draw_id）'
      },

      /**
       * 用户ID（收到预设奖品的用户）
       */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID（收到预设奖品的用户）'
      },

      /**
       * 活动ID
       */
      lottery_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '活动ID'
      },

      /**
       * 欠账金额
       */
      debt_amount: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: '欠账金额（系统垫付的预算金额，整数分值）'
      },

      /**
       * 欠账来源类型
       * - user_budget: 用户预算
       * - pool_budget: 活动池预算
       * - pool_quota: 池+配额
       */
      debt_source: {
        type: DataTypes.ENUM('user_budget', 'pool_budget', 'pool_quota'),
        allowNull: false,
        comment: '欠账来源：user_budget-用户预算, pool_budget-活动池预算, pool_quota-池+配额'
      },

      /**
       * 欠账状态
       * - pending: 待清偿
       * - cleared: 已清偿
       * - written_off: 已核销
       */
      status: {
        type: DataTypes.ENUM('pending', 'cleared', 'written_off'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '欠账状态：pending-待清偿, cleared-已清偿, written_off-已核销'
      },

      /**
       * 已清偿金额
       */
      cleared_amount: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '已清偿金额'
      },

      /**
       * 清偿时间
       */
      cleared_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '清偿时间'
      },

      /**
       * 清偿方式
       * - topup: 充值触发
       * - manual: 手动清偿
       * - auto: 自动核销
       */
      cleared_by_method: {
        type: DataTypes.ENUM('topup', 'manual', 'auto'),
        allowNull: true,
        comment: '清偿方式：topup-充值触发, manual-手动清偿, auto-自动核销'
      },

      /**
       * 清偿操作人ID
       */
      cleared_by_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '清偿操作人ID'
      },

      /**
       * 清偿备注
       */
      cleared_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '清偿备注'
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
      modelName: 'PresetBudgetDebt',
      tableName: 'preset_budget_debt',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '预设预算欠账表 - 记录预设发放时预算不足的系统垫付',
      indexes: [
        // 预设ID索引
        {
          fields: ['lottery_preset_id'],
          name: 'idx_budget_debt_preset'
        },
        // 用户+状态联合索引
        {
          fields: ['user_id', 'status'],
          name: 'idx_budget_debt_user_status'
        },
        // 活动+状态联合索引
        {
          fields: ['lottery_campaign_id', 'status'],
          name: 'idx_budget_debt_campaign_status'
        },
        // 来源+状态联合索引
        {
          fields: ['debt_source', 'status'],
          name: 'idx_budget_debt_source_status'
        },
        // 状态+创建时间索引
        {
          fields: ['status', 'created_at'],
          name: 'idx_budget_debt_status_created'
        }
      ]
    }
  )

  return PresetBudgetDebt
}

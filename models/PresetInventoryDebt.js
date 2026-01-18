/**
 * 📋 预设库存欠账模型 - 统一抽奖架构核心组件
 * 创建时间：2026年01月18日 北京时间
 *
 * 业务职责：
 * - 记录预设发放时因库存不足产生的欠账
 * - 管理系统垫付的库存清偿
 * - 支持库存补货后的债务清偿
 *
 * 核心规则（DR-02）：
 * - 预设发放不可驳回，即使库存不足也要先发放
 * - 产生的欠账需要运营人员在后台补货清偿
 * - 欠账存在期间不影响活动状态
 *
 * 命名规范：
 * - 统一使用 cleared_* 系列命名（清偿相关字段）
 * - 状态枚举：pending（待清偿）、cleared（已清偿）、written_off（已核销）
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 预设库存欠账模型
 * 业务场景：管理预设发放产生的库存负债
 */
class PresetInventoryDebt extends Model {
  /**
   * 模型关联定义
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
    // 多对一：欠账属于某个活动
    PresetInventoryDebt.belongsTo(models.LotteryCampaign, {
      foreignKey: 'campaign_id',
      as: 'campaign',
      onDelete: 'RESTRICT',
      comment: '所属活动（禁止删除有欠账的活动）'
    })

    // 多对一：欠账关联某个奖品
    PresetInventoryDebt.belongsTo(models.LotteryPrize, {
      foreignKey: 'prize_id',
      as: 'prize',
      onDelete: 'RESTRICT',
      comment: '欠账的奖品（禁止删除有欠账的奖品）'
    })

    // 多对一：欠账由某次抽奖产生
    PresetInventoryDebt.belongsTo(models.LotteryDraw, {
      foreignKey: 'draw_id',
      targetKey: 'draw_id',
      as: 'draw',
      onDelete: 'SET NULL',
      comment: '产生欠账的抽奖记录'
    })

    // 多对一：欠账由某个预设产生
    PresetInventoryDebt.belongsTo(models.LotteryPreset, {
      foreignKey: 'preset_id',
      targetKey: 'preset_id',
      as: 'preset',
      onDelete: 'SET NULL',
      comment: '产生欠账的预设'
    })

    // 多对一：收到预设奖品的用户
    PresetInventoryDebt.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'SET NULL',
      comment: '收到预设奖品的用户'
    })

    // 多对一：清偿操作人
    PresetInventoryDebt.belongsTo(models.User, {
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
   * 计算剩余欠账数量
   * @returns {number} 剩余欠账数量
   */
  getRemainingDebt() {
    return this.debt_quantity - this.cleared_quantity
  }

  /**
   * 清偿欠账
   * @param {number} quantity - 清偿数量
   * @param {Object} options - 清偿选项
   * @param {number} options.clearedByUserId - 清偿操作人ID
   * @param {string} options.clearedByMethod - 清偿方式：restock（补货触发）、manual（手动清偿）、auto（自动清偿）
   * @param {string} options.clearedNotes - 清偿备注
   * @param {Object} options.transaction - 事务对象
   * @returns {Promise<boolean>} 是否完全清偿
   */
  async clearDebt(quantity, options = {}) {
    const { clearedByUserId, clearedByMethod = 'manual', clearedNotes, transaction } = options
    const remaining = this.getRemainingDebt()

    if (quantity <= 0) {
      throw new Error('清偿数量必须大于0')
    }

    if (quantity > remaining) {
      throw new Error(`清偿数量(${quantity})超过剩余欠账(${remaining})`)
    }

    const newClearedQuantity = this.cleared_quantity + quantity
    const isFullyCleared = newClearedQuantity >= this.debt_quantity

    await this.update(
      {
        cleared_quantity: newClearedQuantity,
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
      debt_id: this.debt_id,
      campaign_id: this.campaign_id,
      prize_id: this.prize_id,
      user_id: this.user_id,
      debt_quantity: this.debt_quantity,
      cleared_quantity: this.cleared_quantity,
      remaining_quantity: this.getRemainingDebt(),
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
   * 按活动统计库存欠账
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 统计结果
   */
  static async getDebtStatsByCampaign(campaignId, options = {}) {
    const { transaction } = options
    const { fn, col } = require('sequelize')

    const result = await this.findOne({
      attributes: [
        [fn('COUNT', col('debt_id')), 'total_debts'],
        [fn('SUM', col('debt_quantity')), 'total_debt_quantity'],
        [fn('SUM', col('cleared_quantity')), 'total_cleared_quantity']
      ],
      where: {
        campaign_id: campaignId,
        status: 'pending'
      },
      raw: true,
      transaction
    })

    return {
      total_debts: parseInt(result.total_debts) || 0,
      total_debt_quantity: parseInt(result.total_debt_quantity) || 0,
      total_cleared_quantity: parseInt(result.total_cleared_quantity) || 0,
      remaining_debt_quantity:
        (parseInt(result.total_debt_quantity) || 0) - (parseInt(result.total_cleared_quantity) || 0)
    }
  }

  /**
   * 查询待清偿的欠账列表
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 待清偿欠账列表
   */
  static async findPendingDebts(options = {}) {
    const { campaignId, prizeId, limit = 100, transaction } = options

    const where = {
      status: 'pending'
    }

    if (campaignId) {
      where.campaign_id = campaignId
    }

    if (prizeId) {
      where.prize_id = prizeId
    }

    return this.findAll({
      where,
      order: [['created_at', 'ASC']],
      limit,
      transaction
    })
  }

  /**
   * 按奖品分组统计欠账
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 按奖品分组的统计结果
   */
  static async getDebtsByPrize(campaignId, options = {}) {
    const { transaction } = options
    const { fn, col } = require('sequelize')

    return this.findAll({
      attributes: [
        'prize_id',
        [fn('SUM', col('debt_quantity')), 'total_debt'],
        [fn('SUM', col('cleared_quantity')), 'total_cleared'],
        [fn('COUNT', col('debt_id')), 'debt_count']
      ],
      where: {
        campaign_id: campaignId,
        status: 'pending'
      },
      group: ['prize_id'],
      transaction
    })
  }
}

/**
 * 模型初始化
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {PresetInventoryDebt} 初始化后的模型
 */
module.exports = sequelize => {
  PresetInventoryDebt.init(
    {
      /**
       * 欠账记录ID - 主键
       */
      debt_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '库存欠账主键ID'
      },

      /**
       * 关联的预设ID
       */
      preset_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '关联的预设ID（外键关联lottery_presets.preset_id）'
      },

      /**
       * 关联的抽奖记录ID
       */
      draw_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '关联的抽奖记录ID（外键关联lottery_draws.draw_id）'
      },

      /**
       * 奖品ID
       */
      prize_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '欠账奖品ID（外键关联lottery_prizes.prize_id）'
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
      campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '活动ID'
      },

      /**
       * 欠账数量
       */
      debt_quantity: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 1,
        comment: '欠账数量（库存垫付数量）'
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
       * 已清偿数量
       */
      cleared_quantity: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '已清偿数量'
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
       * - restock: 补货触发
       * - manual: 手动清偿
       * - auto: 自动核销
       */
      cleared_by_method: {
        type: DataTypes.ENUM('restock', 'manual', 'auto'),
        allowNull: true,
        comment: '清偿方式：restock-补货触发, manual-手动清偿, auto-自动核销'
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
      modelName: 'PresetInventoryDebt',
      tableName: 'preset_inventory_debt',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '预设库存欠账表 - 记录预设发放时库存不足的系统垫付',
      indexes: [
        // 预设ID索引
        {
          fields: ['preset_id'],
          name: 'idx_inv_debt_preset'
        },
        // 奖品+状态联合索引
        {
          fields: ['prize_id', 'status'],
          name: 'idx_inv_debt_prize_status'
        },
        // 活动+状态联合索引
        {
          fields: ['campaign_id', 'status'],
          name: 'idx_inv_debt_campaign_status'
        },
        // 状态+创建时间索引（用于查询待处理欠账）
        {
          fields: ['status', 'created_at'],
          name: 'idx_inv_debt_status_created'
        }
      ]
    }
  )

  return PresetInventoryDebt
}

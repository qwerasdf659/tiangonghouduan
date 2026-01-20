'use strict'

/**
 * LotteryUserGlobalState 模型
 *
 * 用户全局抽奖统计表，用于追踪用户跨所有活动的抽奖历史统计。
 *
 * 核心业务场景：
 * 1. LuckDebt（运气债务）机制：根据用户历史空奖率计算补偿系数
 * 2. 全局统计分析：跨活动的抽奖行为分析
 * 3. 用户体验均衡：确保长期体验公平性
 *
 * 运气债务计算原理：
 * - 系统期望空奖率（例如 30%）
 * - 用户历史空奖率 > 期望值 → 累积正向债务 → 提高非空奖概率补偿
 * - 用户历史空奖率 < 期望值 → 累积负向债务 → 轻微降低非空奖概率
 *
 * 数据流向：
 * - 读取：BuildPrizePoolStage 计算运气债务补偿系数
 * - 写入：SettleStage 在抽奖结算后更新全局统计
 *
 * 设计原则：
 * - 全局唯一：每个用户仅一条记录
 * - 跨活动统计：不区分具体活动，统计全局数据
 * - 延迟更新：可接受异步更新，不影响抽奖实时性
 *
 * @module models/LotteryUserGlobalState
 * @author 抽奖模块策略重构
 * @since 2026-01-20
 */

const { Model, DataTypes } = require('sequelize')

/**
 * 运气债务等级定义
 * @enum {string}
 */
const LUCK_DEBT_LEVEL = {
  /** 无债务（历史空奖率接近期望值） */
  NONE: 'none',
  /** 低债务（历史空奖率略高于期望值） */
  LOW: 'low',
  /** 中债务（历史空奖率明显高于期望值） */
  MEDIUM: 'medium',
  /** 高债务（历史空奖率严重高于期望值） */
  HIGH: 'high'
}

/**
 * 抽奖用户全局状态模型
 *
 * 记录用户跨活动的全局抽奖统计，用于运气债务机制和长期体验平衡
 *
 * @class LotteryUserGlobalState
 * @extends Model
 */
class LotteryUserGlobalState extends Model {
  /**
   * 模型关联定义
   *
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  static associate(models) {
    // 关联用户表
    LotteryUserGlobalState.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    })
  }

  /**
   * 查找或创建用户的全局状态
   * @param {number} user_id - 用户ID
   * @param {Object} options - 可选参数（如 transaction）
   * @returns {Promise<LotteryUserGlobalState>} 全局状态记录
   */
  static async findOrCreateState(user_id, options = {}) {
    const [state, _created] = await this.findOrCreate({
      where: { user_id },
      defaults: {
        user_id,
        global_draw_count: 0,
        global_empty_count: 0,
        historical_empty_rate: 0,
        luck_debt_level: LUCK_DEBT_LEVEL.NONE,
        luck_debt_multiplier: 1.0,
        global_high_count: 0,
        global_mid_count: 0,
        global_low_count: 0,
        participated_campaigns: 0
      },
      ...options
    })
    return state
  }

  /**
   * 记录一次抽奖结果并更新全局统计
   *
   * @param {string} tier - 抽奖档位（high/mid/low/empty）
   * @param {number} campaign_id - 活动ID
   * @param {Object} options - 可选参数（如 transaction）
   * @returns {Promise<LotteryUserGlobalState>} 更新后的状态
   */
  async recordDraw(tier, campaign_id, options = {}) {
    const updates = {
      global_draw_count: this.global_draw_count + 1,
      last_draw_at: new Date(),
      last_campaign_id: campaign_id
    }

    // 根据档位更新对应计数
    switch (tier) {
      case 'empty':
        updates.global_empty_count = this.global_empty_count + 1
        break
      case 'high':
        updates.global_high_count = this.global_high_count + 1
        break
      case 'mid':
        updates.global_mid_count = this.global_mid_count + 1
        break
      case 'low':
        updates.global_low_count = this.global_low_count + 1
        break
    }

    // 重新计算历史空奖率
    const new_draw_count = updates.global_draw_count
    const new_empty_count = updates.global_empty_count || this.global_empty_count
    updates.historical_empty_rate = new_draw_count > 0 ? new_empty_count / new_draw_count : 0

    // 重新计算运气债务等级和乘数
    const debt = this.calculateLuckDebt(updates.historical_empty_rate)
    updates.luck_debt_level = debt.level
    updates.luck_debt_multiplier = debt.multiplier

    await this.update(updates, options)
    return this
  }

  /**
   * 增加参与活动数量（首次参与某活动时调用）
   *
   * @param {Object} options - 可选参数（如 transaction）
   * @returns {Promise<LotteryUserGlobalState>} 更新后的状态
   */
  async incrementParticipatedCampaigns(options = {}) {
    await this.increment('participated_campaigns', options)
    return this
  }

  /**
   * 计算运气债务等级和补偿乘数
   *
   * 运气债务计算规则（基于文档设计）：
   * - 系统期望空奖率：30%（可配置）
   * - 偏离阈值：
   *   - none: |实际空奖率 - 期望空奖率| <= 5%
   *   - low: 偏离 5%-10%，乘数 1.05
   *   - medium: 偏离 10%-15%，乘数 1.15
   *   - high: 偏离 > 15%，乘数 1.25
   *
   * @param {number} empty_rate - 历史空奖率（0.0 - 1.0）
   * @param {number} expected_rate - 期望空奖率（默认 0.30）
   * @returns {{ level: string, multiplier: number }} 运气债务等级和补偿乘数
   */
  calculateLuckDebt(empty_rate, expected_rate = 0.3) {
    const deviation = empty_rate - expected_rate

    // 只有空奖率高于期望值时才产生正向债务（需要补偿）
    if (deviation <= 0.05) {
      return { level: LUCK_DEBT_LEVEL.NONE, multiplier: 1.0 }
    } else if (deviation <= 0.1) {
      return { level: LUCK_DEBT_LEVEL.LOW, multiplier: 1.05 }
    } else if (deviation <= 0.15) {
      return { level: LUCK_DEBT_LEVEL.MEDIUM, multiplier: 1.15 }
    } else {
      return { level: LUCK_DEBT_LEVEL.HIGH, multiplier: 1.25 }
    }
  }

  /**
   * 获取用户的运气债务补偿乘数
   * @returns {number} 补偿乘数（>= 1.0）
   */
  getLuckDebtMultiplier() {
    return parseFloat(this.luck_debt_multiplier) || 1.0
  }

  /**
   * 检查用户是否有运气债务需要补偿
   * @returns {boolean} 是否有债务
   */
  hasLuckDebt() {
    return this.luck_debt_level !== LUCK_DEBT_LEVEL.NONE
  }
}

/**
 * 模型初始化函数
 * @param {Sequelize} sequelize - Sequelize 实例
 * @returns {LotteryUserGlobalState} 模型类
 */
function initModel(sequelize) {
  LotteryUserGlobalState.init(
    {
      /**
       * 全局状态ID - 主键（自增）
       */
      global_state_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '全局状态记录ID（自增主键）'
      },

      /**
       * 用户ID - 唯一（每用户一条记录）
       */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        comment: '用户ID（唯一，外键关联users.user_id）',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      /**
       * 全局总抽奖次数
       */
      global_draw_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '全局总抽奖次数（跨所有活动）'
      },

      /**
       * 全局总空奖次数
       */
      global_empty_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '全局总空奖次数（跨所有活动）'
      },

      /**
       * 历史空奖率 - 运气债务核心指标
       * 计算公式：global_empty_count / global_draw_count
       */
      historical_empty_rate: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0.0,
        comment: '历史空奖率（0.0000-1.0000，运气债务核心指标）',
        /**
         * 获取历史空奖率的数值
         *
         * @returns {number} 空奖率数值
         */
        get() {
          const value = this.getDataValue('historical_empty_rate')
          return value !== null ? parseFloat(value) : 0
        }
      },

      /**
       * 运气债务等级
       * 根据 historical_empty_rate 与系统期望值的偏离计算
       */
      luck_debt_level: {
        type: DataTypes.ENUM('none', 'low', 'medium', 'high'),
        allowNull: false,
        defaultValue: 'none',
        comment: '运气债务等级（none/low/medium/high）'
      },

      /**
       * 运气债务乘数 - 补偿系数
       * 值 > 1.0 表示需要补偿（提高非空奖概率）
       */
      luck_debt_multiplier: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: false,
        defaultValue: 1.0,
        comment: '运气债务乘数（>1.0表示需补偿，用于提高非空奖概率）',
        /**
         * 获取运气债务乘数的数值
         *
         * @returns {number} 乘数数值
         */
        get() {
          const value = this.getDataValue('luck_debt_multiplier')
          return value !== null ? parseFloat(value) : 1.0
        }
      },

      /**
       * 全局高价值奖品次数
       */
      global_high_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '全局高价值奖品获取次数（high档位）'
      },

      /**
       * 全局中价值奖品次数
       */
      global_mid_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '全局中价值奖品获取次数（mid档位）'
      },

      /**
       * 全局低价值奖品次数
       */
      global_low_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '全局低价值奖品获取次数（low档位）'
      },

      /**
       * 参与活动数量
       */
      participated_campaigns: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '参与过的活动数量'
      },

      /**
       * 最后一次抽奖时间
       */
      last_draw_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '全局最后一次抽奖时间（北京时间）'
      },

      /**
       * 最后一次抽奖活动ID
       */
      last_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '最后一次抽奖的活动ID'
      },

      /**
       * 创建时间
       */
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间（北京时间）'
      },

      /**
       * 更新时间
       */
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间（北京时间）'
      }
    },
    {
      sequelize,
      modelName: 'LotteryUserGlobalState',
      tableName: 'lottery_user_global_state',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '用户全局抽奖统计表（LuckDebt运气债务机制）',
      indexes: [
        {
          fields: ['luck_debt_level'],
          name: 'idx_global_state_luck_debt_level'
        },
        {
          fields: ['historical_empty_rate'],
          name: 'idx_global_state_empty_rate'
        },
        {
          fields: ['last_draw_at'],
          name: 'idx_global_state_last_draw_at'
        }
      ]
    }
  )

  return LotteryUserGlobalState
}

module.exports = initModel
module.exports.LotteryUserGlobalState = LotteryUserGlobalState
module.exports.LUCK_DEBT_LEVEL = LUCK_DEBT_LEVEL

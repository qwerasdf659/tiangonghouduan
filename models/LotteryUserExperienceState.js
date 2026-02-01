'use strict'

/**
 * LotteryUserExperienceState 模型
 *
 * 用户活动级抽奖体验状态表，用于追踪用户在特定活动中的抽奖体验状态。
 *
 * 核心业务场景：
 * 1. Pity 系统：追踪 empty_streak（连续空奖次数），达到阈值时触发保底机制
 * 2. Anti-Empty Streak：监控并防止过长的空奖连击
 * 3. Anti-High Streak：追踪 recent_high_count（近期高价值奖品次数），防止高价值奖品集中
 *
 * 数据流向：
 * - 读取：TierPickStage 在选择档位前查询用户当前状态
 * - 写入：SettleStage 在抽奖结算后更新用户状态
 *
 * 设计原则：
 * - 活动隔离：每个用户在每个活动有独立的体验状态记录
 * - 高频读写：抽奖时需要读取和更新，索引优化至关重要
 * - 状态重置：非空奖时 empty_streak 重置为 0
 *
 * @module models/LotteryUserExperienceState
 * @author 抽奖模块策略重构
 * @since 2026-01-20
 */

const { Model, DataTypes } = require('sequelize')

/**
 * 抽奖用户体验状态模型
 *
 * 记录用户在特定活动中的抽奖体验状态，用于 Pity 系统和体验平滑机制
 *
 * @class LotteryUserExperienceState
 * @extends Model
 */
class LotteryUserExperienceState extends Model {
  /**
   * 模型关联定义
   *
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  static associate(models) {
    // 关联用户表
    LotteryUserExperienceState.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    })

    // 关联活动表
    LotteryUserExperienceState.belongsTo(models.LotteryCampaign, {
      foreignKey: 'lottery_campaign_id',
      as: 'campaign',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    })
  }

  /**
   * 查找或创建用户在特定活动的体验状态
   * @param {number} user_id - 用户ID
   * @param {number} lottery_campaign_id - 抽奖活动ID
   * @param {Object} options - 可选参数（如 transaction）
   * @returns {Promise<LotteryUserExperienceState>} 体验状态记录
   */
  static async findOrCreateState(user_id, lottery_campaign_id, options = {}) {
    const [state, _created] = await this.findOrCreate({
      where: { user_id, lottery_campaign_id },
      defaults: {
        user_id,
        lottery_campaign_id,
        empty_streak: 0,
        recent_high_count: 0,
        max_empty_streak: 0,
        total_draw_count: 0,
        total_empty_count: 0,
        pity_trigger_count: 0
      },
      ...options
    })
    return state
  }

  /**
   * 更新空奖连击状态（抽到空奖时调用）
   *
   * @param {Object} options - 可选参数（如 transaction）
   * @returns {Promise<LotteryUserExperienceState>} 更新后的状态
   */
  async incrementEmptyStreak(options = {}) {
    const new_empty_streak = this.empty_streak + 1
    const updates = {
      empty_streak: new_empty_streak,
      total_draw_count: this.total_draw_count + 1,
      total_empty_count: this.total_empty_count + 1,
      last_draw_at: new Date(),
      last_draw_tier: 'empty'
    }

    // 更新历史最大连续空奖次数
    if (new_empty_streak > this.max_empty_streak) {
      updates.max_empty_streak = new_empty_streak
    }

    await this.update(updates, options)
    return this
  }

  /**
   * 重置空奖连击状态（抽到非空奖时调用）
   *
   * @param {string} tier - 抽到的档位（high/mid/low）
   * @param {boolean} pity_triggered - 是否触发了 Pity 系统
   * @param {Object} options - 可选参数（如 transaction）
   * @returns {Promise<LotteryUserExperienceState>} 更新后的状态
   */
  async resetEmptyStreak(tier, pity_triggered = false, options = {}) {
    const updates = {
      empty_streak: 0,
      total_draw_count: this.total_draw_count + 1,
      last_draw_at: new Date(),
      last_draw_tier: tier
    }

    // 如果是高价值档位，增加计数
    if (tier === 'high') {
      updates.recent_high_count = this.recent_high_count + 1
    }

    // 如果触发了 Pity 系统
    if (pity_triggered) {
      updates.pity_trigger_count = this.pity_trigger_count + 1
    }

    await this.update(updates, options)
    return this
  }

  /**
   * 获取用户在活动中的空奖率
   * @returns {number} 空奖率（0.0 - 1.0）
   */
  getEmptyRate() {
    if (this.total_draw_count === 0) return 0
    return this.total_empty_count / this.total_draw_count
  }

  /**
   * 检查是否应该触发 Pity 系统
   * @param {number} pity_threshold - Pity 触发阈值（默认 10）
   * @returns {boolean} 是否应该触发 Pity
   */
  shouldTriggerPity(pity_threshold = 10) {
    return this.empty_streak >= pity_threshold
  }
}

/**
 * 模型初始化函数
 * @param {Sequelize} sequelize - Sequelize 实例
 * @returns {LotteryUserExperienceState} 模型类
 */
function initModel(sequelize) {
  LotteryUserExperienceState.init(
    {
      /**
       * 状态ID - 主键（自增）
       */
      lottery_user_experience_state_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '状态记录ID（自增主键）'
      },

      /**
       * 用户ID - 外键关联 users 表
       */
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID（外键关联users.user_id）',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      /**
       * 活动ID - 外键关联 lottery_campaigns 表
       */
      lottery_campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '抽奖活动ID（外键关联lottery_campaigns.lottery_campaign_id）',
        references: {
          model: 'lottery_campaigns',
          key: 'lottery_campaign_id'
        }
      },

      /**
       * 连续空奖次数 - Pity 系统核心指标
       * 每次抽到空奖 +1，抽到非空奖重置为 0
       */
      empty_streak: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '连续空奖次数（Pity系统：每次空奖+1，非空奖重置为0）'
      },

      /**
       * 近期高价值奖品次数 - AntiHigh 核心指标
       * 统计最近 N 次抽奖中获得 high 档位的次数
       */
      recent_high_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '近期高价值奖品次数（AntiHigh：统计窗口内high档位次数）'
      },

      /**
       * 历史最大连续空奖次数 - 用于分析
       */
      max_empty_streak: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '历史最大连续空奖次数（用于分析和优化）'
      },

      /**
       * 总抽奖次数 - 活动维度
       */
      total_draw_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '该活动总抽奖次数'
      },

      /**
       * 总空奖次数 - 活动维度
       */
      total_empty_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '该活动总空奖次数'
      },

      /**
       * Pity 触发次数 - 用于监控
       */
      pity_trigger_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Pity系统触发次数（用于监控效果）'
      },

      /**
       * 最后一次抽奖时间
       */
      last_draw_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后一次抽奖时间（北京时间）'
      },

      /**
       * 最后一次抽奖档位
       */
      last_draw_tier: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '最后一次抽奖档位（high/mid/low/empty）'
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
      modelName: 'LotteryUserExperienceState',
      tableName: 'lottery_user_experience_state',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '用户活动级抽奖体验状态表（Pity/AntiEmpty/AntiHigh）',
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'lottery_campaign_id'],
          name: 'uk_user_campaign_experience'
        },
        {
          fields: ['user_id'],
          name: 'idx_experience_user_id'
        },
        {
          fields: ['lottery_campaign_id'],
          name: 'idx_experience_campaign_id'
        },
        {
          fields: ['empty_streak'],
          name: 'idx_experience_empty_streak'
        }
      ]
    }
  )

  return LotteryUserExperienceState
}

module.exports = initModel
module.exports.LotteryUserExperienceState = LotteryUserExperienceState

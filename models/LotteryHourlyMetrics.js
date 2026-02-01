'use strict'

/**
 * LotteryHourlyMetrics 模型
 *
 * 抽奖监控指标表（按小时聚合），用于监控活动健康度和策略效果。
 *
 * 核心业务场景：
 * 1. 实时监控活动健康度（空奖率、高价值率、预算消耗率）
 * 2. 策略效果评估（Pity 触发率、运气债务分布）
 * 3. 异常检测和预警（过高空奖率、预算超支等）
 *
 * 数据流向：
 * - 写入：定时任务每小时聚合一次
 * - 读取：监控仪表板、运营分析报表
 *
 * 设计原则：
 * - 按小时粒度聚合，避免实时计算压力
 * - 预计算关键指标，支持快速查询
 * - 保留活动维度，支持跨活动对比分析
 *
 * @module models/LotteryHourlyMetrics
 * @author 抽奖模块策略重构
 * @since 2026-01-20
 */

const { Model, DataTypes, Op } = require('sequelize')

/**
 * 抽奖监控指标模型
 *
 * 存储按小时聚合的抽奖监控指标
 *
 * @class LotteryHourlyMetrics
 * @extends Model
 */
class LotteryHourlyMetrics extends Model {
  /**
   * 模型关联定义
   *
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  static associate(models) {
    // 关联活动表
    LotteryHourlyMetrics.belongsTo(models.LotteryCampaign, {
      foreignKey: 'lottery_campaign_id',
      as: 'campaign',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    })
  }

  /**
   * 查找或创建某小时的指标记录
   *
   * @param {number} lottery_campaign_id - 抽奖活动ID
   * @param {Date} hour_bucket - 小时时间（会自动截断到整点）
   * @param {Object} options - 可选参数（如 transaction）
   * @returns {Promise<LotteryHourlyMetrics>} 指标记录
   */
  static async findOrCreateMetrics(lottery_campaign_id, hour_bucket, options = {}) {
    // 截断到整点
    const normalized_hour = new Date(hour_bucket)
    normalized_hour.setMinutes(0, 0, 0)

    const [metrics, _created] = await this.findOrCreate({
      where: { lottery_campaign_id, hour_bucket: normalized_hour },
      defaults: {
        lottery_campaign_id,
        hour_bucket: normalized_hour,
        total_draws: 0,
        unique_users: 0,
        high_tier_count: 0,
        mid_tier_count: 0,
        low_tier_count: 0,
        fallback_tier_count: 0,
        empty_count: 0,
        total_budget_consumed: 0,
        total_prize_value: 0,
        b0_tier_count: 0,
        b1_tier_count: 0,
        b2_tier_count: 0,
        b3_tier_count: 0,
        pity_triggered_count: 0,
        anti_empty_triggered_count: 0,
        anti_high_triggered_count: 0,
        luck_debt_triggered_count: 0,
        guarantee_triggered_count: 0,
        tier_downgrade_count: 0,
        empty_rate: 0,
        high_value_rate: 0,
        avg_prize_value: 0
      },
      ...options
    })
    return metrics
  }

  /**
   * 获取活动的时间范围内指标
   *
   * @param {number} lottery_campaign_id - 抽奖活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @param {Object} options - 可选参数
   * @returns {Promise<Array<LotteryHourlyMetrics>>} 指标记录列表
   */
  static async getMetricsInRange(lottery_campaign_id, start_time, end_time, options = {}) {
    return this.findAll({
      where: {
        lottery_campaign_id,
        hour_bucket: {
          [Op.gte]: start_time,
          [Op.lte]: end_time
        }
      },
      order: [['hour_bucket', 'ASC']],
      ...options
    })
  }

  /**
   * 获取最新的 N 小时指标
   *
   * @param {number} lottery_campaign_id - 抽奖活动ID
   * @param {number} hours - 小时数
   * @param {Object} options - 可选参数
   * @returns {Promise<Array<LotteryHourlyMetrics>>} 指标记录列表
   */
  static async getRecentMetrics(lottery_campaign_id, hours = 24, options = {}) {
    const start_time = new Date()
    start_time.setHours(start_time.getHours() - hours)

    return this.findAll({
      where: {
        lottery_campaign_id,
        hour_bucket: {
          [Op.gte]: start_time
        }
      },
      order: [['hour_bucket', 'DESC']],
      ...options
    })
  }

  /**
   * 记录一次抽奖结果（增量更新）
   *
   * @param {Object} draw_result - 抽奖结果
   * @param {number} draw_result.tier - 奖品档位（high/mid/low/fallback）
   * @param {number} draw_result.prize_value - 奖品价值
   * @param {string} draw_result.budget_tier - 预算分层（B0/B1/B2/B3）
   * @param {Object} draw_result.mechanisms - 触发的机制
   * @param {Object} options - 可选参数（如 transaction）
   * @returns {Promise<LotteryHourlyMetrics>} 更新后的记录
   */
  async recordDraw(draw_result, options = {}) {
    const { tier, prize_value = 0, budget_tier, mechanisms = {} } = draw_result

    const updates = {
      total_draws: this.total_draws + 1,
      total_prize_value: this.total_prize_value + prize_value
    }

    // 档位计数
    switch (tier) {
      case 'high':
        updates.high_tier_count = this.high_tier_count + 1
        break
      case 'mid':
        updates.mid_tier_count = this.mid_tier_count + 1
        break
      case 'low':
        updates.low_tier_count = this.low_tier_count + 1
        break
      case 'fallback':
        updates.fallback_tier_count = this.fallback_tier_count + 1
        break
      case 'empty':
        // 真正空奖：系统异常导致，与正常 fallback 保底分开统计
        updates.empty_count = (this.empty_count || 0) + 1
        break
    }

    // 预算分层计数
    switch (budget_tier) {
      case 'B0':
        updates.b0_tier_count = this.b0_tier_count + 1
        break
      case 'B1':
        updates.b1_tier_count = this.b1_tier_count + 1
        break
      case 'B2':
        updates.b2_tier_count = this.b2_tier_count + 1
        break
      case 'B3':
        updates.b3_tier_count = this.b3_tier_count + 1
        break
    }

    // 机制触发计数
    if (mechanisms.pity_triggered) {
      updates.pity_triggered_count = this.pity_triggered_count + 1
    }
    if (mechanisms.anti_empty_triggered) {
      updates.anti_empty_triggered_count = this.anti_empty_triggered_count + 1
    }
    if (mechanisms.anti_high_triggered) {
      updates.anti_high_triggered_count = this.anti_high_triggered_count + 1
    }
    if (mechanisms.luck_debt_triggered) {
      updates.luck_debt_triggered_count = this.luck_debt_triggered_count + 1
    }
    if (mechanisms.guarantee_triggered) {
      updates.guarantee_triggered_count = this.guarantee_triggered_count + 1
    }
    if (mechanisms.tier_downgraded) {
      updates.tier_downgrade_count = this.tier_downgrade_count + 1
    }

    // 重新计算率指标
    const new_total = updates.total_draws
    // empty_rate 使用真正空奖数（empty_count），而非保底奖品数（fallback_tier_count）
    const empty_count =
      updates.empty_count !== undefined ? updates.empty_count : this.empty_count || 0
    updates.empty_rate = new_total > 0 ? empty_count / new_total : 0
    updates.high_value_rate = new_total > 0 ? updates.high_tier_count / new_total : 0
    updates.avg_prize_value = new_total > 0 ? updates.total_prize_value / new_total : 0

    await this.update(updates, options)
    return this
  }

  /**
   * 重新计算率指标
   *
   * @param {Object} options - 可选参数（如 transaction）
   * @returns {Promise<LotteryHourlyMetrics>} 更新后的记录
   */
  async recalculateRates(options = {}) {
    const total = this.total_draws || 1 // 避免除以零
    const empty_count = this.empty_count || 0 // 使用真正空奖数
    const high_count = this.high_tier_count || 0
    const prize_value = this.total_prize_value || 0

    await this.update(
      {
        empty_rate: empty_count / total, // empty_rate 基于真正空奖数，非保底数
        high_value_rate: high_count / total,
        avg_prize_value: prize_value / total
      },
      options
    )
    return this
  }

  /**
   * 获取空奖率
   * @returns {number} 空奖率（0.0 - 1.0）
   */
  getEmptyRate() {
    return parseFloat(this.empty_rate) || 0
  }

  /**
   * 获取高价值率
   * @returns {number} 高价值率（0.0 - 1.0）
   */
  getHighValueRate() {
    return parseFloat(this.high_value_rate) || 0
  }

  /**
   * 获取 Pity 触发率
   * @returns {number} Pity 触发率（0.0 - 1.0）
   */
  getPityTriggerRate() {
    const total = this.total_draws || 1
    return this.pity_triggered_count / total
  }

  /**
   * 检查是否需要预警（空奖率过高）
   *
   * @param {number} threshold - 空奖率阈值（默认 0.6 = 60%）
   * @returns {boolean} 是否需要预警
   */
  needsEmptyRateAlert(threshold = 0.6) {
    return this.getEmptyRate() > threshold && this.total_draws >= 100
  }
}

/**
 * 模型初始化函数
 * @param {Sequelize} sequelize - Sequelize 实例
 * @returns {LotteryHourlyMetrics} 模型类
 */
function initModel(sequelize) {
  LotteryHourlyMetrics.init(
    {
      /**
       * 指标ID - 主键（自增）
       */
      lottery_hourly_metric_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '指标记录ID（自增主键）'
      },

      /**
       * 活动ID
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
       * 统计小时
       */
      hour_bucket: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '统计小时（格式: YYYY-MM-DD HH:00:00，北京时间）'
      },

      // ========== 基础抽奖统计 ==========

      total_draws: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '该小时总抽奖次数'
      },

      unique_users: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '该小时参与抽奖的唯一用户数'
      },

      // ========== 档位分布统计 ==========

      high_tier_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '高价值奖品次数（high档位）'
      },

      mid_tier_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '中价值奖品次数（mid档位）'
      },

      low_tier_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '低价值奖品次数（low档位）'
      },

      fallback_tier_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '保底奖品次数（fallback档位，正常保底机制）'
      },

      /**
       * 真正空奖次数（系统异常导致的空奖）
       *
       * 与 fallback_tier_count 区分：
       * - empty_count：系统异常或配置问题导致的空奖，需要运营关注
       * - fallback_tier_count：正常保底机制触发，是预期行为
       */
      empty_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '真正空奖次数（系统异常导致的空奖，与正常fallback保底分开统计）'
      },

      // ========== 预算相关统计 ==========

      total_budget_consumed: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '该小时总预算消耗（积分）'
      },

      total_prize_value: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '该小时发放的总奖品价值（积分）'
      },

      // ========== 预算分层分布（B0-B3） ==========

      b0_tier_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'B0档位（无预算）用户抽奖次数'
      },

      b1_tier_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'B1档位（低预算≤100）用户抽奖次数'
      },

      b2_tier_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'B2档位（中预算101-500）用户抽奖次数'
      },

      b3_tier_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'B3档位（高预算>500）用户抽奖次数'
      },

      // ========== 体验机制统计 ==========

      pity_triggered_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Pity系统（软保底）触发次数'
      },

      anti_empty_triggered_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'AntiEmpty（反连空）强制非空触发次数'
      },

      anti_high_triggered_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'AntiHigh（反连高）档位限制触发次数'
      },

      luck_debt_triggered_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '运气债务补偿触发次数（debt_level > none）'
      },

      // ========== 保底和降级统计 ==========

      guarantee_triggered_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '保底机制触发次数'
      },

      tier_downgrade_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '档位降级触发次数（如high无库存降级到mid）'
      },

      // ========== 计算指标 ==========

      empty_rate: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0,
        comment: '空奖率（0.0000-1.0000）',
        /**
         * 获取空奖率（自动转换为浮点数）
         * @returns {number} 空奖率（0-1之间的浮点数）
         */
        get() {
          const value = this.getDataValue('empty_rate')
          return value !== null ? parseFloat(value) : 0
        }
      },

      high_value_rate: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0,
        comment: '高价值率（0.0000-1.0000）',
        /**
         * 获取高价值率（自动转换为浮点数）
         * @returns {number} 高价值率（0-1之间的浮点数）
         */
        get() {
          const value = this.getDataValue('high_value_rate')
          return value !== null ? parseFloat(value) : 0
        }
      },

      avg_prize_value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '平均奖品价值（积分）',
        /**
         * 获取平均奖品价值（自动转换为浮点数）
         * @returns {number} 平均奖品价值（积分）
         */
        get() {
          const value = this.getDataValue('avg_prize_value')
          return value !== null ? parseFloat(value) : 0
        }
      },

      // ========== 元数据 ==========

      aggregated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '聚合计算时间（北京时间）'
      },

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
      modelName: 'LotteryHourlyMetrics',
      tableName: 'lottery_hourly_metrics',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '抽奖监控指标表（按小时聚合）',
      indexes: [
        {
          unique: true,
          fields: ['lottery_campaign_id', 'hour_bucket'],
          name: 'uk_campaign_hour'
        },
        {
          fields: ['hour_bucket'],
          name: 'idx_hourly_metrics_hour'
        },
        {
          fields: ['lottery_campaign_id'],
          name: 'idx_hourly_metrics_campaign'
        },
        {
          fields: ['empty_rate'],
          name: 'idx_hourly_metrics_empty_rate'
        }
      ]
    }
  )

  return LotteryHourlyMetrics
}

module.exports = initModel
module.exports.LotteryHourlyMetrics = LotteryHourlyMetrics

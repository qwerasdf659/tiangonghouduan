'use strict'

/**
 * LotteryDailyMetrics 模型
 *
 * 抽奖日报统计表（按日聚合），用于长期历史分析和运营决策。
 *
 * 核心业务场景：
 * 1. 长期历史数据分析（支持年度对比）
 * 2. 运营日报生成（每日凌晨自动聚合）
 * 3. 活动效果评估（跨天趋势分析）
 *
 * 数据流向：
 * - 写入：定时任务每日凌晨 01:00 从 lottery_hourly_metrics 聚合
 * - 读取：历史报表、长期趋势分析、年度运营总结
 *
 * 设计原则：
 * - 日级粒度，永久保留
 * - 从小时级数据汇总计算
 * - 支持跨活动对比分析
 *
 * @module models/LotteryDailyMetrics
 * @author 抽奖策略引擎监控方案实施
 * @since 2026-01-21
 */

const { Model, DataTypes, Op } = require('sequelize')

/**
 * 抽奖日报统计模型
 *
 * 存储按日聚合的抽奖监控指标
 *
 * @class LotteryDailyMetrics
 * @extends Model
 */
class LotteryDailyMetrics extends Model {
  /**
   * 模型关联定义
   *
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  static associate(models) {
    // 关联活动表
    LotteryDailyMetrics.belongsTo(models.LotteryCampaign, {
      foreignKey: 'campaign_id',
      as: 'campaign',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    })
  }

  /**
   * 查找或创建某天的日报记录
   *
   * @param {number} campaign_id - 活动ID
   * @param {Date|string} metric_date - 统计日期（YYYY-MM-DD）
   * @param {Object} options - 可选参数（如 transaction）
   * @returns {Promise<LotteryDailyMetrics>} 日报记录
   */
  static async findOrCreateDaily(campaign_id, metric_date, options = {}) {
    // 标准化日期格式（转为 YYYY-MM-DD）
    const normalized_date =
      typeof metric_date === 'string'
        ? metric_date.slice(0, 10)
        : metric_date.toISOString().slice(0, 10)

    const [metrics, _created] = await this.findOrCreate({
      where: { campaign_id, metric_date: normalized_date },
      defaults: {
        campaign_id,
        metric_date: normalized_date,
        total_draws: 0,
        unique_users: 0,
        high_tier_count: 0,
        mid_tier_count: 0,
        low_tier_count: 0,
        fallback_tier_count: 0,
        empty_count: 0,
        total_budget_consumed: 0,
        avg_budget_per_draw: 0,
        total_prize_value: 0,
        b0_count: 0,
        b1_count: 0,
        b2_count: 0,
        b3_count: 0,
        pity_trigger_count: 0,
        anti_empty_trigger_count: 0,
        anti_high_trigger_count: 0,
        luck_debt_trigger_count: 0,
        empty_rate: 0,
        high_value_rate: 0,
        avg_prize_value: 0
      },
      ...options
    })
    return metrics
  }

  /**
   * 获取活动的时间范围内日报
   *
   * @param {number} campaign_id - 活动ID
   * @param {Date|string} start_date - 开始日期
   * @param {Date|string} end_date - 结束日期
   * @param {Object} options - 可选参数
   * @returns {Promise<Array<LotteryDailyMetrics>>} 日报记录列表
   */
  static async getDailyInRange(campaign_id, start_date, end_date, options = {}) {
    // 标准化日期格式
    const start =
      typeof start_date === 'string'
        ? start_date.slice(0, 10)
        : start_date.toISOString().slice(0, 10)
    const end =
      typeof end_date === 'string' ? end_date.slice(0, 10) : end_date.toISOString().slice(0, 10)

    return this.findAll({
      where: {
        campaign_id,
        metric_date: {
          [Op.gte]: start,
          [Op.lte]: end
        }
      },
      order: [['metric_date', 'ASC']],
      ...options
    })
  }

  /**
   * 获取最近 N 天的日报
   *
   * @param {number} campaign_id - 活动ID
   * @param {number} days - 天数
   * @param {Object} options - 可选参数
   * @returns {Promise<Array<LotteryDailyMetrics>>} 日报记录列表
   */
  static async getRecentDailyMetrics(campaign_id, days = 30, options = {}) {
    const start_date = new Date()
    start_date.setDate(start_date.getDate() - days)
    const formatted_start = start_date.toISOString().slice(0, 10)

    return this.findAll({
      where: {
        campaign_id,
        metric_date: {
          [Op.gte]: formatted_start
        }
      },
      order: [['metric_date', 'DESC']],
      ...options
    })
  }

  /**
   * 从小时级数据聚合生成日报
   *
   * @param {number} campaign_id - 活动ID
   * @param {Date|string} target_date - 目标日期
   * @param {Array<Object>} hourly_data - 当天的小时级数据数组
   * @param {Object} options - 可选参数（如 transaction）
   * @returns {Promise<LotteryDailyMetrics>} 创建或更新后的日报记录
   */
  static async aggregateFromHourly(campaign_id, target_date, hourly_data, options = {}) {
    // 标准化日期
    const normalized_date =
      typeof target_date === 'string'
        ? target_date.slice(0, 10)
        : target_date.toISOString().slice(0, 10)

    // 计算聚合值
    const aggregated = {
      total_draws: 0,
      unique_users: 0,
      high_tier_count: 0,
      mid_tier_count: 0,
      low_tier_count: 0,
      fallback_tier_count: 0,
      empty_count: 0, // 真正空奖次数（与 fallback 保底分开统计）
      total_budget_consumed: 0,
      total_prize_value: 0,
      b0_count: 0,
      b1_count: 0,
      b2_count: 0,
      b3_count: 0,
      pity_trigger_count: 0,
      anti_empty_trigger_count: 0,
      anti_high_trigger_count: 0,
      luck_debt_trigger_count: 0
    }

    // 累加小时级数据
    for (const hourly of hourly_data) {
      aggregated.total_draws += hourly.total_draws || 0
      aggregated.unique_users += hourly.unique_users || 0
      aggregated.high_tier_count += hourly.high_tier_count || 0
      aggregated.mid_tier_count += hourly.mid_tier_count || 0
      aggregated.low_tier_count += hourly.low_tier_count || 0
      aggregated.fallback_tier_count += hourly.fallback_tier_count || 0
      aggregated.empty_count += hourly.empty_count || 0 // 真正空奖次数
      aggregated.total_budget_consumed += parseFloat(hourly.total_budget_consumed) || 0
      aggregated.total_prize_value += parseFloat(hourly.total_prize_value) || 0
      aggregated.b0_count += hourly.b0_tier_count || 0
      aggregated.b1_count += hourly.b1_tier_count || 0
      aggregated.b2_count += hourly.b2_tier_count || 0
      aggregated.b3_count += hourly.b3_tier_count || 0
      aggregated.pity_trigger_count += hourly.pity_triggered_count || 0
      aggregated.anti_empty_trigger_count += hourly.anti_empty_triggered_count || 0
      aggregated.anti_high_trigger_count += hourly.anti_high_triggered_count || 0
      aggregated.luck_debt_trigger_count += hourly.luck_debt_triggered_count || 0
    }

    // 计算派生指标
    const total = aggregated.total_draws || 1
    aggregated.avg_budget_per_draw = aggregated.total_budget_consumed / total
    // empty_rate 使用真正空奖数（empty_count），而非保底奖品数（fallback_tier_count）
    aggregated.empty_rate = aggregated.empty_count / total
    aggregated.high_value_rate = aggregated.high_tier_count / total
    aggregated.avg_prize_value = aggregated.total_prize_value / total

    // 使用 upsert 更新或创建
    const [record, _created] = await this.upsert(
      {
        campaign_id,
        metric_date: normalized_date,
        ...aggregated,
        aggregated_at: new Date()
      },
      { ...options }
    )

    return record
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
   * 检查是否需要预警（空奖率过高）
   *
   * @param {number} threshold - 空奖率阈值（默认 0.6 = 60%）
   * @returns {boolean} 是否需要预警
   */
  needsEmptyRateAlert(threshold = 0.6) {
    return this.getEmptyRate() > threshold && this.total_draws >= 100
  }

  /**
   * 获取预算档位分布
   *
   * @returns {Object} 各档位占比
   */
  getBudgetTierDistribution() {
    const total = this.total_draws || 1
    return {
      b0_rate: this.b0_count / total,
      b1_rate: this.b1_count / total,
      b2_rate: this.b2_count / total,
      b3_rate: this.b3_count / total
    }
  }

  /**
   * 获取奖品档位分布
   *
   * @returns {Object} 各档位占比
   */
  getPrizeTierDistribution() {
    const total = this.total_draws || 1
    return {
      high_rate: this.high_tier_count / total,
      mid_rate: this.mid_tier_count / total,
      low_rate: this.low_tier_count / total,
      fallback_rate: this.fallback_tier_count / total
    }
  }
}

/**
 * 模型初始化函数
 * @param {Sequelize} sequelize - Sequelize 实例
 * @returns {LotteryDailyMetrics} 模型类
 */
function initModel(sequelize) {
  LotteryDailyMetrics.init(
    {
      /**
       * 日报指标ID - 主键（自增）
       */
      daily_metric_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '日报指标记录ID（自增主键）'
      },

      /**
       * 活动ID
       */
      campaign_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '活动ID（外键关联lottery_campaigns.campaign_id）',
        references: {
          model: 'lottery_campaigns',
          key: 'campaign_id'
        }
      },

      /**
       * 统计日期
       */
      metric_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: '统计日期（格式: YYYY-MM-DD，北京时间）'
      },

      // ========== 基础抽奖统计 ==========

      total_draws: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '当日总抽奖次数（从小时级汇总）'
      },

      unique_users: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '当日参与抽奖的唯一用户数'
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
        type: DataTypes.DECIMAL(20, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '当日总预算消耗（积分）',
        /**
         * 获取总预算消耗（自动转换为浮点数）
         * @returns {number} 总预算消耗
         */
        get() {
          const value = this.getDataValue('total_budget_consumed')
          return value !== null ? parseFloat(value) : 0
        }
      },

      avg_budget_per_draw: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '当日平均单次消耗（积分）',
        /**
         * 获取平均每次抽奖消耗（自动转换为浮点数）
         * @returns {number} 平均单次消耗
         */
        get() {
          const value = this.getDataValue('avg_budget_per_draw')
          return value !== null ? parseFloat(value) : 0
        }
      },

      total_prize_value: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '当日发放的总奖品价值（积分）',
        /**
         * 获取总奖品价值（自动转换为浮点数）
         * @returns {number} 总奖品价值
         */
        get() {
          const value = this.getDataValue('total_prize_value')
          return value !== null ? parseFloat(value) : 0
        }
      },

      // ========== 预算分层分布（B0-B3） ==========

      b0_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'B0档位（无预算）用户抽奖次数'
      },

      b1_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'B1档位（低预算≤100）用户抽奖次数'
      },

      b2_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'B2档位（中预算101-500）用户抽奖次数'
      },

      b3_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'B3档位（高预算>500）用户抽奖次数'
      },

      // ========== 体验机制统计 ==========

      pity_trigger_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Pity系统（保底）触发总次数'
      },

      anti_empty_trigger_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'AntiEmpty（反连空）触发次数'
      },

      anti_high_trigger_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'AntiHigh（反连高）触发次数'
      },

      luck_debt_trigger_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '运气债务补偿触发次数'
      },

      // ========== 计算指标 ==========

      empty_rate: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0,
        comment: '当日空奖率（0.0000-1.0000）',
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
        comment: '当日高价值率（0.0000-1.0000）',
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
        comment: '当日平均奖品价值（积分）',
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
      modelName: 'LotteryDailyMetrics',
      tableName: 'lottery_daily_metrics',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '抽奖日报统计表（按日聚合，永久保留）',
      indexes: [
        {
          unique: true,
          fields: ['campaign_id', 'metric_date'],
          name: 'uk_daily_campaign_date'
        },
        {
          fields: ['metric_date'],
          name: 'idx_daily_metrics_date'
        },
        {
          fields: ['campaign_id'],
          name: 'idx_daily_metrics_campaign'
        },
        {
          fields: ['empty_rate'],
          name: 'idx_daily_metrics_empty_rate'
        }
      ]
    }
  )

  return LotteryDailyMetrics
}

module.exports = initModel
module.exports.LotteryDailyMetrics = LotteryDailyMetrics

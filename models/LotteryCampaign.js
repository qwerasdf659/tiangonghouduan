/**
 * 🔥 抽奖活动配置模型 - 全新分离式架构
 * 创建时间：2025年08月19日 UTC
 * 特点：智能抽奖管理 + 动态概率控制 + 完整的活动生命周期
 * 描述：管理抽奖活动的完整配置，支持多种抽奖类型和概率算法
 */

'use strict'
const BeijingTimeHelper = require('../utils/timeHelper')

const { Model, DataTypes } = require('sequelize')

/**
 * 抽奖活动配置模型
 * 职责：管理抽奖活动的完整生命周期，包括配置、概率、奖品分布等
 * 设计模式：策略模式 + 状态机模式
 */
class LotteryCampaign extends Model {
  /**
   * 静态关联定义
   * @param {Object} models - 所有模型的引用
   */
  static associate (models) {
    // 一对多：一个活动有多个奖品
    LotteryCampaign.hasMany(models.LotteryPrize, {
      foreignKey: 'campaign_id',
      as: 'prizes',
      onDelete: 'CASCADE',
      comment: '活动奖品'
    })

    // 一对多：一个活动有多个抽奖记录
    LotteryCampaign.hasMany(models.LotteryDraw, {
      foreignKey: 'campaign_id',
      as: 'draws',
      onDelete: 'CASCADE',
      comment: '抽奖记录'
    })

    /*
     * 🔥 LotteryRecord已合并到LotteryDraw，使用draws关联即可
     * 注意：新合并模型中lottery_id字段对应campaign_id关联
     */

    // 🗑️ 关联业务事件已删除 - BusinessEvent模型已删除 - 2025年01月21日
  }

  /**
   * 获取活动类型的友好显示名称
   * @returns {string} 显示名称
   */
  getCampaignTypeName () {
    const typeNames = {
      daily: '每日抽奖',
      weekly: '每周抽奖',
      event: '活动抽奖',
      permanent: '常驻抽奖'
    }
    return typeNames[this.campaign_type] || '未知类型'
  }

  /**
   * 获取活动状态的友好显示名称
   * @returns {string} 显示名称
   */
  getStatusName () {
    const statusNames = {
      draft: '草稿',
      active: '进行中',
      paused: '已暂停',
      ended: '已结束',
      cancelled: '已取消'
    }
    return statusNames[this.status] || '未知状态'
  }

  /**
   * 检查活动是否正在进行中
   * @returns {boolean} 是否进行中
   */
  isActive () {
    const now = BeijingTimeHelper.createBeijingTime()
    const startTime = new Date(this.start_time)
    const endTime = new Date(this.end_time)
    return this.status === 'active' && startTime <= now && endTime >= now
  }

  /**
   * 检查活动是否即将开始
   * @returns {boolean} 是否即将开始
   */
  isUpcoming () {
    const now = BeijingTimeHelper.createBeijingTime()
    return this.status === 'active' && this.start_time > now
  }

  /**
   * 检查活动是否已结束
   * @returns {boolean} 是否已结束
   */
  isEnded () {
    const now = BeijingTimeHelper.createBeijingTime()
    return this.status === 'ended' || this.end_time < now
  }

  /**
   * 获取活动剩余时间（分钟）
   * @returns {number|null} 剩余分钟数，null表示已结束
   */
  getRemainingTimeMinutes () {
    if (this.isEnded()) return null

    const now = BeijingTimeHelper.createBeijingTime()
    const endTime = new Date(this.end_time)
    const diffMs = endTime - now

    return Math.max(0, Math.floor(diffMs / (1000 * 60)))
  }

  /**
   * 获取活动进度百分比
   * @returns {number} 进度百分比 (0-100)
   */
  getProgress () {
    const now = BeijingTimeHelper.createBeijingTime()
    const startTime = new Date(this.start_time)
    const endTime = new Date(this.end_time)

    if (now < startTime) return 0
    if (now > endTime) return 100

    const totalDuration = endTime - startTime
    const elapsed = now - startTime

    return Math.min(100, Math.max(0, (elapsed / totalDuration) * 100))
  }

  /**
   * 检查用户是否可以参与抽奖
   * @param {number} user_id - 用户ID
   * @param {number} userDrawsToday - 用户今日已抽奖次数
   * @param {number} userDrawsTotal - 用户总抽奖次数
   * @returns {Object} 检查结果
   */
  canUserParticipate (user_id, userDrawsToday = 0, userDrawsTotal = 0) {
    const issues = []

    // 检查活动状态
    if (!this.isActive()) {
      issues.push({
        code: 'CAMPAIGN_NOT_ACTIVE',
        message: '活动未在进行中',
        level: 'error'
      })
    }

    // 检查每日限制
    if (userDrawsToday >= this.max_draws_per_user_daily) {
      issues.push({
        code: 'DAILY_LIMIT_EXCEEDED',
        message: `每日最多可抽奖${this.max_draws_per_user_daily}次`,
        level: 'error'
      })
    }

    // 检查总限制
    if (this.max_draws_per_user_total && userDrawsTotal >= this.max_draws_per_user_total) {
      issues.push({
        code: 'TOTAL_LIMIT_EXCEEDED',
        message: `活动期间最多可抽奖${this.max_draws_per_user_total}次`,
        level: 'error'
      })
    }

    // 检查奖池余额
    if (this.remaining_prize_pool <= 0) {
      issues.push({
        code: 'PRIZE_POOL_EMPTY',
        message: '奖池已空',
        level: 'warning'
      })
    }

    return {
      can_participate: issues.filter(i => i.level === 'error').length === 0,
      issues,
      remaining_draws_today: Math.max(0, this.max_draws_per_user_daily - userDrawsToday),
      remaining_draws_total: this.max_draws_per_user_total
        ? Math.max(0, this.max_draws_per_user_total - userDrawsTotal)
        : null
    }
  }

  /**
   * 计算抽奖成本是否足够
   * @param {number} userPoints - 用户积分余额
   * @returns {Object} 成本检查结果
   */
  checkDrawCost (userPoints) {
    const cost = parseFloat(this.cost_per_draw)

    return {
      can_afford: userPoints >= cost,
      cost,
      user_points: userPoints,
      shortage: Math.max(0, cost - userPoints)
    }
  }

  /**
   * 获取奖池统计信息
   * @returns {Object} 奖池统计
   */
  getPrizePoolStats () {
    const totalPool = parseFloat(this.total_prize_pool)
    const remainingPool = parseFloat(this.remaining_prize_pool)
    const consumedPool = totalPool - remainingPool

    return {
      total: totalPool,
      remaining: remainingPool,
      consumed: consumedPool,
      consumption_rate: totalPool > 0 ? (consumedPool / totalPool) * 100 : 0,
      is_depleted: remainingPool <= 0
    }
  }

  /**
   * 获取参与统计信息
   * @returns {Object} 参与统计
   */
  getParticipationStats () {
    const winRate = this.total_draws > 0 ? (this.total_prizes_awarded / this.total_draws) * 100 : 0

    return {
      total_participants: this.total_participants,
      total_draws: this.total_draws,
      total_prizes_awarded: this.total_prizes_awarded,
      win_rate: winRate,
      avg_draws_per_participant:
        this.total_participants > 0 ? this.total_draws / this.total_participants : 0
    }
  }

  /**
   * 更新活动统计信息
   * @param {Object} stats - 统计更新数据
   */
  async updateStats (stats) {
    const updates = {}

    if (stats.new_participant) {
      updates.total_participants = this.total_participants + 1
    }

    if (stats.new_draw) {
      updates.total_draws = this.total_draws + 1
    }

    if (stats.new_prize) {
      updates.total_prizes_awarded = this.total_prizes_awarded + 1
      if (stats.prize_value) {
        updates.remaining_prize_pool = Math.max(0, this.remaining_prize_pool - stats.prize_value)
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.update(updates)
    }
  }

  /**
   * 获取活动健康状态
   * @returns {Object} 健康状态
   */
  getHealthStatus () {
    const issues = []
    const warnings = []

    // 检查活动配置
    if (
      !this.prize_distribution_config ||
      Object.keys(this.prize_distribution_config).length === 0
    ) {
      issues.push({
        type: 'config_missing',
        message: '缺少奖品分布配置'
      })
    }

    // 检查时间配置
    if (this.start_time >= this.end_time) {
      issues.push({
        type: 'time_config_invalid',
        message: '活动开始时间不能晚于结束时间'
      })
    }

    // 检查奖池状态
    const poolStats = this.getPrizePoolStats()
    if (poolStats.is_depleted && this.isActive()) {
      warnings.push({
        type: 'prize_pool_depleted',
        message: '奖池已耗尽但活动仍在进行'
      })
    }

    // 检查参与率
    const participationStats = this.getParticipationStats()
    if (this.isActive() && participationStats.win_rate > 90) {
      warnings.push({
        type: 'high_win_rate',
        message: '中奖率过高，可能影响活动效果'
      })
    }

    return {
      is_healthy: issues.length === 0,
      issues,
      warnings,
      health_score: Math.max(0, 100 - issues.length * 30 - warnings.length * 10)
    }
  }

  /**
   * 生成活动摘要
   * @returns {Object} 活动摘要
   */
  toSummary () {
    const poolStats = this.getPrizePoolStats()
    const participationStats = this.getParticipationStats()
    const healthStatus = this.getHealthStatus()

    return {
      campaign_id: this.campaign_id,
      basic_info: {
        name: this.campaign_name,
        code: this.campaign_code,
        type: this.campaign_type,
        type_name: this.getCampaignTypeName(),
        status: this.status,
        status_name: this.getStatusName()
      },
      timing: {
        start_time: this.start_time,
        end_time: this.end_time,
        is_active: this.isActive(),
        is_upcoming: this.isUpcoming(),
        is_ended: this.isEnded(),
        remaining_minutes: this.getRemainingTimeMinutes(),
        progress_percent: this.getProgress()
      },
      participation: {
        cost_per_draw: parseFloat(this.cost_per_draw),
        max_draws_daily: this.max_draws_per_user_daily,
        max_draws_total: this.max_draws_per_user_total,
        stats: participationStats
      },
      prize_pool: poolStats,
      health: healthStatus,
      created_at: this.created_at,
      updated_at: this.updated_at
    }
  }

  /**
   * 静态方法：获取活跃的活动列表
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 活跃活动列表
   */
  static async getActiveCampaigns (options = {}) {
    const { limit = 10 } = options
    const now = BeijingTimeHelper.createBeijingTime()

    const whereClause = {
      status: 'active',
      start_time: { [this.sequelize.Sequelize.Op.lte]: now },
      end_time: { [this.sequelize.Sequelize.Op.gte]: now }
    }

    return await this.findAll({
      where: whereClause,
      order: [['start_time', 'ASC']],
      limit,
      include: ['prizes']
    })
  }

  /**
   * 静态方法：批量更新活动状态
   * @returns {Promise<Object>} 更新结果
   */
  static async batchUpdateStatus () {
    const now = BeijingTimeHelper.createBeijingTime()

    // 自动开始符合条件的活动
    const startResult = await this.update(
      { status: 'active' },
      {
        where: {
          status: 'draft',
          start_time: { [this.sequelize.Sequelize.Op.lte]: now },
          end_time: { [this.sequelize.Sequelize.Op.gte]: now }
        }
      }
    )

    // 自动结束过期的活动
    const endResult = await this.update(
      { status: 'ended' },
      {
        where: {
          status: 'active',
          end_time: { [this.sequelize.Sequelize.Op.lt]: now }
        }
      }
    )

    return {
      started: startResult[0],
      ended: endResult[0],
      timestamp: now
    }
  }
}

/**
 * 模型初始化
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {LotteryCampaign} 初始化后的模型
 */
module.exports = sequelize => {
  LotteryCampaign.init(
    {
      campaign_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '活动唯一标识'
      },
      campaign_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '活动名称'
      },
      campaign_code: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '活动代码(唯一)'
      },
      campaign_type: {
        type: DataTypes.ENUM('daily', 'weekly', 'event', 'permanent'),
        allowNull: false,
        comment: '活动类型'
      },
      cost_per_draw: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '每次抽奖消耗积分',
        get () {
          const value = this.getDataValue('cost_per_draw')
          return value ? parseFloat(value) : 0
        }
      },
      max_draws_per_user_daily: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '每用户每日最大抽奖次数'
      },
      max_draws_per_user_total: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '每用户总最大抽奖次数'
      },
      total_prize_pool: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '总奖池价值',
        get () {
          const value = this.getDataValue('total_prize_pool')
          return value ? parseFloat(value) : 0
        }
      },
      remaining_prize_pool: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '剩余奖池价值',
        get () {
          const value = this.getDataValue('remaining_prize_pool')
          return value ? parseFloat(value) : 0
        }
      },
      prize_distribution_config: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '奖品分布配置'
      },
      start_time: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '活动开始时间'
      },
      end_time: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '活动结束时间'
      },
      daily_reset_time: {
        type: DataTypes.TIME,
        allowNull: false,
        defaultValue: '00:00:00',
        comment: '每日重置时间'
      },
      banner_image_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '活动横幅图片'
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '活动描述'
      },
      rules_text: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '活动规则说明'
      },
      status: {
        type: DataTypes.ENUM('draft', 'active', 'paused', 'completed'),
        allowNull: false,
        defaultValue: 'draft',
        comment: '活动状态'
      },
      total_participants: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总参与人数'
      },
      total_draws: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总抽奖次数'
      },
      total_prizes_awarded: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总中奖次数'
      }
    },
    {
      sequelize,
      modelName: 'LotteryCampaign',
      tableName: 'lottery_campaigns',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      comment: '抽奖活动配置表',
      indexes: [
        { fields: ['campaign_code'], unique: true, name: 'unique_campaign_code' },
        { fields: ['status'], name: 'idx_lc_status' },
        { fields: ['campaign_type'], name: 'idx_lc_campaign_type' },
        { fields: ['start_time', 'end_time'], name: 'idx_lc_time_range' }
      ]
    }
  )

  return LotteryCampaign
}

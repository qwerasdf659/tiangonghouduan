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
   * 业务关系：抽奖活动关联奖品、抽奖记录
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate(models) {
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

    // 🔴 统一抽奖架构新增关联（2026-01-18）

    // 一对多：一个活动有多个档位规则
    LotteryCampaign.hasMany(models.LotteryTierRule, {
      foreignKey: 'campaign_id',
      as: 'tierRules',
      onDelete: 'CASCADE',
      comment: '档位规则（tier_first选奖方法使用）'
    })

    // 一对多：一个活动有多个用户配额记录
    LotteryCampaign.hasMany(models.LotteryCampaignUserQuota, {
      foreignKey: 'campaign_id',
      as: 'userQuotas',
      onDelete: 'CASCADE',
      comment: '用户配额（pool_quota预算模式使用）'
    })

    // 一对多：一个活动有多个配额赠送记录
    LotteryCampaign.hasMany(models.LotteryCampaignQuotaGrant, {
      foreignKey: 'campaign_id',
      as: 'quotaGrants',
      onDelete: 'CASCADE',
      comment: '配额赠送记录'
    })

    // 一对多：一个活动有多个库存欠账记录
    LotteryCampaign.hasMany(models.PresetInventoryDebt, {
      foreignKey: 'campaign_id',
      as: 'inventoryDebts',
      onDelete: 'RESTRICT',
      comment: '库存欠账（禁止删除有欠账的活动）'
    })

    // 一对多：一个活动有多个预算欠账记录
    LotteryCampaign.hasMany(models.PresetBudgetDebt, {
      foreignKey: 'campaign_id',
      as: 'budgetDebts',
      onDelete: 'RESTRICT',
      comment: '预算欠账（禁止删除有欠账的活动）'
    })

    // 一对一：一个活动有一个欠账上限配置
    LotteryCampaign.hasOne(models.PresetDebtLimit, {
      foreignKey: 'campaign_id',
      as: 'debtLimit',
      onDelete: 'CASCADE',
      comment: '欠账上限配置'
    })

    // 多对一：档位降级保底奖品
    LotteryCampaign.belongsTo(models.LotteryPrize, {
      foreignKey: 'tier_fallback_prize_id',
      as: 'tierFallbackPrize',
      onDelete: 'SET NULL',
      comment: '档位降级保底奖品（必须是prize_value_points=0的空奖）'
    })

    /*
     * 🔥 LotteryRecord已合并到LotteryDraw，使用draws关联即可
     * 注意：新合并模型中lottery_id字段对应campaign_id关联
     */
  }

  /**
   * 获取活动类型的友好显示名称
   * @returns {string} 显示名称
   */
  getCampaignTypeName() {
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
  getStatusName() {
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
  isActive() {
    const now = BeijingTimeHelper.createBeijingTime()
    const startTime = new Date(this.start_time)
    const endTime = new Date(this.end_time)
    return this.status === 'active' && startTime <= now && endTime >= now
  }

  /**
   * 检查活动是否即将开始
   * @returns {boolean} 是否即将开始
   */
  isUpcoming() {
    const now = BeijingTimeHelper.createBeijingTime()
    return this.status === 'active' && this.start_time > now
  }

  /**
   * 检查活动是否已结束
   * @returns {boolean} 是否已结束
   */
  isEnded() {
    const now = BeijingTimeHelper.createBeijingTime()
    return this.status === 'ended' || this.end_time < now
  }

  /**
   * 获取活动剩余时间（分钟）
   * @returns {number|null} 剩余分钟数，null表示已结束
   */
  getRemainingTimeMinutes() {
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
  getProgress() {
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
  canUserParticipate(user_id, userDrawsToday = 0, userDrawsTotal = 0) {
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
  checkDrawCost(userPoints) {
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
  getPrizePoolStats() {
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
  getParticipationStats() {
    // V4.0语义更新：high_tier_rate 替代 win_rate
    const highTierRate =
      this.total_draws > 0 ? (this.total_prizes_awarded / this.total_draws) * 100 : 0

    return {
      total_participants: this.total_participants,
      total_draws: this.total_draws,
      total_prizes_awarded: this.total_prizes_awarded,
      high_tier_rate: highTierRate,
      avg_draws_per_participant:
        this.total_participants > 0 ? this.total_draws / this.total_participants : 0
    }
  }

  // ==================== 预算积分相关方法（BUDGET_POINTS 架构） ====================

  /**
   * 检查活动是否使用用户预算模式
   * @returns {boolean} 是否使用用户预算
   */
  isUserBudgetMode() {
    return this.budget_mode === 'user'
  }

  /**
   * 检查活动是否使用活动池预算模式
   * @returns {boolean} 是否使用活动池预算
   */
  isPoolBudgetMode() {
    return this.budget_mode === 'pool'
  }

  /**
   * 检查活动是否无预算限制（测试模式）
   * @returns {boolean} 是否无预算限制
   */
  isNoBudgetMode() {
    return this.budget_mode === 'none'
  }

  /**
   * 检查某个活动来源的预算是否可用于本活动
   * @param {number} source_campaign_id - 预算来源活动ID
   * @returns {boolean} 是否允许使用
   */
  isAllowedBudgetSource(source_campaign_id) {
    // 非用户预算模式，不检查来源
    if (!this.isUserBudgetMode()) {
      return true
    }

    // allowed_campaign_ids 为 null 表示无限制
    if (this.allowed_campaign_ids === null) {
      return true
    }

    // 检查来源活动ID是否在允许列表中
    const allowedIds = Array.isArray(this.allowed_campaign_ids) ? this.allowed_campaign_ids : []

    return allowedIds.includes(source_campaign_id)
  }

  /**
   * 获取活动池预算统计（仅 budget_mode=pool 时有意义）
   * @returns {Object} 预算统计
   */
  getPoolBudgetStats() {
    if (!this.isPoolBudgetMode()) {
      return {
        is_pool_mode: false,
        total: null,
        remaining: null,
        consumed: null,
        consumption_rate: null,
        is_depleted: null
      }
    }

    const total = Number(this.pool_budget_total) || 0
    const remaining = Number(this.pool_budget_remaining) || 0
    const consumed = total - remaining

    return {
      is_pool_mode: true,
      total,
      remaining,
      consumed,
      consumption_rate: total > 0 ? (consumed / total) * 100 : 0,
      is_depleted: remaining <= 0
    }
  }

  /**
   * 检查活动池预算是否足够
   * @param {number} required_amount - 需要的预算金额
   * @returns {Object} 检查结果
   */
  checkPoolBudgetSufficient(required_amount) {
    if (!this.isPoolBudgetMode()) {
      return {
        is_sufficient: true,
        reason: '非活动池预算模式，无需检查'
      }
    }

    const remaining = Number(this.pool_budget_remaining) || 0

    return {
      is_sufficient: remaining >= required_amount,
      remaining,
      required: required_amount,
      shortage: Math.max(0, required_amount - remaining)
    }
  }

  /**
   * 扣减活动池预算（仅 budget_mode=pool 时使用）
   * @param {number} amount - 扣减金额
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<boolean>} 是否扣减成功
   */
  async deductPoolBudget(amount, options = {}) {
    if (!this.isPoolBudgetMode()) {
      return false
    }

    const remaining = Number(this.pool_budget_remaining) || 0
    if (remaining < amount) {
      return false
    }

    await this.update({ pool_budget_remaining: remaining - amount }, options)

    return true
  }

  /**
   * 更新活动统计信息
   * 业务场景：每次抽奖后更新活动的参与人数、抽奖次数、中奖次数、剩余奖池
   * @param {Object} stats - 统计更新数据
   * @param {boolean} [stats.new_participant] - 是否为新参与者
   * @param {boolean} [stats.new_draw] - 是否有新的抽奖
   * @param {boolean} [stats.new_prize] - 是否有新的中奖
   * @param {number} [stats.prize_value] - 中奖奖品价值
   * @returns {Promise<void>} 无返回值
   */
  async updateStats(stats) {
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
  getHealthStatus() {
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

    // 检查高档奖励率（V4.0语义更新）
    const participationStats = this.getParticipationStats()
    if (this.isActive() && participationStats.high_tier_rate > 90) {
      warnings.push({
        type: 'high_tier_rate_warning',
        message: '高档奖励率过高，可能影响活动效果'
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
  toSummary() {
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
        /**
         * 获取每次抽奖消耗积分（自动转换为浮点数）
         * @returns {number} 抽奖消耗积分
         */
        get() {
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
        /**
         * 获取总奖池价值（自动转换为浮点数）
         * @returns {number} 总奖池价值
         */
        get() {
          const value = this.getDataValue('total_prize_pool')
          return value ? parseFloat(value) : 0
        }
      },
      remaining_prize_pool: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '剩余奖池价值',
        /**
         * 获取剩余奖池价值（自动转换为浮点数）
         * @returns {number} 剩余奖池价值
         */
        get() {
          const value = this.getDataValue('remaining_prize_pool')
          return value ? parseFloat(value) : 0
        }
      },
      prize_distribution_config: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '奖品分布配置'
      },
      /**
       * 参与条件配置（JSON格式）
       * @type {Object}
       * @业务含义 存储活动的参与门槛条件，支持多种条件类型组合
       * @数据结构 {"条件类型": {"operator": "运算符", "value": "条件值"}}
       * @业务场景 管理员在Web后台配置，用户端API自动验证
       * @默认值 null（表示无条件限制，所有用户可参与）
       * @example
       * {
       *   "user_points": {"operator": ">=", "value": 100},
       *   "user_type": {"operator": "in", "value": ["vip", "svip"]},
       *   "registration_days": {"operator": ">=", "value": 30},
       *   "consecutive_fail_count": {"operator": ">=", "value": 10}
       * }
       */
      participation_conditions: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        comment: '参与条件配置（JSON格式，NULL表示无条件限制）'
      },
      /**
       * 条件不满足时的错误提示语（JSON格式）
       * @type {Object}
       * @业务含义 为每个条件配置用户友好的错误提示
       * @数据结构 {"条件类型": "提示语"}
       * @业务场景 用户不满足条件时，小程序端显示具体原因和解决建议
       * @用户体验 避免用户疑惑"为什么我不能参与"
       * @example
       * {
       *   "user_points": "您的积分不足100分，快去消费获取积分吧！",
       *   "user_type": "此活动仅限VIP会员参与，升级VIP即可参加",
       *   "registration_days": "注册满30天后才能参与，新用户请先体验其他活动"
       * }
       */
      condition_error_messages: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        comment: '条件错误提示语（JSON格式，提供用户友好的说明）'
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
      /**
       * 预算模式
       * @type {string}
       * @业务含义 控制抽奖时从哪里扣减预算积分（BUDGET_POINTS）
       * @枚举值
       * - user：从用户预算账户扣减（用户自己的 BUDGET_POINTS）
       * - pool：从活动池预算扣减（SYSTEM_CAMPAIGN_POOL 账户）
       * - none：不限制预算（测试用途，生产禁用）
       */
      budget_mode: {
        type: DataTypes.ENUM('user', 'pool', 'none'),
        allowNull: false,
        defaultValue: 'user',
        comment: '预算模式：user=用户预算账户扣减，pool=活动池预算扣减，none=不限制预算（测试用）'
      },

      // ======================== 统一抽奖架构新字段 ========================

      /**
       * 选奖方法
       * @type {string}
       * @业务含义 控制如何从奖品池中选择奖品
       * @枚举值
       * - normalize：归一化方法（传统概率归一化）
       * - fallback：保底方法（概率穷尽时使用保底奖品）
       * - tier_first：先选档位法（推荐，先选档位再选奖品）
       */
      pick_method: {
        type: DataTypes.ENUM('normalize', 'fallback', 'tier_first'),
        allowNull: false,
        defaultValue: 'tier_first',
        comment: '选奖方法：normalize=归一化, fallback=保底, tier_first=先选档位（推荐）'
      },

      /**
       * 档位保底奖品ID
       * @type {number}
       * @业务含义 当所有档位都无可用奖品时，发放此保底奖品
       * @关联 lottery_prizes.prize_id
       * @注意 此奖品应配置为prize_value_points=0的空奖
       */
      tier_fallback_prize_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '档位保底奖品ID（所有档位无货时发放，外键关联lottery_prizes.prize_id）'
      },

      /**
       * 档位权重比例因子
       * @type {number}
       * @业务含义 整数权重制的比例因子，所有档位权重之和必须等于此值
       * @默认值 1,000,000（百万分之一精度）
       * @设计原理 避免浮点精度问题，使用整数权重进行概率计算
       */
      tier_weight_scale: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 1000000,
        comment: '档位权重比例因子（默认1000000，所有档位权重之和必须等于此值）'
      },

      /**
       * 分层解析器版本
       * @type {string}
       * @业务含义 指定使用哪个版本的用户分层配置
       * @关联 config/segment_rules.js 中的配置版本
       * @用途 根据用户特征（VIP等级、新用户等）匹配不同的档位概率规则
       */
      segment_resolver_version: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'v1',
        comment: '分层解析器配置版本号（如v1/v2），匹配config/segment_rules.js中的配置'
      },
      /**
       * 活动池总预算
       * @type {number}
       * @业务含义 仅 budget_mode=pool 时使用，设置活动的预算池上限
       * @场景 运营人员在创建活动时配置，控制活动总体成本
       */
      pool_budget_total: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '活动池总预算（仅 budget_mode=pool 时使用）'
      },
      /**
       * 活动池剩余预算
       * @type {number}
       * @业务含义 仅 budget_mode=pool 时使用，实时记录剩余可用预算
       * @场景 每次抽奖后扣减，当剩余预算不足时只能抽到空奖
       */
      pool_budget_remaining: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: '活动池剩余预算（仅 budget_mode=pool 时使用，实时扣减）'
      },
      /**
       * 允许使用的用户预算来源活动ID列表
       * @type {Array<number>}
       * @业务含义 仅 budget_mode=user 时使用，控制用户哪些活动来源的预算可用于本活动
       * @场景 跨活动预算隔离：活动A充值的预算只能在活动A使用
       * @示例 [1, 2, 3] 表示允许使用来自活动1、2、3的用户预算
       * @注意 null 表示无限制，允许使用所有来源的预算
       */
      allowed_campaign_ids: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        comment: '允许使用的用户预算来源活动ID列表（JSON数组，仅 budget_mode=user 时使用）'
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

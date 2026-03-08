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
      foreignKey: 'lottery_campaign_id',
      as: 'prizes',
      onDelete: 'CASCADE',
      comment: '活动奖品'
    })

    // 一对多：一个活动有多个抽奖记录
    LotteryCampaign.hasMany(models.LotteryDraw, {
      foreignKey: 'lottery_campaign_id',
      as: 'draws',
      onDelete: 'CASCADE',
      comment: '抽奖记录'
    })

    // 🔴 统一抽奖架构新增关联（2026-01-18）

    // 一对多：一个活动有多个档位规则
    LotteryCampaign.hasMany(models.LotteryTierRule, {
      foreignKey: 'lottery_campaign_id',
      as: 'tierRules',
      onDelete: 'CASCADE',
      comment: '档位规则（tier_first选奖方法使用）'
    })

    // 一对多：一个活动有多个用户配额记录
    LotteryCampaign.hasMany(models.LotteryCampaignUserQuota, {
      foreignKey: 'lottery_campaign_id',
      as: 'userQuotas',
      onDelete: 'CASCADE',
      comment: '用户配额（pool_quota预算模式使用）'
    })

    // 一对多：一个活动有多个配额赠送记录
    LotteryCampaign.hasMany(models.LotteryCampaignQuotaGrant, {
      foreignKey: 'lottery_campaign_id',
      as: 'quotaGrants',
      onDelete: 'CASCADE',
      comment: '配额赠送记录'
    })

    // 一对多：一个活动有多个库存欠账记录
    LotteryCampaign.hasMany(models.PresetInventoryDebt, {
      foreignKey: 'lottery_campaign_id',
      as: 'inventoryDebts',
      onDelete: 'RESTRICT',
      comment: '库存欠账（禁止删除有欠账的活动）'
    })

    // 一对多：一个活动有多个预算欠账记录
    LotteryCampaign.hasMany(models.PresetBudgetDebt, {
      foreignKey: 'lottery_campaign_id',
      as: 'budgetDebts',
      onDelete: 'RESTRICT',
      comment: '预算欠账（禁止删除有欠账的活动）'
    })

    /*
     * 注意：PresetDebtLimit 使用多态设计（limit_level + reference_id）
     * 不直接通过 lottery_campaign_id 关联，而是通过:
     *   - limit_level = 'campaign'
     *   - reference_id = lottery_campaign_id
     * 获取活动的欠账上限配置请使用: PresetDebtLimit.getOrCreateForCampaign(lottery_campaign_id)
     */

    /*
     * 档位降级兜底奖品和固定间隔保底奖品已迁移到 lottery_strategy_config 表
     * config_group: tier_fallback / guarantee，通过 DynamicConfigLoader 读取
     */

    /*
     * 🔥 LotteryRecord已合并到LotteryDraw，使用draws关联即可
     * 注意：新合并模型中lottery_campaign_id字段对应活动关联
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
      permanent: '常驻抽奖',
      pool_basic: '基础池抽奖',
      pool_advanced: '进阶池抽奖',
      pool_vip: 'VIP池抽奖',
      pool_newbie: '新手池抽奖'
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
      lottery_campaign_id: this.lottery_campaign_id,
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
      lottery_campaign_id: {
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
        type: DataTypes.ENUM(
          'daily',
          'weekly',
          'event',
          'permanent',
          'pool_basic',
          'pool_advanced',
          'pool_vip',
          'pool_newbie'
        ),
        allowNull: false,
        comment:
          '活动类型: daily=每日/weekly=每周/event=活动/permanent=常驻/pool_basic=基础池/pool_advanced=进阶池/pool_vip=VIP池/pool_newbie=新手池'
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
        type: DataTypes.ENUM('draft', 'active', 'paused', 'ended', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft',
        comment:
          '活动状态: draft=草稿, active=进行中, paused=已暂停, ended=已结束, cancelled=已取消'
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
       *   - tier_first: 先选档位再选奖品（先按 reward_tier 选档位，再按 win_weight 选奖品）
       *   - normalize: 归一化百分比选奖（跳过档位，按 win_probability 归一化随机抽取）
       */
      pick_method: {
        type: DataTypes.ENUM('normalize', 'tier_first'),
        allowNull: false,
        defaultValue: 'tier_first',
        comment: '选奖方法：normalize=归一化百分比选奖, tier_first=先选档位再选奖品'
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

      /*
       * segment_resolver_version / preset_debt_enabled 已迁移到 lottery_strategy_config 表
       * config_group: segment / preset，通过 DynamicConfigLoader 读取
       */

      /**
       * 预设预算扣减策略
       * @type {string}
       * @业务含义 控制预设发放时预算扣减的优先级
       * @枚举值
       * - follow_campaign：遵循budget_mode（默认，推荐）
       * - pool_first：先扣pool后扣user
       * - user_first：先扣user后扣pool
       */
      preset_budget_policy: {
        type: DataTypes.ENUM('follow_campaign', 'pool_first', 'user_first'),
        allowNull: false,
        defaultValue: 'follow_campaign',
        comment:
          '预设预算扣减策略：follow_campaign-遵循budget_mode(默认), pool_first-先pool后user, user_first-先user后pool'
      },

      // ======================== 配额管理字段（pool+quota模式） ========================

      /**
       * 默认用户配额
       * @type {number}
       * @业务含义 pool+quota模式下，按需初始化时分配给新用户的默认配额
       */
      default_quota: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '默认用户配额（pool+quota模式按需初始化时使用）',
        /**
         * 获取默认配额值
         * @returns {number} 配额值
         */
        get() {
          const value = this.getDataValue('default_quota')
          return value ? parseFloat(value) : 0
        }
      },

      /**
       * 配额初始化模式
       * @type {string}
       * @业务含义 控制用户配额何时创建
       * @枚举值
       * - on_demand：按需初始化（用户首次参与时创建配额）
       * - pre_allocated：预分配（管理员批量导入配额）
       */
      quota_init_mode: {
        type: DataTypes.ENUM('on_demand', 'pre_allocated'),
        allowNull: false,
        defaultValue: 'on_demand',
        comment: '配额初始化模式：on_demand-按需初始化(默认), pre_allocated-预分配'
      },

      // ======================== 预留池机制字段 ========================

      /**
       * 公共池剩余预算
       * @type {number}
       * @业务含义 普通用户可用的预算池（预留池模式时使用）
       */
      public_pool_remaining: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: null,
        comment: '公共池剩余预算（普通用户可用，预留池模式时使用）',
        /**
         * 获取公共池剩余预算
         * @returns {number|null} 剩余预算值或null
         */
        get() {
          const value = this.getDataValue('public_pool_remaining')
          return value !== null ? parseFloat(value) : null
        }
      },

      /**
       * 预留池剩余预算
       * @type {number}
       * @业务含义 白名单/VIP专用的预算池（预留池模式时使用）
       */
      reserved_pool_remaining: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: null,
        comment: '预留池剩余预算（白名单专用，预留池模式时使用）',
        /**
         * 获取预留池剩余预算
         * @returns {number|null} 剩余预算值或null
         */
        get() {
          const value = this.getDataValue('reserved_pool_remaining')
          return value !== null ? parseFloat(value) : null
        }
      },

      // ======================== 活动级欠账上限 ========================

      /**
       * 活动预算欠账上限
       * @type {number}
       * @业务含义 该活动允许的最大预算欠账金额，0表示不限制（强烈不推荐）
       */
      max_budget_debt: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '该活动预算欠账上限（0=不限制，强烈不推荐）',
        /**
         * 获取活动预算欠账上限
         * @returns {number} 欠账上限值
         */
        get() {
          const value = this.getDataValue('max_budget_debt')
          return value ? parseFloat(value) : 0
        }
      },

      /**
       * 活动库存欠账数量上限
       * @type {number}
       * @业务含义 该活动允许的最大库存欠账数量，0表示不限制（强烈不推荐）
       */
      max_inventory_debt_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '该活动库存欠账总数量上限（0=不限制，强烈不推荐）'
      },

      /**
       * 每日预算上限
       * @type {number}
       * @业务含义 控制活动每日最大可发放的预算积分
       * @场景 运营后台预算进度监控，当日消耗达到上限时预警
       * @默认值 null（表示不限制每日预算）
       */
      daily_budget_limit: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        defaultValue: null,
        comment: '每日预算上限（积分），NULL表示不限制每日预算',
        /**
         * 获取每日预算上限
         * @returns {number|null} 每日预算上限或null
         */
        get() {
          const value = this.getDataValue('daily_budget_limit')
          return value !== null ? parseFloat(value) : null
        }
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
      },

      // ======================== 前端展示配置字段（多活动抽奖系统） ========================

      /**
       * 前端展示方式（14种玩法）
       * @type {string}
       * @业务含义 控制小程序前端加载哪个玩法子组件
       * @枚举值 grid_3x3/grid_4x4/wheel/card_flip/golden_egg/scratch_card/blind_box/
       *         gashapon/lucky_bag/red_packet/slot_machine/whack_mole/pinball/card_collect/flash_sale
       * @前端效果 前端根据此值动态加载对应子组件（九宫格/转盘/卡牌翻转/...）
       */
      display_mode: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'grid_3x3',
        comment:
          '前端展示方式（14种玩法）: grid_3x3/grid_4x4/wheel/card_flip/golden_egg/scratch_card/blind_box/gashapon/lucky_bag/red_packet/slot_machine/whack_mole/pinball/card_collect/flash_sale'
      },

      /**
       * 网格列数（仅 grid 模式有效）
       * @type {number}
       * @业务含义 控制九宫格的列数，决定奖品格位数量
       * @取值范围 3/4/5
       */
      grid_cols: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
        comment: '网格列数（仅 grid 模式有效）: 3/4/5'
      },

      /**
       * 活动级特效主题（6套主题色，可选）
       * @type {string|null}
       * @业务含义 控制该活动页面的颜色风格，NULL 表示继承全局氛围主题（app_theme）
       * @枚举值 null/default/gold_luxury/purple_mystery/spring_festival/christmas/summer
       * @前端效果 非空时通过CSS变量切换颜色风格；为空时继承全局 app_theme 配置
       */
      effect_theme: {
        type: DataTypes.STRING(30),
        allowNull: true,
        defaultValue: null,
        comment:
          '活动级特效主题: null=继承全局app_theme | default/gold_luxury/purple_mystery/spring_festival/christmas/summer'
      },

      /**
       * 是否启用稀有度光效
       * @type {boolean}
       * @业务含义 开关控制前端是否根据 rarity_code 显示不同颜色光效
       * @前端效果 开启时奖品按 rarity_code 显示蓝色/紫色/橙色/金色光效；关闭时使用硬编码保底样式
       */
      rarity_effects_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用稀有度光效（前端根据 rarity_code 显示不同颜色光效）'
      },

      /**
       * 中奖动画类型
       * @type {string}
       * @业务含义 控制中奖弹窗的揭晓动画方式
       * @枚举值 simple（简单弹窗）/card_flip（卡牌翻转）/fireworks（烟花特效）
       */
      win_animation: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'simple',
        comment: '中奖动画类型: simple（简单弹窗）/card_flip（卡牌翻转）/fireworks（烟花特效）'
      },

      /**
       * 活动背景图URL
       * @type {string|null}
       * @业务含义 运营上传的活动背景图，可选
       * @注意 与 banner_image_url（活动横幅图）用途不同
       */
      background_image_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: null,
        comment: '活动背景图URL（运营上传，可选，与 banner_image_url 横幅图用途不同）'
      }
      /* guarantee_enabled/threshold/prize_id 已迁移到 lottery_strategy_config（guarantee.*） */
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

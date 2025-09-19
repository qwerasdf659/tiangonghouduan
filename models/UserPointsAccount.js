/**
 * 🔥 用户积分账户模型 - 全新分离式架构
 * 创建时间：2025年08月19日 UTC
 * 特点：领域驱动设计 + 高性能索引优化
 * 描述：用户积分账户的完整管理，包含行为分析和智能推荐能力
 */

'use strict'

const { Model, DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper') // 🕐 北京时间工具

/**
 * 用户积分账户模型
 * 职责：管理用户积分余额、等级、行为评分和个性化偏好
 * 设计模式：领域模型模式 + 聚合根
 */
class UserPointsAccount extends Model {
  /**
   * 静态关联定义
   * @param {Object} models - 所有模型的引用
   */
  static associate (models) {
    // 一对多：一个用户只有一个积分账户
    UserPointsAccount.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      comment: '关联用户信息'
    })

    // 一对多：一个账户有多个交易记录
    UserPointsAccount.hasMany(models.PointsTransaction, {
      foreignKey: 'account_id',
      as: 'transactions',
      onDelete: 'CASCADE',
      comment: '积分交易记录'
    })

    // 通过业务事件关联
    UserPointsAccount.hasMany(models.BusinessEvent, {
      foreignKey: 'user_id',
      as: 'businessEvents',
      scope: {
        event_source: 'points_system'
      },
      comment: '相关业务事件'
    })
  }

  /**
   * 获取用户当前等级信息
   * @returns {Object} 等级详情
   */
  getLevelInfo () {
    const levelConfig = {
      bronze: { name: '青铜会员', threshold: 0, bonus: 1.0, color: '#CD7F32' },
      silver: { name: '白银会员', threshold: 1000, bonus: 1.1, color: '#C0C0C0' },
      gold: { name: '黄金会员', threshold: 5000, bonus: 1.2, color: '#FFD700' },
      diamond: { name: '钻石会员', threshold: 20000, bonus: 1.5, color: '#B9F2FF' }
    }

    return levelConfig[this.account_level] || levelConfig.bronze
  }

  /**
   * 计算下一等级所需积分
   * @returns {number|null} 所需积分数，null表示已达到最高等级
   */
  getPointsToNextLevel () {
    const levelThresholds = {
      bronze: 1000,
      silver: 5000,
      gold: 20000,
      diamond: null // 最高等级
    }

    const nextLevelPoints = levelThresholds[this.account_level]
    if (nextLevelPoints === null) return null

    return Math.max(0, nextLevelPoints - this.total_earned)
  }

  /**
   * 检查是否应该升级
   * @returns {string|null} 新等级，null表示无需升级
   */
  checkForLevelUp () {
    const levelUpThresholds = [
      { level: 'diamond', threshold: 20000 },
      { level: 'gold', threshold: 5000 },
      { level: 'silver', threshold: 1000 }
    ]

    for (const { level, threshold } of levelUpThresholds) {
      if (this.total_earned >= threshold && this.account_level !== level) {
        return level
      }
    }

    return null
  }

  /**
   * 计算积分获得加成
   * @param {number} basePoints - 基础积分
   * @returns {number} 加成后的积分
   */
  calculatePointsBonus (basePoints) {
    const levelInfo = this.getLevelInfo()
    const levelBonus = levelInfo.bonus

    // 行为评分加成 (0-100分，最高20%加成)
    const behaviorBonus = Math.min(this.behavior_score / 500, 0.2)

    // 活跃度加成
    const activityBonus =
      {
        low: 0,
        medium: 0.05,
        high: 0.1,
        premium: 0.15
      }[this.activity_level] || 0

    const totalBonus = levelBonus + behaviorBonus + activityBonus
    return Math.round(basePoints * totalBonus)
  }

  /**
   * 更新行为评分
   * @param {string} behaviorType - 行为类型
   * @param {number} impact - 影响程度 (-10 到 +10)
   */
  updateBehaviorScore (behaviorType, impact) {
    // 不同行为的权重
    const behaviorWeights = {
      task_complete: 1.0,
      daily_login: 0.5,
      share_activity: 0.8,
      lottery_participate: 0.6,
      negative_behavior: -2.0
    }

    const weight = behaviorWeights[behaviorType] || 1.0
    const scoreChange = impact * weight

    // 更新评分 (0-100范围)
    this.behavior_score = Math.max(0, Math.min(100, this.behavior_score + scoreChange))
    this.last_behavior_time = new Date()
  }

  /**
   * 更新活跃度等级
   * @param {number} recentActivityCount - 最近活动次数
   */
  updateActivityLevel (recentActivityCount) {
    if (recentActivityCount >= 20) {
      this.activity_level = 'premium'
    } else if (recentActivityCount >= 10) {
      this.activity_level = 'high'
    } else if (recentActivityCount >= 3) {
      this.activity_level = 'medium'
    } else {
      this.activity_level = 'low'
    }
  }

  /**
   * 更新用户偏好标签
   * @param {Array} tags - 偏好标签数组
   */
  updatePreferenceTags (tags) {
    this.preference_tags = {
      tags,
      updated_at: BeijingTimeHelper.apiTimestamp(), // 🕐 北京时间API时间戳
      confidence: 0.8
    }
  }

  /**
   * 检查账户是否健康
   * @returns {Object} 健康状态详情
   */
  checkAccountHealth () {
    const issues = []
    const warnings = []

    // 检查账户是否被冻结
    if (!this.is_active) {
      issues.push({
        type: 'account_frozen',
        message: '账户已被冻结',
        reason: this.freeze_reason
      })
    }

    // 检查行为评分是否过低
    if (this.behavior_score < 20) {
      warnings.push({
        type: 'low_behavior_score',
        message: '行为评分偏低，可能影响积分获得',
        current_score: this.behavior_score
      })
    }

    // 检查最近是否有活动
    const daysSinceLastBehavior = this.last_behavior_time
      ? Math.floor((new Date() - this.last_behavior_time) / (1000 * 60 * 60 * 24))
      : null

    if (daysSinceLastBehavior && daysSinceLastBehavior > 30) {
      warnings.push({
        type: 'inactive_account',
        message: '账户超过30天无活动',
        days_inactive: daysSinceLastBehavior
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
   * 生成个性化推荐数据
   * @returns {Object} 推荐数据
   */
  generateRecommendations () {
    if (!this.recommendation_enabled) {
      return { enabled: false, recommendations: [] }
    }

    const recommendations = []

    // 基于等级的推荐
    const pointsToNext = this.getPointsToNextLevel()
    if (pointsToNext && pointsToNext <= 500) {
      recommendations.push({
        type: 'level_up',
        priority: 'high',
        message: `再获得${pointsToNext}积分即可升级到下一等级`,
        action: 'complete_tasks'
      })
    }

    // 基于活跃度的推荐
    if (this.activity_level === 'low') {
      recommendations.push({
        type: 'activity_boost',
        priority: 'medium',
        message: '增加活跃度可以获得更多积分奖励',
        action: 'daily_tasks'
      })
    }

    // 基于偏好的推荐
    if (this.preference_tags && this.preference_tags.tags) {
      recommendations.push({
        type: 'personalized',
        priority: 'medium',
        message: '为您推荐感兴趣的活动',
        preferences: this.preference_tags.tags
      })
    }

    return {
      enabled: true,
      recommendations,
      generated_at: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
    }
  }

  /**
   * 格式化账户摘要信息
   * @returns {Object} 账户摘要
   */
  toSummary () {
    const levelInfo = this.getLevelInfo()
    const health = this.checkAccountHealth()
    const recommendations = this.generateRecommendations()

    return {
      account_id: this.account_id,
      user_id: this.user_id,
      balance: {
        available: parseFloat(this.available_points),
        total_earned: parseFloat(this.total_earned),
        total_consumed: parseFloat(this.total_consumed)
      },
      level: {
        current: this.account_level,
        info: levelInfo,
        points_to_next: this.getPointsToNextLevel()
      },
      activity: {
        level: this.activity_level,
        behavior_score: parseFloat(this.behavior_score),
        last_behavior: this.last_behavior_time
      },
      health,
      recommendations: recommendations.enabled ? recommendations.recommendations : [],
      is_active: this.is_active,
      created_at: this.created_at,
      updated_at: this.updated_at
    }
  }

  /**
   * 模型验证规则
   */
  static validateAccount (data) {
    const errors = []

    if (data.available_points < 0) {
      errors.push('可用积分不能为负数')
    }

    if (data.total_earned < 0) {
      errors.push('累计获得积分不能为负数')
    }

    if (data.total_consumed < 0) {
      errors.push('累计消耗积分不能为负数')
    }

    if (data.available_points > data.total_earned - data.total_consumed) {
      errors.push('可用积分不能超过应有余额')
    }

    if (data.behavior_score < 0 || data.behavior_score > 100) {
      errors.push('行为评分必须在0-100之间')
    }

    return {
      is_valid: errors.length === 0,
      errors
    }
  }
}

/**
 * 模型初始化
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {UserPointsAccount} 初始化后的模型
 */
module.exports = sequelize => {
  UserPointsAccount.init(
    {
      account_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '账户唯一标识'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        comment: '关联用户ID'
      },
      available_points: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '可用积分余额',
        get () {
          const value = this.getDataValue('available_points')
          return value ? parseFloat(value) : 0
        }
      },
      total_earned: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '累计获得积分',
        get () {
          const value = this.getDataValue('total_earned')
          return value ? parseFloat(value) : 0
        }
      },
      total_consumed: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '累计消耗积分',
        get () {
          const value = this.getDataValue('total_consumed')
          return value ? parseFloat(value) : 0
        }
      },
      last_earn_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后获得积分时间'
      },
      last_consume_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后消耗积分时间'
      },
      account_level: {
        type: DataTypes.ENUM('bronze', 'silver', 'gold', 'diamond'),
        allowNull: false,
        defaultValue: 'bronze',
        comment: '账户等级'
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '账户是否激活'
      },
      freeze_reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '冻结原因'
      },
      behavior_score: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '用户行为评分(0-100)',
        get () {
          const value = this.getDataValue('behavior_score')
          return value ? parseFloat(value) : 0
        }
      },
      activity_level: {
        type: DataTypes.ENUM('low', 'medium', 'high', 'premium'),
        allowNull: false,
        defaultValue: 'medium',
        comment: '活跃度等级'
      },
      preference_tags: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '用户偏好标签JSON'
      },
      last_behavior_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后行为时间'
      },
      recommendation_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用个性化推荐'
      }
    },
    {
      sequelize,
      modelName: 'UserPointsAccount',
      tableName: 'user_points_accounts',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '用户积分账户表',
      indexes: [
        { fields: ['user_id'], unique: true, name: 'unique_user_points_account' },
        { fields: ['available_points'], name: 'idx_upa_available_points' },
        { fields: ['account_level'], name: 'idx_upa_account_level' },
        { fields: ['is_active'], name: 'idx_upa_is_active' },
        { fields: ['behavior_score'], name: 'idx_upa_behavior_score' },
        { fields: ['activity_level'], name: 'idx_upa_activity_level' }
      ]
    }
  )

  return UserPointsAccount
}

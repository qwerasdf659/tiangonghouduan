/**
 * 🔥 用户积分账户模型 - 全新分离式架构
 * 创建时间：2025年08月19日 UTC
 * 特点：领域驱动设计 + 高性能索引优化
 * 描述：用户积分账户的完整管理，专注于积分余额和账户状态管理
 */

'use strict'

const { Model, DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper') // 🕐 北京时间工具

/**
 * 用户积分账户模型
 * 职责：管理用户积分余额和账户状态
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

    // 🗑️ 通过业务事件关联已删除 - BusinessEvent模型已删除 - 2025年01月21日
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
    const recommendations = []

    // 基础推荐：建议用户完成任务获得积分
    recommendations.push({
      type: 'daily_tasks',
      priority: 'medium',
      message: '完成每日任务获得积分奖励',
      action: 'complete_tasks'
    })

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
        { fields: ['is_active'], name: 'idx_upa_is_active' }
      ]
    }
  )

  return UserPointsAccount
}

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
   * @param {Object} models - Sequelize所有模型的集合对象
   * @returns {void} 无返回值，仅定义关联关系
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
   * @returns {Object} 健康状态详情对象
   * @returns {boolean} return.is_healthy - 账户是否健康
   * @returns {Array<Object>} return.issues - 账户问题列表
   * @returns {Array<Object>} return.warnings - 账户警告列表
   * @returns {number} return.health_score - 账户健康分数（0-100）
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
   * @returns {Object} 推荐数据对象
   * @returns {boolean} return.enabled - 推荐功能是否启用
   * @returns {Array<Object>} return.recommendations - 推荐项列表
   * @returns {string} return.generated_at - 推荐数据生成时间（北京时间）
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
   * @returns {Object} 账户摘要对象
   * @returns {number} return.account_id - 账户ID
   * @returns {number} return.user_id - 用户ID
   * @returns {Object} return.balance - 积分余额信息
   * @returns {number} return.balance.available - 可用积分
   * @returns {number} return.balance.total_earned - 累计获得积分
   * @returns {number} return.balance.total_consumed - 累计消耗积分
   * @returns {Object} return.health - 账户健康状态
   * @returns {Array<Object>} return.recommendations - 推荐项列表
   * @returns {boolean} return.is_active - 账户是否激活
   * @returns {Date} return.created_at - 创建时间
   * @returns {Date} return.updated_at - 更新时间
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
   * @param {Object} data - 需要验证的账户数据
   * @param {number} data.available_points - 可用积分
   * @param {number} data.total_earned - 累计获得积分
   * @param {number} data.total_consumed - 累计消耗积分
   * @returns {Object} 验证结果对象 {is_valid: boolean, errors: Array<string>}
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
        comment: '可用积分余额（用户当前可用于兑换、抽奖的积分数量，业务规则：消费奖励审核通过后增加、兑换抽奖时扣除、审核拒绝退回时增加，计算公式：total_earned - total_consumed，范围：≥0，用途：兑换商品、参与抽奖、余额查询、权限判断）',
        /**
         * 获取可用积分的浮点数值
         * @returns {number} 可用积分（浮点数格式）
         */
        get () {
          const value = this.getDataValue('available_points')
          return value ? parseFloat(value) : 0
        }
      },
      total_earned: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '累计获得积分（用户历史累计获得的所有积分，只增不减，业务来源：消费奖励、活动奖励、管理员手动调整，积分规则：1元消费=1积分（四舍五入），用途：用户积分报表、等级判定、统计分析、财务对账）',
        /**
         * 获取累计获得积分的浮点数值
         * @returns {number} 累计获得积分（浮点数格式）
         */
        get () {
          const value = this.getDataValue('total_earned')
          return value ? parseFloat(value) : 0
        }
      },
      total_consumed: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '累计消耗积分（用户历史累计消耗的所有积分，只增不减，业务场景：兑换商品、参与抽奖，用途：用户消费行为分析、积分流水对账、退款凭证计算，业务规则：消费时增加，退款时不减少但available_points增加）',
        /**
         * 获取累计消耗积分的浮点数值
         * @returns {number} 累计消耗积分（浮点数格式）
         */
        get () {
          const value = this.getDataValue('total_consumed')
          return value ? parseFloat(value) : 0
        }
      },
      /**
       * 最后获得积分时间（用于追踪用户最近一次积分收入行为）
       * @type {Date|null}
       */
      last_earn_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后获得积分时间'
      },
      /**
       * 最后消耗积分时间（用于追踪用户最近一次积分支出行为）
       * @type {Date|null}
       */
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
      created_at: 'created_at',
      updated_at: 'updated_at',
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

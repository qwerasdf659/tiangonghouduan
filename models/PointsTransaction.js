/**
 * 🔥 积分交易记录模型 - 全新分离式架构
 * 创建时间：2025年08月19日 UTC
 * 特点：完整的积分变动追踪 + 行为分析能力
 * 描述：记录用户积分的获得、消耗、过期等所有变动，支持事务完整性
 */

'use strict'
const BeijingTimeHelper = require('../utils/timeHelper')

const { Model, DataTypes } = require('sequelize')

/**
 * 积分交易记录模型
 * 职责：记录所有积分变动，确保积分系统的完整性和可追溯性
 * 设计模式：事件溯源模式 + 审计日志模式
 */
class PointsTransaction extends Model {
  /**
   * 静态关联定义
   * 业务关系：积分交易关联用户、积分账户、操作员、消费记录（多态）
   * @param {Object} models - 所有模型的引用
   * @returns {void}
   */
  static associate (models) {
    // 多对一：多个交易记录属于一个用户
    PointsTransaction.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      comment: '关联用户信息'
    })

    // 多对一：多个交易记录属于一个积分账户
    PointsTransaction.belongsTo(models.UserPointsAccount, {
      foreignKey: 'account_id',
      as: 'account',
      comment: '关联积分账户'
    })

    // 可选关联：如果有操作员
    PointsTransaction.belongsTo(models.User, {
      foreignKey: 'operator_id',
      as: 'operator',
      comment: '操作员信息'
    })

    /**
     * 多态关联：关联消费记录（用于消费奖励积分）
     * 通过reference_type和reference_id实现多态关联
     */
    PointsTransaction.belongsTo(models.ConsumptionRecord, {
      foreignKey: 'reference_id',
      constraints: false, // 多态关联不使用外键约束
      as: 'consumption_record',
      scope: {
        reference_type: 'consumption' // 仅关联reference_type为'consumption'的记录
      },
      comment: '关联的消费记录（用于消费奖励积分）'
    })

    // 🗑️ 关联业务事件已删除 - BusinessEvent模型已删除 - 2025年01月21日
  }

  /**
   * 获取交易类型的友好显示名称
   * @returns {string} 显示名称
   */
  getTransactionTypeName () {
    const typeNames = {
      earn: '积分获得',
      consume: '积分消耗',
      expire: '积分过期',
      refund: '积分退还'
    }
    return typeNames[this.transaction_type] || '未知类型'
  }

  /**
   * 获取业务类型的友好显示名称
   * @returns {string} 显示名称
   */
  getBusinessTypeName () {
    const businessNames = {
      task_complete: '任务完成',
      lottery_consume: '抽奖消耗',
      admin_adjust: '管理员调整',
      refund: '退款',
      expire: '积分过期',
      behavior_reward: '行为奖励',
      recommendation_bonus: '推荐奖励',
      activity_bonus: '活动奖励',
      consumption_reward: '消费奖励'
    }
    return businessNames[this.business_type] || '其他'
  }

  /**
   * 检查交易是否为积分增加
   * @returns {boolean} 是否为积分增加
   */
  isPointsIncrease () {
    return this.points_amount > 0
  }

  /**
   * 检查交易是否为积分减少
   * @returns {boolean} 是否为积分减少
   */
  isPointsDecrease () {
    return this.points_amount < 0
  }

  /**
   * 获取积分变化的绝对值
   * @returns {number} 积分变化绝对值
   */
  getAbsoluteAmount () {
    return Math.abs(parseFloat(this.points_amount))
  }

  /**
   * 计算交易对账户余额的影响
   * @returns {Object} 余额影响分析
   */
  getBalanceImpact () {
    const amount = parseFloat(this.points_amount)
    const balanceBefore = parseFloat(this.points_balance_before)
    const balanceAfter = parseFloat(this.points_balance_after)
    const expectedBalance = balanceBefore + amount

    return {
      amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      expected_balance: expectedBalance,
      is_consistent: Math.abs(balanceAfter - expectedBalance) < 0.01, // 允许0.01的浮点误差
      difference: balanceAfter - expectedBalance
    }
  }

  /**
   * 检查交易是否有效
   * @returns {Object} 有效性检查结果
   */
  validateTransaction () {
    const errors = []
    const warnings = []

    // 检查积分金额
    if (this.points_amount === 0) {
      warnings.push('积分变动为0，可能不需要记录此交易')
    }

    // 检查余额一致性
    const balanceImpact = this.getBalanceImpact()
    if (!balanceImpact.is_consistent) {
      errors.push(
        `余额计算不一致：期望${balanceImpact.expected_balance}，实际${balanceImpact.balance_after}`
      )
    }

    // 检查负余额（消耗类交易）
    if (this.transaction_type === 'consume' && balanceImpact.balance_after < 0) {
      errors.push('消耗后余额不能为负数')
    }

    // 检查时间逻辑
    if (this.effective_time && this.effective_time > BeijingTimeHelper.createBeijingTime()) {
      warnings.push('生效时间在未来')
    }

    if (this.expire_time && this.expire_time < BeijingTimeHelper.createBeijingTime()) {
      warnings.push('过期时间已过期')
    }

    return {
      is_valid: errors.length === 0,
      errors,
      warnings,
      validity_score: Math.max(0, 100 - errors.length * 30 - warnings.length * 10)
    }
  }

  /**
   * 生成交易摘要
   * @returns {Object} 交易摘要
   */
  toSummary () {
    const balanceImpact = this.getBalanceImpact()
    const validation = this.validateTransaction()

    return {
      transaction_id: this.transaction_id,
      user_id: this.user_id,
      type: {
        transaction: this.transaction_type,
        business: this.business_type,
        transaction_name: this.getTransactionTypeName(),
        business_name: this.getBusinessTypeName()
      },
      amount: {
        value: parseFloat(this.points_amount),
        absolute: this.getAbsoluteAmount(),
        is_increase: this.isPointsIncrease(),
        is_decrease: this.isPointsDecrease()
      },
      balance: balanceImpact,
      timing: {
        transaction_time: this.transaction_time,
        effective_time: this.effective_time,
        expire_time: this.expire_time
      },
      description: {
        title: this.transaction_title,
        description: this.transaction_description
      },
      validation,
      status: this.status,
      created_at: this.created_at
    }
  }

  /**
   * 格式化显示信息
   * @returns {string} 显示信息
   */
  toDisplayString () {
    const typeName = this.getTransactionTypeName()
    const businessName = this.getBusinessTypeName()
    const amount = this.getAbsoluteAmount()
    const sign = this.isPointsIncrease() ? '+' : '-'

    return `${typeName}(${businessName}) ${sign}${amount}积分 - ${this.transaction_title}`
  }

  /**
   * 静态方法：批量验证交易记录
   * @param {Array} transactions - 交易记录数组
   * @returns {Object} 批量验证结果
   */
  static batchValidate (transactions) {
    const results = transactions.map(transaction => ({
      transaction_id: transaction.transaction_id,
      validation: transaction.validateTransaction()
    }))

    const validCount = results.filter(r => r.validation.is_valid).length
    const invalidCount = results.length - validCount

    return {
      total: results.length,
      valid: validCount,
      invalid: invalidCount,
      validation_rate: validCount / results.length,
      results
    }
  }

  /**
   * 静态方法：分析交易趋势
   * @param {Array} transactions - 交易记录数组
   * @returns {Object} 趋势分析
   */
  static analyzeTrends (transactions) {
    const earnTransactions = transactions.filter(t => t.transaction_type === 'earn')
    const consumeTransactions = transactions.filter(t => t.transaction_type === 'consume')

    const totalEarned = earnTransactions.reduce((sum, t) => sum + parseFloat(t.points_amount), 0)
    const totalConsumed = consumeTransactions.reduce(
      (sum, t) => sum + Math.abs(parseFloat(t.points_amount)),
      0
    )

    return {
      summary: {
        total_transactions: transactions.length,
        earn_count: earnTransactions.length,
        consume_count: consumeTransactions.length,
        total_earned: totalEarned,
        total_consumed: totalConsumed,
        net_change: totalEarned - totalConsumed
      },
      patterns: {
        avg_earn_amount: earnTransactions.length > 0 ? totalEarned / earnTransactions.length : 0,
        avg_consume_amount:
          consumeTransactions.length > 0 ? totalConsumed / consumeTransactions.length : 0,
        earn_to_consume_ratio: totalConsumed > 0 ? totalEarned / totalConsumed : Infinity
      }
    }
  }
}

/**
 * 模型初始化
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {PointsTransaction} 初始化后的模型
 */
module.exports = sequelize => {
  PointsTransaction.init(
    {
      transaction_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '交易唯一标识'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
      },
      account_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '积分账户ID'
      },
      transaction_type: {
        type: DataTypes.ENUM('earn', 'consume', 'expire', 'refund'),
        allowNull: false,
        comment: '交易类型'
      },
      points_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '积分数量(统一存储正数，类型由transaction_type区分)',
        /**
         * 获取积分数量（自动转换为浮点数）
         * @returns {number} 积分数量
         */
        get () {
          const value = this.getDataValue('points_amount')
          return value ? parseFloat(value) : 0
        }
      },
      points_balance_before: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '交易前余额',
        /**
         * 获取交易前余额（自动转换为浮点数）
         * @returns {number} 交易前积分余额
         */
        get () {
          const value = this.getDataValue('points_balance_before')
          return value ? parseFloat(value) : 0
        }
      },
      points_balance_after: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '交易后余额',
        /**
         * 获取交易后余额（自动转换为浮点数）
         * @returns {number} 交易后积分余额
         */
        get () {
          const value = this.getDataValue('points_balance_after')
          return value ? parseFloat(value) : 0
        }
      },
      business_type: {
        type: DataTypes.ENUM(
          'task_complete',
          'lottery_consume',
          'admin_adjust',
          'refund',
          'expire',
          'behavior_reward',
          'recommendation_bonus',
          'activity_bonus',
          'consumption_reward',
          'premium_unlock'
        ), // 高级空间解锁（用于记录高级空间解锁的积分交易）
        allowNull: false,
        comment: '业务类型'
      },
      source_type: {
        type: DataTypes.ENUM('system', 'user', 'admin', 'api', 'batch'),
        allowNull: true,
        defaultValue: 'system',
        comment: '积分来源类型'
      },
      business_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '关联业务ID'
      },
      reference_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '关联业务类型（如：consumption_record、lottery_draw等）'
      },
      reference_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '关联业务ID（如：consumption_records.record_id）'
      },
      reference_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '业务参考数据'
      },
      behavior_context: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '行为上下文数据'
      },
      trigger_event: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '触发事件类型'
      },
      recommendation_source: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '推荐来源'
      },
      transaction_title: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '交易标题'
      },
      transaction_description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '交易描述'
      },
      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '操作员ID'
      },
      transaction_time: {
        type: DataTypes.DATE(3),
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment: '交易时间(毫秒精度)'
      },
      effective_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效时间'
      },
      expire_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '过期时间'
      },
      status: {
        type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'completed',
        comment: '交易状态'
      },

      failure_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '失败原因'
      },

      /*
       * ========================================
       * 软删除字段（API#7统一软删除机制）
       * ========================================
       */
      // 软删除标记（0=未删除，1=已删除）
      is_deleted: {
        type: DataTypes.TINYINT(1),
        allowNull: false,
        defaultValue: 0,
        comment: '软删除标记：0=未删除（默认），1=已删除（用户端隐藏）'
      },

      // 删除时间（软删除时记录，管理员恢复时清空）
      deleted_at: {
        type: DataTypes.DATE(3),
        allowNull: true,
        defaultValue: null,
        comment: '删除时间（软删除时记录，管理员恢复时清空），时区：北京时间（GMT+8）'
      }
    },
    {
      sequelize,
      modelName: 'PointsTransaction',
      tableName: 'points_transactions',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      comment: '积分交易记录表',
      indexes: [
        { fields: ['user_id', 'transaction_time'], name: 'idx_pt_user_time' },
        { fields: ['transaction_type'], name: 'idx_pt_transaction_type' },
        { fields: ['business_type'], name: 'idx_pt_business_type' },
        { fields: ['status'], name: 'idx_pt_status' },
        { fields: ['transaction_time'], name: 'idx_pt_transaction_time' },
        { fields: ['account_id'], name: 'idx_pt_account_id' }
      ]
    }
  )

  /*
   * ========== Sequelize Scope 定义 ==========
   * 基于实际业务需求，避免过度设计
   */

  /**
   * Scope: successful
   * 业务含义：查询成功的积分交易
   * 等价SQL: WHERE status = 'completed'
   *
   * 使用示例：
   * await PointsTransaction.scope('successful').findAll()
   */
  PointsTransaction.addScope('successful', {
    where: { status: 'completed' }
  })

  /**
   * Scope: byUser
   * 业务含义：查询指定用户的积分交易
   *
   * 使用示例：
   * await PointsTransaction.scope({ method: ['byUser', user_id] }).findAll()
   * await PointsTransaction.scope('successful', { method: ['byUser', user_id] }).findAll()
   */
  PointsTransaction.addScope('byUser', user_id => ({
    where: { user_id }
  }))

  /**
   * Scope: byType
   * 业务含义：按交易类型查询
   * 支持：earn(获得), consume(消耗), expire(过期), refund(退还)
   *
   * 使用示例：
   * await PointsTransaction.scope({ method: ['byType', 'earn'] }).findAll()
   */
  PointsTransaction.addScope('byType', transactionType => ({
    where: { transaction_type: transactionType }
  }))

  return PointsTransaction
}

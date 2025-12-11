/**
 * 🔥 用户积分账户模型 - 全新分离式架构
 * 创建时间：2025年08月19日 UTC
 * 特点：领域驱动设计 + 高性能索引优化
 * 描述：用户积分账户的完整管理，专注于积分余额和账户状态管理
 *
 * ✅ 架构重构说明（2025-12-10）：
 * - 业务逻辑方法已迁移到 PointsService 服务层
 * - Model 层只保留：字段定义、关联、基础校验
 * - 符合架构规范：Model 层纯净化，业务逻辑收口到 Service 层
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

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
      },
      /**
       * 冻结积分（审核中）
       * 双账户模型扩展字段 - 记录审核中的积分
       */
      frozen_points: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '冻结积分（审核中）',
        /**
         * 获取冻结积分的浮点数值
         * @returns {number} 冻结积分（浮点数格式）
         */
        get () {
          const value = this.getDataValue('frozen_points')
          return value ? parseFloat(value) : 0
        }
      },
      /**
       * 预算积分总额（系统内部，用户不可见）
       * 双账户模型核心字段 - 控制用户能中什么奖品
       */
      budget_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '预算积分总额（系统内部）'
      },
      /**
       * 剩余预算积分（系统内部，用户不可见）
       * 双账户模型核心字段 - 用于抽奖时筛选奖品池
       */
      remaining_budget_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '剩余预算积分（系统内部）'
      },
      /**
       * 已用预算积分（系统内部，用户不可见）
       * 双账户模型核心字段 - 记录已消耗的预算积分
       */
      used_budget_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '已用预算积分（系统内部）'
      },
      /**
       * 总抽奖次数（统计字段）
       */
      total_draw_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总抽奖次数'
      },
      /**
       * 总兑换次数（统计字段）
       */
      total_redeem_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总兑换次数'
      },
      /**
       * 中奖次数（统计字段）
       */
      won_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '中奖次数'
      },
      /**
       * 最后抽奖时间
       */
      last_draw_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后抽奖时间'
      },
      /**
       * 最后兑换时间
       */
      last_redeem_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后兑换时间'
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

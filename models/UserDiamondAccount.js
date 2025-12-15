/**
 * 用户钻石账户模型 - 钻石系统核心余额表
 * 创建时间：2025-12-15 16:56:24 (北京时间)
 * 版本号：v4.5.0-material-system
 *
 * 功能描述：
 * - 记录每个用户的钻石（DIAMOND）余额
 * - 钻石作为虚拟价值货币，用于交易市场的计价/结算/手续费
 * - 对齐积分账户模式（余额表+流水表），支持事务性操作和行级锁
 *
 * 架构设计：
 * - Model层只负责：字段定义、关联、基础校验
 * - 业务逻辑在Service层处理（DiamondService）
 * - 符合领域驱动设计（DDD）原则
 *
 * 关联关系：
 * - User：一对一（一个用户只有一个钻石账户）
 * - DiamondTransaction：一对多（一个账户有多条流水）
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 用户钻石账户模型类
 * @class UserDiamondAccount
 * @extends {Model}
 */
class UserDiamondAccount extends Model {
  /**
   * 定义模型关联关系
   * @param {Object} models - 所有Sequelize模型的集合
   * @returns {void}
   */
  static associate (models) {
    // 一对一：一个用户只有一个钻石账户
    UserDiamondAccount.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      comment: '关联用户信息'
    })

    // 一对多：一个账户有多条流水记录
    UserDiamondAccount.hasMany(models.DiamondTransaction, {
      foreignKey: 'user_id',
      as: 'transactions',
      comment: '钻石流水记录'
    })
  }
}

/**
 * 初始化用户钻石账户模型
 * @param {Sequelize} sequelize - Sequelize实例
 * @returns {typeof UserDiamondAccount} 初始化后的模型类
 */
module.exports = sequelize => {
  UserDiamondAccount.init(
    {
      // 主键：账户ID
      account_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: '账户ID（主键，自增）'
      },

      // 用户ID（外键，唯一约束）
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        comment: '用户ID（关联users.user_id，唯一约束：一个用户只有一个钻石账户）'
      },

      // 钻石余额
      balance: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '钻石余额（正整数）'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间（北京时间）'
      },

      // 更新时间
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间（北京时间）'
      }
    },
    {
      sequelize,
      modelName: 'UserDiamondAccount',
      tableName: 'user_diamond_accounts',
      timestamps: true,
      underscored: true,
      comment: '用户钻石账户表（记录每个用户的钻石余额）',
      indexes: [
        {
          name: 'uk_user_id',
          unique: true,
          fields: ['user_id']
        },
        {
          name: 'idx_balance',
          fields: ['balance']
        }
      ]
    }
  )

  return UserDiamondAccount
}
